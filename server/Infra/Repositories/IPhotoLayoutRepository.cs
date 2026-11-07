using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface IPhotoLayoutRepository
{
    Task<List<PhotoLayout>> GetAllAsync(bool onlyActive = false, CancellationToken ct = default);
    Task<PhotoLayout?> GetByIdAsync(string id, CancellationToken ct = default);
    Task AddAsync(PhotoLayout layout, CancellationToken ct = default);
    Task UpdateAsync(PhotoLayout layout, CancellationToken ct = default);
    Task<bool> DeleteAsync(string id, CancellationToken ct = default);

    Task<List<PhotoCategory>> GetCategoriesAsync(bool onlyActive = false, CancellationToken ct = default);
    Task<PhotoCategory?> GetCategoryByIdAsync(int id, CancellationToken ct = default);
    Task AddCategoryAsync(PhotoCategory category, CancellationToken ct = default);
    Task UpdateCategoryAsync(PhotoCategory category, CancellationToken ct = default);
    Task<bool> DeleteCategoryAsync(int id, CancellationToken ct = default);

    Task SaveChangesAsync(CancellationToken ct = default);
}
