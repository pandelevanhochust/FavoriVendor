using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class PhotoLayoutRepository : IPhotoLayoutRepository
{
    private readonly AppDbContext _db;

    public PhotoLayoutRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<PhotoLayout>> GetAllAsync(bool onlyActive = false, CancellationToken ct = default)
    {
        var query = _db.PhotoLayouts.Include(l => l.Frames).AsQueryable();
        if (onlyActive)
        {
            query = query.Where(l => l.IsActive);
        }
        return await query.OrderBy(l => l.DisplayOrder).ThenBy(l => l.Id).ToListAsync(ct);
    }

    public async Task<PhotoLayout?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        return await _db.PhotoLayouts
            .Include(l => l.Frames)
            .FirstOrDefaultAsync(l => l.Id == id, ct);
    }

    public async Task AddAsync(PhotoLayout layout, CancellationToken ct = default)
    {
        await _db.PhotoLayouts.AddAsync(layout, ct);
    }

    public Task UpdateAsync(PhotoLayout layout, CancellationToken ct = default)
    {
        layout.UpdatedAt = DateTime.UtcNow;
        _db.PhotoLayouts.Update(layout);
        return Task.CompletedTask;
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken ct = default)
    {
        var layout = await _db.PhotoLayouts.FindAsync(new object[] { id }, ct);
        if (layout == null) return false;
        _db.PhotoLayouts.Remove(layout);
        return true;
    }

    public async Task<List<PhotoCategory>> GetCategoriesAsync(bool onlyActive = false, CancellationToken ct = default)
    {
        var query = _db.PhotoCategories.Include(c => c.Frames).AsQueryable();
        if (onlyActive)
        {
            query = query.Where(c => c.IsActive);
        }
        return await query.OrderBy(c => c.DisplayOrder).ThenBy(c => c.Id).ToListAsync(ct);
    }

    public async Task<PhotoCategory?> GetCategoryByIdAsync(int id, CancellationToken ct = default)
    {
        return await _db.PhotoCategories
            .Include(c => c.Frames)
            .FirstOrDefaultAsync(c => c.Id == id, ct);
    }

    public async Task AddCategoryAsync(PhotoCategory category, CancellationToken ct = default)
    {
        await _db.PhotoCategories.AddAsync(category, ct);
    }

    public Task UpdateCategoryAsync(PhotoCategory category, CancellationToken ct = default)
    {
        _db.PhotoCategories.Update(category);
        return Task.CompletedTask;
    }

    public async Task<bool> DeleteCategoryAsync(int id, CancellationToken ct = default)
    {
        var cat = await _db.PhotoCategories.FindAsync(new object[] { id }, ct);
        if (cat == null) return false;
        _db.PhotoCategories.Remove(cat);
        return true;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
