using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> GetByTokenAsync(string token, CancellationToken ct = default);
    Task AddAsync(RefreshToken token, CancellationToken ct = default);
    Task RevokeAsync(RefreshToken token, string? replacedByToken = null, CancellationToken ct = default);
    Task RevokeAllUserTokensAsync(int userId, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
