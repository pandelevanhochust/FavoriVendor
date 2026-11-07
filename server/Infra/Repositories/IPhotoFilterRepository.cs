using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface IPhotoFilterRepository
{
    Task<List<PhotoFilter>> GetAllAsync(
        string? category = null,
        bool onlyActive = false,
        CancellationToken ct = default);

    Task<PhotoFilter?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<PhotoFilter?> GetByCodeAsync(string code, CancellationToken ct = default);
    Task AddAsync(PhotoFilter filter, CancellationToken ct = default);
    Task UpdateAsync(PhotoFilter filter, CancellationToken ct = default);
    Task<bool> DeleteAsync(int id, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
