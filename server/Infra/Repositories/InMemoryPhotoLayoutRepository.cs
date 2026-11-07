using System.Collections.Concurrent;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryPhotoLayoutRepository : IPhotoLayoutRepository
{
    private readonly ConcurrentDictionary<string, PhotoLayout> _layouts = new();
    private readonly ConcurrentDictionary<int, PhotoCategory> _categories = new();
    private int _catIdCounter = 0;

    public InMemoryPhotoLayoutRepository()
    {
        // Seed default in-memory layouts
        var defaultLayouts = new[]
        {
            new PhotoLayout
            {
                Id = "1x4",
                Name = "Dải 4 ảnh (1x4 Strips)",
                Slug = "strip-4-cuts",
                WidthPx = 1200,
                HeightPx = 1800,
                HoleCount = 4,
                Description = "Khổ dải film dọc 4 ảnh cổ điển",
                DisplayOrder = 1,
                IsActive = true,
                PricingTiersJson = "[{\"quantity\":2,\"price\":70000},{\"quantity\":4,\"price\":100000}]"
            },
            new PhotoLayout
            {
                Id = "2x2",
                Name = "Lưới 4 ảnh vuông (2x2 Grid)",
                Slug = "grid-4-cuts",
                WidthPx = 1200,
                HeightPx = 1800,
                HoleCount = 4,
                Description = "Khổ 4 ảnh bố cục lưới 2x2 hiện đại",
                DisplayOrder = 2,
                IsActive = true,
                PricingTiersJson = "[{\"quantity\":2,\"price\":70000},{\"quantity\":4,\"price\":100000}]"
            },
            new PhotoLayout
            {
                Id = "2x3",
                Name = "Lưới 6 ảnh (2x3 Postcard)",
                Slug = "postcard-6-cuts",
                WidthPx = 1200,
                HeightPx = 1800,
                HoleCount = 6,
                Description = "Khổ bưu thiếp 6 ảnh chi tiết",
                DisplayOrder = 3,
                IsActive = true,
                PricingTiersJson = "[{\"quantity\":2,\"price\":80000},{\"quantity\":4,\"price\":120000}]"
            }
        };

        foreach (var l in defaultLayouts)
        {
            _layouts[l.Id] = l;
        }

        var defaultCats = new[]
        {
            new PhotoCategory { Id = 1, Name = "Hot Trend", Slug = "hot-trend", Icon = "FireOutlined", DisplayOrder = 1, IsActive = true },
            new PhotoCategory { Id = 2, Name = "Sinh nhật", Slug = "birthday", Icon = "GiftOutlined", DisplayOrder = 2, IsActive = true },
            new PhotoCategory { Id = 3, Name = "Vintage", Slug = "vintage", Icon = "CameraOutlined", DisplayOrder = 3, IsActive = true }
        };

        foreach (var c in defaultCats)
        {
            _categories[c.Id] = c;
            _catIdCounter = Math.Max(_catIdCounter, c.Id);
        }
    }

    public Task<List<PhotoLayout>> GetAllAsync(bool onlyActive = false, CancellationToken ct = default)
    {
        var list = _layouts.Values.AsEnumerable();
        if (onlyActive) list = list.Where(l => l.IsActive);
        return Task.FromResult(list.OrderBy(l => l.DisplayOrder).ToList());
    }

    public Task<PhotoLayout?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        _layouts.TryGetValue(id, out var l);
        return Task.FromResult(l);
    }

    public Task AddAsync(PhotoLayout layout, CancellationToken ct = default)
    {
        _layouts[layout.Id] = layout;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(PhotoLayout layout, CancellationToken ct = default)
    {
        layout.UpdatedAt = DateTime.UtcNow;
        _layouts[layout.Id] = layout;
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string id, CancellationToken ct = default)
    {
        return Task.FromResult(_layouts.TryRemove(id, out _));
    }

    public Task<List<PhotoCategory>> GetCategoriesAsync(bool onlyActive = false, CancellationToken ct = default)
    {
        var list = _categories.Values.AsEnumerable();
        if (onlyActive) list = list.Where(c => c.IsActive);
        return Task.FromResult(list.OrderBy(c => c.DisplayOrder).ToList());
    }

    public Task<PhotoCategory?> GetCategoryByIdAsync(int id, CancellationToken ct = default)
    {
        _categories.TryGetValue(id, out var c);
        return Task.FromResult(c);
    }

    public Task AddCategoryAsync(PhotoCategory category, CancellationToken ct = default)
    {
        category.Id = Interlocked.Increment(ref _catIdCounter);
        _categories[category.Id] = category;
        return Task.CompletedTask;
    }

    public Task UpdateCategoryAsync(PhotoCategory category, CancellationToken ct = default)
    {
        _categories[category.Id] = category;
        return Task.CompletedTask;
    }

    public Task<bool> DeleteCategoryAsync(int id, CancellationToken ct = default)
    {
        return Task.FromResult(_categories.TryRemove(id, out _));
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
