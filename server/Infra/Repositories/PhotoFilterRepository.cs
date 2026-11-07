using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class PhotoFilterRepository : IPhotoFilterRepository
{
    private readonly AppDbContext _db;

    public PhotoFilterRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<PhotoFilter>> GetAllAsync(
        string? category = null,
        bool onlyActive = false,
        CancellationToken ct = default)
    {
        var query = _db.PhotoFilters.AsQueryable();

        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(f => f.Category == category);
        }

        if (onlyActive)
        {
            query = query.Where(f => f.IsActive);
        }

        return await query.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Id).ToListAsync(ct);
    }

    public async Task<PhotoFilter?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        return await _db.PhotoFilters.FirstOrDefaultAsync(f => f.Id == id, ct);
    }

    public async Task<PhotoFilter?> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        return await _db.PhotoFilters.FirstOrDefaultAsync(f => f.Code == code, ct);
    }

    public async Task AddAsync(PhotoFilter filter, CancellationToken ct = default)
    {
        await _db.PhotoFilters.AddAsync(filter, ct);
    }

    public Task UpdateAsync(PhotoFilter filter, CancellationToken ct = default)
    {
        filter.UpdatedAt = DateTime.UtcNow;
        _db.PhotoFilters.Update(filter);
        return Task.CompletedTask;
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken ct = default)
    {
        var filter = await _db.PhotoFilters.FindAsync(new object[] { id }, ct);
        if (filter == null) return false;
        _db.PhotoFilters.Remove(filter);
        return true;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
