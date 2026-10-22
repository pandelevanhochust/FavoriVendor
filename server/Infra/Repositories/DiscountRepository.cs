using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class DiscountRepository : IDiscountRepository
{
    private readonly AppDbContext _db;

    public DiscountRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<DiscountCode?> GetByCodeAsync(string code, bool asNoTracking = false, CancellationToken ct = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var query = asNoTracking ? _db.DiscountCodes.AsNoTracking() : _db.DiscountCodes;
        return await query.FirstOrDefaultAsync(d => d.Code.ToUpper() == normalized, ct);
    }

    public async Task<List<DiscountCode>> GetActiveDiscountsAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        return await _db.DiscountCodes
            .AsNoTracking()
            .Where(d => d.IsActive
                && (!d.StartDateUtc.HasValue || d.StartDateUtc <= now)
                && (!d.EndDateUtc.HasValue || d.EndDateUtc >= now)
                && (!d.UsageLimit.HasValue || d.UsedCount < d.UsageLimit.Value))
            .OrderBy(d => d.Code)
            .ToListAsync(ct);
    }

    public async Task AddAsync(DiscountCode discountCode, CancellationToken ct = default)
    {
        await _db.DiscountCodes.AddAsync(discountCode, ct);
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
