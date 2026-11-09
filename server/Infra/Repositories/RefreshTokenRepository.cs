using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class RefreshTokenRepository : IRefreshTokenRepository
{
    private readonly AppDbContext _db;

    public RefreshTokenRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<RefreshToken?> GetByTokenAsync(string token, CancellationToken ct = default)
    {
        return await _db.RefreshTokens
            .Include(r => r.User)
            .FirstOrDefaultAsync(r => r.Token == token, ct);
    }

    public async Task AddAsync(RefreshToken token, CancellationToken ct = default)
    {
        await _db.RefreshTokens.AddAsync(token, ct);
    }

    public async Task RevokeAsync(RefreshToken token, string? replacedByToken = null, CancellationToken ct = default)
    {
        token.RevokedAt = DateTime.UtcNow;
        token.ReplacedByToken = replacedByToken;
        _db.RefreshTokens.Update(token);
        await Task.CompletedTask;
    }

    public async Task RevokeAllUserTokensAsync(int userId, CancellationToken ct = default)
    {
        var activeTokens = await _db.RefreshTokens
            .Where(r => r.UserId == userId && r.RevokedAt == null && r.ExpiresAt > DateTime.UtcNow)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        foreach (var t in activeTokens)
        {
            t.RevokedAt = now;
        }

        if (activeTokens.Count > 0)
        {
            _db.RefreshTokens.UpdateRange(activeTokens);
        }
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
