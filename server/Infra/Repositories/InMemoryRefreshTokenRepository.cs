using System.Collections.Concurrent;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryRefreshTokenRepository : IRefreshTokenRepository
{
    private readonly ConcurrentDictionary<string, RefreshToken> _tokens = new();
    private readonly IUserRepository _userRepo;
    private int _idCounter = 0;

    public InMemoryRefreshTokenRepository(IUserRepository userRepo)
    {
        _userRepo = userRepo;
    }

    public async Task<RefreshToken?> GetByTokenAsync(string token, CancellationToken ct = default)
    {
        if (_tokens.TryGetValue(token, out var rt))
        {
            if (rt.User == null)
            {
                rt.User = await _userRepo.GetByIdAsync(rt.UserId, ct);
            }
            return rt;
        }
        return null;
    }

    public Task AddAsync(RefreshToken token, CancellationToken ct = default)
    {
        token.Id = Interlocked.Increment(ref _idCounter);
        _tokens[token.Token] = token;
        return Task.CompletedTask;
    }

    public Task RevokeAsync(RefreshToken token, string? replacedByToken = null, CancellationToken ct = default)
    {
        if (_tokens.TryGetValue(token.Token, out var existing))
        {
            existing.RevokedAt = DateTime.UtcNow;
            existing.ReplacedByToken = replacedByToken;
        }
        return Task.CompletedTask;
    }

    public Task RevokeAllUserTokensAsync(int userId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        foreach (var pair in _tokens)
        {
            if (pair.Value.UserId == userId && pair.Value.RevokedAt == null && pair.Value.ExpiresAt > now)
            {
                pair.Value.RevokedAt = now;
            }
        }
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
