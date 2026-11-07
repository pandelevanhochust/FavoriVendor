using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CategoriesController : ControllerBase
{
    private readonly IPhotoLayoutRepository _layoutRepo;
    private readonly ILogger<CategoriesController> _logger;

    public CategoriesController(IPhotoLayoutRepository layoutRepo, ILogger<CategoriesController> logger)
    {
        _layoutRepo = layoutRepo;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<PhotoCategoryDto>>> GetAll([FromQuery] bool onlyActive = false, CancellationToken ct = default)
    {
        var cats = await _layoutRepo.GetCategoriesAsync(onlyActive, ct);
        var dtos = cats.Select(c => new PhotoCategoryDto(
            Id: c.Id,
            Name: c.Name,
            Slug: c.Slug,
            Icon: c.Icon,
            DisplayOrder: c.DisplayOrder,
            IsActive: c.IsActive,
            FrameCount: c.Frames?.Count ?? 0
        )).ToList();
        return Ok(dtos);
    }

    [HttpPost]
    public async Task<ActionResult<PhotoCategoryDto>> Create([FromBody] CreateOrUpdateCategoryRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new ErrorBody("Tên danh mục không được để trống."));
        }

        var slug = string.IsNullOrWhiteSpace(request.Slug)
            ? request.Name.ToLowerInvariant().Replace(" ", "-")
            : request.Slug;

        var cat = new PhotoCategory
        {
            Name = request.Name.Trim(),
            Slug = slug.Trim(),
            Icon = request.Icon,
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        await _layoutRepo.AddCategoryAsync(cat, ct);
        await _layoutRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Created new category: {Name}", cat.Name);
        return CreatedAtAction(nameof(GetAll), new { id = cat.Id }, new PhotoCategoryDto(
            Id: cat.Id,
            Name: cat.Name,
            Slug: cat.Slug,
            Icon: cat.Icon,
            DisplayOrder: cat.DisplayOrder,
            IsActive: cat.IsActive,
            FrameCount: 0
        ));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<PhotoCategoryDto>> Update(int id, [FromBody] CreateOrUpdateCategoryRequest request, CancellationToken ct = default)
    {
        var cat = await _layoutRepo.GetCategoryByIdAsync(id, ct);
        if (cat == null) return NotFound(new ErrorBody($"Không tìm thấy danh mục có id={id}"));

        cat.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.Slug)) cat.Slug = request.Slug.Trim();
        cat.Icon = request.Icon;
        cat.DisplayOrder = request.DisplayOrder;
        cat.IsActive = request.IsActive;

        await _layoutRepo.UpdateCategoryAsync(cat, ct);
        await _layoutRepo.SaveChangesAsync(ct);

        return Ok(new PhotoCategoryDto(
            Id: cat.Id,
            Name: cat.Name,
            Slug: cat.Slug,
            Icon: cat.Icon,
            DisplayOrder: cat.DisplayOrder,
            IsActive: cat.IsActive,
            FrameCount: cat.Frames?.Count ?? 0
        ));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
    {
        var success = await _layoutRepo.DeleteCategoryAsync(id, ct);
        if (!success) return NotFound(new ErrorBody($"Không tìm thấy danh mục có id={id}"));
        await _layoutRepo.SaveChangesAsync(ct);
        return NoContent();
    }
}
