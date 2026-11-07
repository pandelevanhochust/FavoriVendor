using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class PhotoFrameRepository : IPhotoFrameRepository
{
    private readonly AppDbContext _db;

    public PhotoFrameRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<PhotoFrame>> GetAllAsync(
        string? layoutId = null,
        int? categoryId = null,
        bool onlyActive = false,
        CancellationToken ct = default)
    {
        var query = _db.PhotoFrames
            .Include(f => f.Layout)
            .Include(f => f.Category)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(layoutId))
        {
            query = query.Where(f => f.LayoutId == layoutId);
        }

        if (categoryId.HasValue)
        {
            query = query.Where(f => f.CategoryId == categoryId.Value);
        }

        if (onlyActive)
        {
            query = query.Where(f => f.IsActive);
        }

        return await query.OrderBy(f => f.DisplayOrder).ThenByDescending(f => f.CreatedAt).ToListAsync(ct);
    }

    public async Task<PhotoFrame?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        return await _db.PhotoFrames
            .Include(f => f.Layout)
            .Include(f => f.Category)
            .FirstOrDefaultAsync(f => f.Id == id, ct);
    }

    public async Task AddAsync(PhotoFrame frame, CancellationToken ct = default)
    {
        await _db.PhotoFrames.AddAsync(frame, ct);
    }

    public Task UpdateAsync(PhotoFrame frame, CancellationToken ct = default)
    {
        frame.UpdatedAt = DateTime.UtcNow;
        _db.PhotoFrames.Update(frame);
        return Task.CompletedTask;
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken ct = default)
    {
        var frame = await _db.PhotoFrames.FindAsync(new object[] { id }, ct);
        if (frame == null) return false;
        _db.PhotoFrames.Remove(frame);
        return true;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
