using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/presets")]
[Tags("Presets")]
public class PresetsController : ControllerBase
{
    private readonly IPhotoFilterRepository _filterRepo;
    private readonly IStorageService _storageService;
    private readonly ILogger<PresetsController> _logger;

    public PresetsController(
        IPhotoFilterRepository filterRepo,
        IStorageService storageService,
        ILogger<PresetsController> logger)
    {
        _filterRepo = filterRepo;
        _storageService = storageService;
        _logger = logger;
    }

    /// <remarks>
    /// Retrieves a list of photo filters with optional category and active status filters.
    /// </remarks>
    /// <param name="category" example="Vintage">Optional filter category name (e.g. Vintage, Film, B&amp;W, Mood, General).</param>
    /// <param name="onlyActive" example="false">If true, returns only active filters enabled for kiosk display.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>List of PhotoFilterDto items.</returns>
    [HttpGet]
    public async Task<ActionResult<List<PhotoFilterDto>>> GetAll(
        [FromQuery] string? category = null,
        [FromQuery] bool onlyActive = false,
        CancellationToken ct = default)
    {
        var filters = await _filterRepo.GetAllAsync(category, onlyActive, ct);
        return Ok(filters.Select(MapToDto).ToList());
    }

    /// <remarks>
    /// Retrieves a specific photo filter by its unique integer identifier.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the filter.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Matching PhotoFilterDto.</returns>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<PhotoFilterDto>> GetById(int id, CancellationToken ct = default)
    {
        var filter = await _filterRepo.GetByIdAsync(id, ct);
        if (filter == null) return NotFound(new ErrorBody($"Filter with id={id} not found"));
        return Ok(MapToDto(filter));
    }

