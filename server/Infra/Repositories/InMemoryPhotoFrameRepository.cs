using System.Collections.Concurrent;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryPhotoFrameRepository : IPhotoFrameRepository
{
    private readonly ConcurrentDictionary<int, PhotoFrame> _frames = new();
    private int _idCounter = 0;

    public Task<List<PhotoFrame>> GetAllAsync(
        string? layoutId = null,
        int? categoryId = null,
        bool onlyActive = false,
        CancellationToken ct = default)
    {
        var list = _frames.Values.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(layoutId))
        {
            list = list.Where(f => f.LayoutId == layoutId);
        }
        if (categoryId.HasValue)
        {
            list = list.Where(f => f.CategoryId == categoryId.Value);
        }
        if (onlyActive)
        {
            list = list.Where(f => f.IsActive);
        }
        return Task.FromResult(list.OrderBy(f => f.DisplayOrder).ThenByDescending(f => f.CreatedAt).ToList());
    }

    public Task<PhotoFrame?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        _frames.TryGetValue(id, out var f);
        return Task.FromResult(f);
    }

    public Task AddAsync(PhotoFrame frame, CancellationToken ct = default)
    {
        frame.Id = Interlocked.Increment(ref _idCounter);
        _frames[frame.Id] = frame;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(PhotoFrame frame, CancellationToken ct = default)
    {
        frame.UpdatedAt = DateTime.UtcNow;
        _frames[frame.Id] = frame;
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(int id, CancellationToken ct = default)
    {
        return Task.FromResult(_frames.TryRemove(id, out _));
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
