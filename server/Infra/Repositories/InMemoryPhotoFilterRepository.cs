using System.Collections.Concurrent;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryPhotoFilterRepository : IPhotoFilterRepository
{
    private readonly ConcurrentDictionary<int, PhotoFilter> _filters = new();
    private int _idCounter = 0;

    public InMemoryPhotoFilterRepository()
    {
        var seedFilters = new[]
        {
            new PhotoFilter
            {
                Code = "original",
                Name = "Ảnh Gốc (Natural)",
                Category = "General",
                Type = "Preset",
                IntensityDefault = 1.0f,
                DisplayOrder = 1,
                IsActive = true
            },
            new PhotoFilter
            {
                Code = "classic_bw",
                Name = "Đen Trắng Cổ Điển (Classic B&W)",
                Category = "Black & White",
                Type = "Preset",
                IntensityDefault = 1.0f,
                ConfigJson = "{\"grayscale\":1.0,\"contrast\":1.2}",
                DisplayOrder = 2,
                IsActive = true
            },
            new PhotoFilter
            {
                Code = "korean_soft",
                Name = "Hàn Quốc Trong Trẻo (Korean Glow)",
                Category = "Natural",
                Type = "Preset",
                IntensityDefault = 0.9f,
                ConfigJson = "{\"brightness\":0.05,\"contrast\":0.95,\"saturation\":1.1}",
                DisplayOrder = 3,
                IsActive = true
            },
            new PhotoFilter
            {
                Code = "vintage_warm",
                Name = "Màu Phim Hoài Niệm (Vintage Warm)",
                Category = "Film",
                Type = "Preset",
                IntensityDefault = 0.85f,
                ConfigJson = "{\"sepia\":0.3,\"contrast\":1.1,\"saturation\":0.9}",
                DisplayOrder = 4,
                IsActive = true
            }
        };

        foreach (var f in seedFilters)
        {
            f.Id = Interlocked.Increment(ref _idCounter);
            _filters[f.Id] = f;
        }
    }

    public Task<List<PhotoFilter>> GetAllAsync(
        string? category = null,
        bool onlyActive = false,
        CancellationToken ct = default)
    {
        var list = _filters.Values.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(category))
        {
            list = list.Where(f => f.Category == category);
        }

        if (onlyActive)
        {
            list = list.Where(f => f.IsActive);
        }

        return Task.FromResult(list.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Id).ToList());
    }

    public Task<PhotoFilter?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        _filters.TryGetValue(id, out var f);
        return Task.FromResult(f);
    }

    public Task<PhotoFilter?> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        var f = _filters.Values.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult(f);
    }

    public Task AddAsync(PhotoFilter filter, CancellationToken ct = default)
    {
        filter.Id = Interlocked.Increment(ref _idCounter);
        _filters[filter.Id] = filter;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(PhotoFilter filter, CancellationToken ct = default)
    {
        filter.UpdatedAt = DateTime.UtcNow;
        _filters[filter.Id] = filter;
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(int id, CancellationToken ct = default)
    {
        return Task.FromResult(_filters.TryRemove(id, out _));
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
