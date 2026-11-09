using Microsoft.AspNetCore.Authorization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/frames")]
[Tags("Frames")]
public class FramesController : ControllerBase
{
    private readonly IPhotoFrameRepository _frameRepo;
    private readonly IPhotoLayoutRepository _layoutRepo;
    private readonly IStorageService _storageService;
    private readonly ILogger<FramesController> _logger;

    public FramesController(
        IPhotoFrameRepository frameRepo,
        IPhotoLayoutRepository layoutRepo,
        IStorageService storageService,
        ILogger<FramesController> logger)
    {
        _frameRepo = frameRepo;
        _layoutRepo = layoutRepo;
        _storageService = storageService;
        _logger = logger;
    }

    /// <remarks>
    /// Retrieves a list of photo frames with optional filtering by layout ID, category ID, and active status.
    /// </remarks>
    /// <param name="layoutId" example="strips_2x6">Filter by layout format identifier (e.g. 'strips_2x6', 'grid_4x6', 'postcard_4x6').</param>
    /// <param name="categoryId" example="1">Filter by category integer identifier.</param>
    /// <param name="onlyActive" example="false">If true, returns only active frames enabled for customer selection.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>List of PhotoFrameDto items.</returns>
    [HttpGet]
    public async Task<ActionResult<List<PhotoFrameDto>>> GetAll(
        [FromQuery] string? layoutId = null,
        [FromQuery] int? categoryId = null,
        [FromQuery] bool onlyActive = false,
        CancellationToken ct = default)
    {
        var frames = await _frameRepo.GetAllAsync(layoutId, categoryId, onlyActive, ct);
        return Ok(frames.Select(MapToDto).ToList());
    }

