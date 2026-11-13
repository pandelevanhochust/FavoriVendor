using Microsoft.AspNetCore.Authorization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/layouts")]
[Tags("Layouts")]
public class LayoutsController : ControllerBase
{
    private readonly IPhotoLayoutRepository _layoutRepo;
    private readonly IStorageService _storageService;
    private readonly ILogger<LayoutsController> _logger;

    public LayoutsController(IPhotoLayoutRepository layoutRepo, IStorageService storageService, ILogger<LayoutsController> logger)
    {
        _layoutRepo = layoutRepo;
        _storageService = storageService;
        _logger = logger;
    }

    /// <remarks>
    /// Retrieves all photo layout formats with print dimensions and pricing tiers.
    /// </remarks>
    /// <param name="onlyActive" example="false">If true, returns only active layouts enabled on the kiosk.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>List of PhotoLayoutDto items.</returns>
    [HttpGet]
    public async Task<ActionResult<List<PhotoLayoutDto>>> GetAll([FromQuery] bool onlyActive = false, CancellationToken ct = default)
    {
        var layouts = await _layoutRepo.GetAllAsync(onlyActive, ct);
        var dtos = layouts.Select(MapToDto).ToList();
        return Ok(dtos);
    }

    /// <remarks>
    /// Retrieves layout specifications by unique string code identifier.
    /// </remarks>
    /// <param name="id" example="strips_2x6">Unique layout format code (e.g. 'strips_2x6', 'grid_4x6', 'postcard_4x6').</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Matching PhotoLayoutDto details.</returns>
    [HttpGet("{id}")]
    public async Task<ActionResult<PhotoLayoutDto>> GetById(string id, CancellationToken ct = default)
    {
        var layout = await _layoutRepo.GetByIdAsync(id, ct);
        if (layout == null) return NotFound(new ErrorBody($"Photo layout '{id}' not found."));
        return Ok(MapToDto(layout));
    }

