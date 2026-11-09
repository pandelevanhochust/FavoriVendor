using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class UserRepository : IUserRepository
{
    private readonly AppDbContext _db;

    public UserRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<User?> GetByUsernameAsync(string username, CancellationToken ct = default)
    {
        var lower = username.Trim().ToLowerInvariant();
        return await _db.Users
            .FirstOrDefaultAsync(u => u.Username.ToLower() == lower && u.IsActive, ct);
    }

    public async Task<User?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        return await _db.Users
            .FirstOrDefaultAsync(u => u.Id == id && u.IsActive, ct);
    }

    public async Task<User> CreateAsync(User user, CancellationToken ct = default)
    {
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return user;
    }

    public async Task UpdateAsync(User user, CancellationToken ct = default)
    {
        _db.Users.Update(user);
        await _db.SaveChangesAsync(ct);
    }
}
