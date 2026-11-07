using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface IPhotoFrameRepository
{
    Task<List<PhotoFrame>> GetAllAsync(
        string? layoutId = null,
        int? categoryId = null,
        bool onlyActive = false,
        CancellationToken ct = default);

    Task<PhotoFrame?> GetByIdAsync(int id, CancellationToken ct = default);
    Task AddAsync(PhotoFrame frame, CancellationToken ct = default);
    Task UpdateAsync(PhotoFrame frame, CancellationToken ct = default);
    Task<bool> DeleteAsync(int id, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
