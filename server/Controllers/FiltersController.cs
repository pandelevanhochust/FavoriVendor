using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FiltersController : ControllerBase
{
    private readonly IPhotoFilterRepository _filterRepo;
    private readonly IStorageService _storageService;
    private readonly ILogger<FiltersController> _logger;

    public FiltersController(
        IPhotoFilterRepository filterRepo,
        IStorageService storageService,
        ILogger<FiltersController> logger)
    {
        _filterRepo = filterRepo;
        _storageService = storageService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<PhotoFilterDto>>> GetAll(
        [FromQuery] string? category = null,
        [FromQuery] bool onlyActive = false,
        CancellationToken ct = default)
    {
        var filters = await _filterRepo.GetAllAsync(category, onlyActive, ct);
        return Ok(filters.Select(MapToDto).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PhotoFilterDto>> GetById(int id, CancellationToken ct = default)
    {
        var filter = await _filterRepo.GetByIdAsync(id, ct);
        if (filter == null) return NotFound(new ErrorBody($"Không tìm thấy bộ lọc có id={id}"));
        return Ok(MapToDto(filter));
    }

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
            return BadRequest(new ErrorBody("Mã Code và Tên bộ lọc không được để trống."));
        }

        var cleanCode = code.Trim().ToLowerInvariant().Replace(" ", "_");
        var existing = await _filterRepo.GetByCodeAsync(cleanCode, ct);
        if (existing != null)
        {
            return Conflict(new ErrorBody($"Mã bộ lọc '{cleanCode}' đã tồn tại trong hệ thống."));
        }

        var filterType = string.Equals(type, "Preset", StringComparison.OrdinalIgnoreCase) ? "Preset" : "LUT";

        string? lutUrl = null;
        if (lutFile != null && lutFile.Length > 0)
        {
            var ext = Path.GetExtension(lutFile.FileName).ToLowerInvariant();
            if (ext != ".png" && ext != ".cube")
            {
                return BadRequest(new ErrorBody("File LUT bắt buộc phải có định dạng ảnh .PNG hoặc .CUBE."));
            }

            using var stream = lutFile.OpenReadStream();
            lutUrl = await _storageService.UploadFileAsync(stream, lutFile.FileName, "image/png", "filters", ct);
        }
        else if (filterType == "LUT")
        {
            return BadRequest(new ErrorBody("Bộ lọc loại 'LUT' bắt buộc phải tải lên file ảnh LUT PNG."));
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
        if (filter == null) return NotFound(new ErrorBody($"Không tìm thấy bộ lọc có id={id}"));

        filter.Name = name.Trim();
        if (!string.IsNullOrWhiteSpace(category)) filter.Category = category.Trim();
        if (!string.IsNullOrWhiteSpace(type)) filter.Type = type.Trim();
        if (intensityDefault.HasValue) filter.IntensityDefault = Math.Clamp(intensityDefault.Value, 0.0f, 1.0f);
        if (displayOrder.HasValue) filter.DisplayOrder = displayOrder.Value;
        if (isActive.HasValue) filter.IsActive = isActive.Value;
        if (configJson != null) filter.ConfigJson = configJson.Trim();

        // Thay file LUT nếu có upload
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

        // Thay file Thumbnail nếu có
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

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
    {
        var filter = await _filterRepo.GetByIdAsync(id, ct);
        if (filter == null) return NotFound(new ErrorBody($"Không tìm thấy bộ lọc có id={id}"));

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