    /// <remarks>
    /// Creates a new photo print layout format with dimensions and tiered pricing.
    /// </remarks>
    /// <param name="request">Layout creation payload with dimensions in pixels and hole counts.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Created PhotoLayoutDto.</returns>
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<PhotoLayoutDto>> Create([FromBody] CreateOrUpdateLayoutRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new ErrorBody("Layout ID and Name cannot be empty."));
        }

        var existing = await _layoutRepo.GetByIdAsync(request.Id, ct);
        if (existing != null)
        {
            return Conflict(new ErrorBody($"Layout with code '{request.Id}' already exists."));
        }

        var tiersJson = request.PricingTiers != null && request.PricingTiers.Count > 0
            ? JsonSerializer.Serialize(request.PricingTiers)
            : null;

        var slug = string.IsNullOrWhiteSpace(request.Slug)
            ? request.Id.ToLowerInvariant().Replace(" ", "-")
            : request.Slug;

        var layout = new PhotoLayout
        {
            Id = request.Id.Trim(),
            Name = request.Name.Trim(),
            Slug = slug.Trim(),
            WidthPx = request.WidthPx > 0 ? request.WidthPx : 1200,
            HeightPx = request.HeightPx > 0 ? request.HeightPx : 1800,
            HoleCount = request.HoleCount > 0 ? request.HoleCount : 4,
            Description = request.Description,
            IsActive = request.IsActive,
            DisplayOrder = request.DisplayOrder,
            PricingTiersJson = tiersJson,
            CaptureCount = Math.Max(0, request.CaptureCount ?? 0),
            IsSplit = request.IsSplit ?? false,
            UseHolesAutoCapture = request.UseHolesAutoCapture ?? false,
            PreviewUrl = NormalizePreviewUrl(request.PreviewUrl),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _layoutRepo.AddAsync(layout, ct);
        await _layoutRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Created new layout: {LayoutId} ({LayoutName})", layout.Id, layout.Name);
        return CreatedAtAction(nameof(GetById), new { id = layout.Id }, MapToDto(layout));
    }

    /// <remarks>
    /// Updates an existing photo print layout configuration.
    /// </remarks>
    /// <param name="id" example="strips_2x6">Unique layout format code.</param>
    /// <param name="request">Updated layout parameters.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Updated PhotoLayoutDto.</returns>
    [HttpPut("{id}")]
    public async Task<ActionResult<PhotoLayoutDto>> Update(string id, [FromBody] CreateOrUpdateLayoutRequest request, CancellationToken ct = default)
    {
        var layout = await _layoutRepo.GetByIdAsync(id, ct);
        if (layout == null) return NotFound(new ErrorBody($"Photo layout '{id}' not found."));

        var tiersJson = request.PricingTiers != null && request.PricingTiers.Count > 0
            ? JsonSerializer.Serialize(request.PricingTiers)
            : null;

        layout.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.Slug)) layout.Slug = request.Slug.Trim();
        if (request.WidthPx > 0) layout.WidthPx = request.WidthPx;
        if (request.HeightPx > 0) layout.HeightPx = request.HeightPx;
        if (request.HoleCount > 0) layout.HoleCount = request.HoleCount;
        layout.Description = request.Description;
        layout.IsActive = request.IsActive;
        layout.DisplayOrder = request.DisplayOrder;
        layout.PricingTiersJson = tiersJson;
        if (request.CaptureCount.HasValue) layout.CaptureCount = Math.Max(0, request.CaptureCount.Value);
        if (request.IsSplit.HasValue) layout.IsSplit = request.IsSplit.Value;
        if (request.UseHolesAutoCapture.HasValue) layout.UseHolesAutoCapture = request.UseHolesAutoCapture.Value;
        string? replacedPreview = null;
        if (request.PreviewUrl != null)
        {
            var nextPreview = NormalizePreviewUrl(request.PreviewUrl);
            if (nextPreview != layout.PreviewUrl) replacedPreview = layout.PreviewUrl;
            layout.PreviewUrl = nextPreview;
        }
        layout.UpdatedAt = DateTime.UtcNow;

        await _layoutRepo.UpdateAsync(layout, ct);
        await _layoutRepo.SaveChangesAsync(ct);

        DeleteUploadedPreview(replacedPreview, ct);

        _logger.LogInformation("Updated layout: {LayoutId}", layout.Id);
        return Ok(MapToDto(layout));
    }

    /// <remarks>
    /// Uploads a custom preview image for a layout and stores its URL in PreviewUrl.
    /// </remarks>
    /// <param name="id" example="1x4">Unique layout format code.</param>
    /// <param name="file">Preview image (.png, .jpg, .jpeg, .webp), max 5 MB.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Updated PhotoLayoutDto.</returns>
    [HttpPost("{id}/preview")]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoLayoutDto>> UploadPreview(string id, [FromForm] IFormFile file, CancellationToken ct = default)
    {
        var layout = await _layoutRepo.GetByIdAsync(id, ct);
        if (layout == null) return NotFound(new ErrorBody($"Photo layout '{id}' not found."));

        if (file == null || file.Length == 0)
        {
            return BadRequest(new ErrorBody("Preview image file upload is required."));
        }
        if (file.Length > 5 * 1024 * 1024)
        {
            return BadRequest(new ErrorBody("Preview image must be 5 MB or smaller."));
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentType = ext switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => null
        };
        if (contentType == null)
        {
            return BadRequest(new ErrorBody("Preview image must be .PNG, .JPG or .WEBP."));
        }

        var oldPreview = layout.PreviewUrl;
        using (var stream = file.OpenReadStream())
        {
            layout.PreviewUrl = await _storageService.UploadFileAsync(stream, file.FileName, contentType, "layouts", ct);
        }
        layout.UpdatedAt = DateTime.UtcNow;

        await _layoutRepo.UpdateAsync(layout, ct);
        await _layoutRepo.SaveChangesAsync(ct);

        if (oldPreview != layout.PreviewUrl) DeleteUploadedPreview(oldPreview, ct);

        _logger.LogInformation("Uploaded preview for layout: {LayoutId}", layout.Id);
        return Ok(MapToDto(layout));
    }

    /// <remarks>
    /// Deletes a photo layout by code ID.
    /// </remarks>
    /// <param name="id" example="strips_2x6">Unique layout format code.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct = default)
    {
        var success = await _layoutRepo.DeleteAsync(id, ct);
        if (!success) return NotFound(new ErrorBody($"Photo layout '{id}' not found."));
        await _layoutRepo.SaveChangesAsync(ct);
        return NoContent();
    }

    private const string PresetPrefix = "preset:";

    private static string? NormalizePreviewUrl(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    // Chỉ xoá file đã tải lên; giá trị "preset:<key>" là mẫu dựng sẵn phía CMS, không có file.
    private void DeleteUploadedPreview(string? previewUrl, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(previewUrl) || previewUrl.StartsWith(PresetPrefix, StringComparison.OrdinalIgnoreCase)) return;
        _ = _storageService.DeleteFileAsync(previewUrl, ct);
    }

    private static PhotoLayoutDto MapToDto(PhotoLayout entity)
    {
        var tiers = new List<PricingTierDto>();
        if (!string.IsNullOrWhiteSpace(entity.PricingTiersJson))
        {
            try
            {
                tiers = JsonSerializer.Deserialize<List<PricingTierDto>>(entity.PricingTiersJson) ?? new();
            }
            catch
            {
                // Ignore parse errors, fallback to empty
            }
        }

        return new PhotoLayoutDto(
            Id: entity.Id,
            Name: entity.Name,
            Slug: entity.Slug,
            WidthPx: entity.WidthPx,
            HeightPx: entity.HeightPx,
            HoleCount: entity.HoleCount,
            Description: entity.Description,
            IsActive: entity.IsActive,
            DisplayOrder: entity.DisplayOrder,
            PricingTiers: tiers,
            FrameCount: entity.Frames?.Count ?? 0,
            CaptureCount: entity.CaptureCount > 0 ? entity.CaptureCount : entity.HoleCount,
            IsSplit: entity.IsSplit,
            UseHolesAutoCapture: entity.UseHolesAutoCapture,
            PreviewUrl: entity.PreviewUrl
        );
    }
}