    /// <remarks>
    /// Creates and uploads a new photo filter (LUT file and thumbnail).
    /// </remarks>
    /// <param name="code" example="film_grain_01">Unique code identifier for the filter (e.g. film_grain_01, vintage_warm).</param>
    /// <param name="name" example="Warm Film Grain">Display name shown on the kiosk interface.</param>
    /// <param name="category" example="Film">Filter category (e.g. Vintage, Film, B&amp;W, General).</param>
    /// <param name="type" example="LUT">Filter type. Allowed Enum values: 'LUT', 'Preset'.</param>
    /// <param name="intensityDefault" example="1.0">Default filter intensity (range: 0.0 to 1.0, default: 1.0).</param>
    /// <param name="displayOrder" example="0">Sorting priority index.</param>
    /// <param name="isActive" example="true">Whether the filter is active and visible to customers.</param>
    /// <param name="configJson" example="{}">Optional JSON configuration for preset adjustments (brightness, contrast, grain).</param>
    /// <param name="lutFile">LUT image file in .PNG or .CUBE format.</param>
    /// <param name="thumbnailFile">Preview thumbnail image file.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Created PhotoFilterDto.</returns>
    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoFilterDto>> Create(
        [FromForm] string code,
        [FromForm] string name,
        [FromForm] string? category = "General",
        [FromForm] string? type = "LUT",
        [FromForm] float intensityDefault = 1.0f,
        [FromForm] int displayOrder = 0,
        [FromForm] bool isActive = true,
        [FromForm] string? configJson = null,
        [FromForm] IFormFile? lutFile = null,
        [FromForm] IFormFile? thumbnailFile = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name))
        {
            return BadRequest(new ErrorBody("Code and Name cannot be empty."));
        }

        var cleanCode = code.Trim().ToLowerInvariant().Replace(" ", "_");
        var existing = await _filterRepo.GetByCodeAsync(cleanCode, ct);
        if (existing != null)
        {
            return Conflict(new ErrorBody($"Filter code '{cleanCode}' already exists in the system."));
        }

        var filterType = string.Equals(type, "Preset", StringComparison.OrdinalIgnoreCase) ? "Preset" : "LUT";

        string? lutUrl = null;
        if (lutFile != null && lutFile.Length > 0)
        {
            var ext = Path.GetExtension(lutFile.FileName).ToLowerInvariant();
            if (ext != ".png" && ext != ".cube")
            {
                return BadRequest(new ErrorBody("LUT file must have .PNG or .CUBE extension."));
            }

            using var stream = lutFile.OpenReadStream();
            lutUrl = await _storageService.UploadFileAsync(stream, lutFile.FileName, "image/png", "filters", ct);
        }
        else if (filterType == "LUT")
        {
            return BadRequest(new ErrorBody("LUT filters require a LUT PNG file upload."));
        }

        string? thumbUrl = null;
        if (thumbnailFile != null && thumbnailFile.Length > 0)
        {
            using var stream = thumbnailFile.OpenReadStream();
            thumbUrl = await _storageService.UploadFileAsync(stream, thumbnailFile.FileName, thumbnailFile.ContentType, "filters/thumbs", ct);
        }

        var filter = new PhotoFilter
        {
            Code = cleanCode,
            Name = name.Trim(),
            Category = string.IsNullOrWhiteSpace(category) ? "General" : category.Trim(),
            Type = filterType,
            LutUrl = lutUrl,
            ThumbnailUrl = thumbUrl,
            IntensityDefault = Math.Clamp(intensityDefault, 0.0f, 1.0f),
            ConfigJson = configJson?.Trim(),
            IsActive = isActive,
            DisplayOrder = displayOrder,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _filterRepo.AddAsync(filter, ct);
        await _filterRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Created new filter: {Code} ({Name})", filter.Code, filter.Name);
        return CreatedAtAction(nameof(GetById), new { id = filter.Id }, MapToDto(filter));
    }

    /// <remarks>
    /// Updates an existing photo filter configuration, LUT file, or thumbnail.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the filter.</param>
    /// <param name="name" example="Warm Film Grain Updated">Updated display name.</param>
    /// <param name="category" example="Film">Updated category name.</param>
    /// <param name="type" example="LUT">Filter type ('LUT' or 'Preset').</param>
    /// <param name="intensityDefault" example="0.8">Updated default intensity.</param>
    /// <param name="displayOrder" example="1">Updated display order.</param>
    /// <param name="isActive" example="true">Updated visibility status.</param>
    /// <param name="configJson" example="{}">Updated config JSON.</param>
    /// <param name="lutFile">Replacement LUT file (optional).</param>
    /// <param name="thumbnailFile">Replacement thumbnail file (optional).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Updated PhotoFilterDto.</returns>
    [HttpPut("{id:int}")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoFilterDto>> Update(
        int id,
        [FromForm] string name,
        [FromForm] string? category = null,
        [FromForm] string? type = null,
        [FromForm] float? intensityDefault = null,
        [FromForm] int? displayOrder = null,
        [FromForm] bool? isActive = null,
        [FromForm] string? configJson = null,
        [FromForm] IFormFile? lutFile = null,
        [FromForm] IFormFile? thumbnailFile = null,
        CancellationToken ct = default)
    {
        var filter = await _filterRepo.GetByIdAsync(id, ct);
        if (filter == null) return NotFound(new ErrorBody($"Filter with id={id} not found"));

        filter.Name = name.Trim();
        if (!string.IsNullOrWhiteSpace(category)) filter.Category = category.Trim();
        if (!string.IsNullOrWhiteSpace(type)) filter.Type = type.Trim();
        if (intensityDefault.HasValue) filter.IntensityDefault = Math.Clamp(intensityDefault.Value, 0.0f, 1.0f);
        if (displayOrder.HasValue) filter.DisplayOrder = displayOrder.Value;
        if (isActive.HasValue) filter.IsActive = isActive.Value;
        if (configJson != null) filter.ConfigJson = configJson.Trim();

        if (lutFile != null && lutFile.Length > 0)
        {
            var oldLut = filter.LutUrl;
            using var stream = lutFile.OpenReadStream();
            filter.LutUrl = await _storageService.UploadFileAsync(stream, lutFile.FileName, "image/png", "filters", ct);

            if (!string.IsNullOrWhiteSpace(oldLut) && oldLut != filter.LutUrl)
            {
                _ = _storageService.DeleteFileAsync(oldLut, ct);
            }
        }

        if (thumbnailFile != null && thumbnailFile.Length > 0)
        {
            var oldThumb = filter.ThumbnailUrl;
            using var stream = thumbnailFile.OpenReadStream();
            filter.ThumbnailUrl = await _storageService.UploadFileAsync(stream, thumbnailFile.FileName, thumbnailFile.ContentType, "filters/thumbs", ct);

            if (!string.IsNullOrWhiteSpace(oldThumb) && oldThumb != filter.ThumbnailUrl)
            {
                _ = _storageService.DeleteFileAsync(oldThumb, ct);
            }
        }

        await _filterRepo.UpdateAsync(filter, ct);
        await _filterRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Updated filter: {Code} ({Id})", filter.Code, filter.Id);
        return Ok(MapToDto(filter));
    }

    /// <remarks>
    /// Deletes a photo filter and its associated storage assets.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the filter.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
    {
        var filter = await _filterRepo.GetByIdAsync(id, ct);
        if (filter == null) return NotFound(new ErrorBody($"Filter with id={id} not found"));

        var lutUrl = filter.LutUrl;
        var thumbUrl = filter.ThumbnailUrl;

        var success = await _filterRepo.DeleteAsync(id, ct);
        if (success)
        {
            await _filterRepo.SaveChangesAsync(ct);

            if (!string.IsNullOrWhiteSpace(lutUrl)) _ = _storageService.DeleteFileAsync(lutUrl, ct);
            if (!string.IsNullOrWhiteSpace(thumbUrl)) _ = _storageService.DeleteFileAsync(thumbUrl, ct);
        }

        _logger.LogInformation("Deleted filter: {Id}", id);
        return NoContent();
    }

    private static PhotoFilterDto MapToDto(PhotoFilter entity)
    {
        return new PhotoFilterDto(
            Id: entity.Id,
            Code: entity.Code,
            Name: entity.Name,
            Category: entity.Category,
            Type: entity.Type,
            LutUrl: entity.LutUrl,
            ThumbnailUrl: entity.ThumbnailUrl,
            IntensityDefault: entity.IntensityDefault,
            ConfigJson: entity.ConfigJson,
            IsActive: entity.IsActive,
            DisplayOrder: entity.DisplayOrder,
            CreatedAt: entity.CreatedAt
        );
    }
}