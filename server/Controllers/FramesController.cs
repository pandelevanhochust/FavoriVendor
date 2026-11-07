using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
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

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PhotoFrameDto>> GetById(int id, CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Không tìm thấy khung ảnh có id={id}"));
        return Ok(MapToDto(frame));
    }

    [HttpPost]
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
            return BadRequest(new ErrorBody("Bắt buộc phải tải lên file ảnh khung (PNG)."));
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".png")
        {
            return BadRequest(new ErrorBody("Khung ảnh bắt buộc phải có định dạng .PNG trong suốt (Alpha channel)."));
        }

        if (string.IsNullOrWhiteSpace(layoutId) || string.IsNullOrWhiteSpace(name))
        {
            return BadRequest(new ErrorBody("Vui lòng chọn Khổ ảnh (layoutId) và đặt tên cho khung ảnh."));
        }

        var layout = await _layoutRepo.GetByIdAsync(layoutId, ct);
        if (layout == null)
        {
            return BadRequest(new ErrorBody($"Khổ ảnh '{layoutId}' không tồn tại trong hệ thống."));
        }

        // Upload file qua IStorageService (Local hoặc Cloudflare R2)
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

    [HttpPut("{id:int}")]
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
        if (frame == null) return NotFound(new ErrorBody($"Không tìm thấy khung ảnh có id={id}"));

        if (!string.IsNullOrWhiteSpace(layoutId) && layoutId != frame.LayoutId)
        {
            var layout = await _layoutRepo.GetByIdAsync(layoutId, ct);
            if (layout == null) return BadRequest(new ErrorBody($"Khổ ảnh '{layoutId}' không tồn tại."));
            frame.LayoutId = layoutId;
        }

        frame.Name = name.Trim();
        frame.CategoryId = categoryId;
        frame.DisplayOrder = displayOrder;
        frame.IsActive = isActive;
        if (!string.IsNullOrWhiteSpace(holesJson)) frame.HolesJson = holesJson.Trim();

        // Nếu có upload file mới thay thế
        if (file != null && file.Length > 0)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext != ".png")
            {
                return BadRequest(new ErrorBody("Khung ảnh bắt buộc phải có định dạng .PNG trong suốt."));
            }

            var oldUrl = frame.FrameUrl;
            using (var stream = file.OpenReadStream())
            {
                frame.FrameUrl = await _storageService.UploadFileAsync(stream, file.FileName, "image/png", "frames", ct);
                frame.ThumbnailUrl = frame.FrameUrl;
            }

            // Xoá file cũ nếu thành công
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

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Không tìm thấy khung ảnh có id={id}"));

        var fileUrl = frame.FrameUrl;
        var success = await _frameRepo.DeleteAsync(id, ct);
        if (success)
        {
            await _frameRepo.SaveChangesAsync(ct);
            // Xoá file trên storage nếu có
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