    /// <remarks>
    /// Retrieves a specific photo frame by its unique integer identifier.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the photo frame.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Matching PhotoFrameDto details including hole coordinates.</returns>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<PhotoFrameDto>> GetById(int id, CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Photo frame with id={id} not found."));
        return Ok(MapToDto(frame));
    }

    /// <remarks>
    /// Uploads a new transparent PNG photo frame and configures its hole coordinates.
    /// </remarks>
    /// <param name="file">Transparent PNG frame image file with alpha channel.</param>
    /// <param name="layoutId" example="strips_2x6">Target layout format identifier.</param>
    /// <param name="name" example="Summer Vintage 2026">Display name for the frame.</param>
    /// <param name="categoryId" example="1">Associated category ID.</param>
    /// <param name="holesJson" example="[{&quot;x&quot;:50,&quot;y&quot;:80,&quot;width&quot;:500,&quot;height&quot;:350}]">JSON array of photo hole rectangles in pixels.</param>
    /// <param name="displayOrder" example="0">Sorting order on kiosk display.</param>
    /// <param name="isActive" example="true">Whether the frame is active and visible.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Created PhotoFrameDto.</returns>
    [HttpPost]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoFrameDto>> Create(
        [FromForm] IFormFile file,
        [FromForm] string layoutId,
        [FromForm] string name,
        [FromForm] int? categoryId = null,
        [FromForm] string? holesJson = null,
        [FromForm] int displayOrder = 0,
        [FromForm] bool isActive = true,
        CancellationToken ct = default)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new ErrorBody("Photo frame PNG file upload is required."));
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".png")
        {
            return BadRequest(new ErrorBody("Photo frames must be in transparent .PNG format with alpha channel."));
        }

        if (string.IsNullOrWhiteSpace(layoutId) || string.IsNullOrWhiteSpace(name))
        {
            return BadRequest(new ErrorBody("Layout ID and Frame Name are required."));
        }

        var layout = await _layoutRepo.GetByIdAsync(layoutId, ct);
        if (layout == null)
        {
            return BadRequest(new ErrorBody($"Layout '{layoutId}' does not exist in the system."));
        }

        string fileUrl;
        using (var stream = file.OpenReadStream())
        {
            fileUrl = await _storageService.UploadFileAsync(stream, file.FileName, "image/png", "frames", ct);
        }

        var sanitizedHoles = string.IsNullOrWhiteSpace(holesJson) ? "[]" : holesJson.Trim();

        var frame = new PhotoFrame
        {
            LayoutId = layoutId.Trim(),
            CategoryId = categoryId,
            Name = name.Trim(),
            FrameUrl = fileUrl,
            ThumbnailUrl = fileUrl,
            HolesJson = sanitizedHoles,
            DisplayOrder = displayOrder,
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _frameRepo.AddAsync(frame, ct);
        await _frameRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Created new frame: {FrameId} - {FrameName} ({StorageProvider})", frame.Id, frame.Name, _storageService.ProviderName);
        return CreatedAtAction(nameof(GetById), new { id = frame.Id }, MapToDto(frame));
    }

    /// <remarks>
    /// Updates an existing photo frame configuration or replaces its image asset.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the photo frame.</param>
    /// <param name="file">Optional replacement PNG frame image file.</param>
    /// <param name="layoutId" example="strips_2x6">Layout format identifier.</param>
    /// <param name="name" example="Summer Vintage 2026 Updated">Updated frame name.</param>
    /// <param name="categoryId" example="1">Updated category ID.</param>
    /// <param name="holesJson" example="[]">Updated photo hole coordinates JSON array.</param>
    /// <param name="displayOrder" example="1">Updated display order.</param>
    /// <param name="isActive" example="true">Updated visibility status.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Updated PhotoFrameDto.</returns>
    [HttpPut("{id:int}")]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoFrameDto>> Update(
        int id,
        [FromForm] IFormFile? file,
        [FromForm] string layoutId,
        [FromForm] string name,
        [FromForm] int? categoryId = null,
        [FromForm] string? holesJson = null,
        [FromForm] int displayOrder = 0,
        [FromForm] bool isActive = true,
        CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Photo frame with id={id} not found."));

        if (!string.IsNullOrWhiteSpace(layoutId) && layoutId != frame.LayoutId)
        {
            var layout = await _layoutRepo.GetByIdAsync(layoutId, ct);
            if (layout == null) return BadRequest(new ErrorBody($"Layout '{layoutId}' does not exist."));
            frame.LayoutId = layoutId;
        }

        frame.Name = name.Trim();
        frame.CategoryId = categoryId;
        frame.DisplayOrder = displayOrder;
        frame.IsActive = isActive;
        if (!string.IsNullOrWhiteSpace(holesJson)) frame.HolesJson = holesJson.Trim();

        if (file != null && file.Length > 0)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext != ".png")
            {
                return BadRequest(new ErrorBody("Photo frames must be in transparent .PNG format."));
            }

            var oldUrl = frame.FrameUrl;
            using (var stream = file.OpenReadStream())
            {
                frame.FrameUrl = await _storageService.UploadFileAsync(stream, file.FileName, "image/png", "frames", ct);
                frame.ThumbnailUrl = frame.FrameUrl;
            }

            if (!string.IsNullOrWhiteSpace(oldUrl) && oldUrl != frame.FrameUrl)
            {
                _ = _storageService.DeleteFileAsync(oldUrl, ct);
            }
        }

        await _frameRepo.UpdateAsync(frame, ct);
        await _frameRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Updated frame: {FrameId}", frame.Id);
        return Ok(MapToDto(frame));
    }

    /// <remarks>
    /// Deletes a photo frame and removes its associated storage assets.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the photo frame.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Photo frame with id={id} not found."));

        var fileUrl = frame.FrameUrl;
        var success = await _frameRepo.DeleteAsync(id, ct);
        if (success)
        {
            await _frameRepo.SaveChangesAsync(ct);
            if (!string.IsNullOrWhiteSpace(fileUrl))
            {
                _ = _storageService.DeleteFileAsync(fileUrl, ct);
            }
        }

        _logger.LogInformation("Deleted frame: {FrameId}", id);
        return NoContent();
    }

    private static PhotoFrameDto MapToDto(PhotoFrame entity)
    {
        var holes = new List<HoleRectDto>();
        if (!string.IsNullOrWhiteSpace(entity.HolesJson))
        {
            try
            {
                holes = JsonSerializer.Deserialize<List<HoleRectDto>>(entity.HolesJson) ?? new();
            }
            catch
            {
                // Fallback empty
            }
        }

        return new PhotoFrameDto(
            Id: entity.Id,
            LayoutId: entity.LayoutId,
            LayoutName: entity.Layout?.Name,
            CategoryId: entity.CategoryId,
            CategoryName: entity.Category?.Name,
            Name: entity.Name,
            FrameUrl: entity.FrameUrl,
            ThumbnailUrl: entity.ThumbnailUrl ?? entity.FrameUrl,
            Holes: holes,
            IsActive: entity.IsActive,
            DisplayOrder: entity.DisplayOrder,
            CreatedAt: entity.CreatedAt
        );
    }
}