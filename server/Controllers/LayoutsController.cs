using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/layouts")]
[Tags("Layouts")]
public class LayoutsController : ControllerBase
{
    private readonly IPhotoLayoutRepository _layoutRepo;
    private readonly ILogger<LayoutsController> _logger;

    public LayoutsController(IPhotoLayoutRepository layoutRepo, ILogger<LayoutsController> logger)
    {
        _layoutRepo = layoutRepo;
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

        await _layoutRepo.UpdateAsync(layout, ct);
        await _layoutRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Updated layout: {LayoutId}", layout.Id);
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
            FrameCount: entity.Frames?.Count ?? 0
        );
    }
}