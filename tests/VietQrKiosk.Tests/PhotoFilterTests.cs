using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using Xunit;

namespace VietQrKiosk.Tests;

public class PhotoFilterTests
{
    [Fact]
    public async Task PhotoFilterRepository_SeedDefaults_HasActiveFilters()
    {
        var repo = new InMemoryPhotoFilterRepository();
        var filters = await repo.GetAllAsync(onlyActive: true);

        Assert.NotEmpty(filters);
        Assert.Contains(filters, f => f.Code == "classic_bw");
        Assert.Contains(filters, f => f.Code == "original");
    }

    [Fact]
    public async Task PhotoFilterRepository_CreateAndRetrieve_Works()
    {
        var repo = new InMemoryPhotoFilterRepository();
        var filter = new PhotoFilter
        {
            Code = "test_cyberpunk",
            Name = "Cyberpunk Neon",
            Category = "Creative",
            Type = "LUT",
            LutUrl = "https://file.hihibooth.app/filters/cyberpunk.png",
            IntensityDefault = 0.8f,
            IsActive = true,
            DisplayOrder = 10
        };

        await repo.AddAsync(filter);
        var retrieved = await repo.GetByCodeAsync("test_cyberpunk");

        Assert.NotNull(retrieved);
        Assert.Equal("Cyberpunk Neon", retrieved.Name);
        Assert.Equal("LUT", retrieved.Type);
        Assert.Equal(0.8f, retrieved.IntensityDefault);
    }

    [Fact]
    public async Task PhotoFilterRepository_FilterByCategory_Works()
    {
        var repo = new InMemoryPhotoFilterRepository();
        var filmFilters = await repo.GetAllAsync(category: "Film");

        Assert.All(filmFilters, f => Assert.Equal("Film", f.Category));
    }

    [Fact]
    public async Task PhotoFilterRepository_Delete_RemovesFilter()
    {
        var repo = new InMemoryPhotoFilterRepository();
        var filter = new PhotoFilter
        {
            Code = "temp_filter",
            Name = "To be deleted",
            IsActive = true
        };

        await repo.AddAsync(filter);
        var created = await repo.GetByCodeAsync("temp_filter");
        Assert.NotNull(created);

        var deleted = await repo.DeleteAsync(created.Id);
        Assert.True(deleted);

        var shouldBeNull = await repo.GetByIdAsync(created.Id);
        Assert.Null(shouldBeNull);
    }
}
