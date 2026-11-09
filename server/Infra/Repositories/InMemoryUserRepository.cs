using System.Collections.Concurrent;
using Microsoft.AspNetCore.Identity;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryUserRepository : IUserRepository
{
    private readonly ConcurrentDictionary<int, User> _users = new();
    private int _nextId = 1;

    public InMemoryUserRepository()
    {
        // Seed default admin / admin for in-memory
        var hasher = new PasswordHasher<string>();
        var admin = new User
        {
            Id = _nextId++,
            Username = "admin",
            PasswordHash = hasher.HashPassword("admin", "admin"),
            FullName = "Quản trị viên",
            Role = "Admin",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _users[admin.Id] = admin;
    }

    public Task<User?> GetByUsernameAsync(string username, CancellationToken ct = default)
    {
        var lower = username.Trim().ToLowerInvariant();
        var user = _users.Values.FirstOrDefault(u => u.Username.ToLower() == lower && u.IsActive);
        return Task.FromResult(user);
    }

    public Task<User?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        _users.TryGetValue(id, out var user);
        if (user != null && !user.IsActive) user = null;
        return Task.FromResult(user);
    }

    public Task<User> CreateAsync(User user, CancellationToken ct = default)
    {
        user.Id = Interlocked.Increment(ref _nextId);
        _users[user.Id] = user;
        return Task.FromResult(user);
    }

    public Task UpdateAsync(User user, CancellationToken ct = default)
    {
        _users[user.Id] = user;
        return Task.CompletedTask;
    }
}
