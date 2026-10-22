using System.Collections.Concurrent;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryDiscountRepository : IDiscountRepository
{
    private readonly ConcurrentDictionary<string, DiscountCode> _discounts = new(StringComparer.OrdinalIgnoreCase);

    public InMemoryDiscountRepository()
    {
        // Seed các mã giảm giá mặc định
        Seed(new DiscountCode
        {
            Id = 1,
            Code = "GIAM10",
            Description = "Giảm 10% tổng đơn hàng",
            Type = DiscountType.Percentage,
            Value = 10,
            MinOrderAmount = null,
            MaxDiscountAmount = null,
            UsageLimit = null,
            UsedCount = 0,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        });

        Seed(new DiscountCode
        {
            Id = 2,
            Code = "GIAM20K",
            Description = "Giảm 20.000đ cho đơn từ 50.000đ",
            Type = DiscountType.FixedAmount,
            Value = 20000,
            MinOrderAmount = 50000,
            MaxDiscountAmount = null,
            UsageLimit = 100,
            UsedCount = 0,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        });

        Seed(new DiscountCode
        {
            Id = 3,
            Code = "VIP50",
            Description = "Giảm 50% tối đa 50.000đ",
            Type = DiscountType.Percentage,
            Value = 50,
            MinOrderAmount = null,
            MaxDiscountAmount = 50000,
            UsageLimit = 50,
            UsedCount = 0,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        });
    }

    private void Seed(DiscountCode d) => _discounts[d.Code] = d;

    public Task<DiscountCode?> GetByCodeAsync(string code, bool asNoTracking = false, CancellationToken ct = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        _discounts.TryGetValue(normalized, out var d);
        return Task.FromResult(d);
    }

    public Task<List<DiscountCode>> GetActiveDiscountsAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var active = _discounts.Values
            .Where(d => d.IsActive
                && (!d.StartDateUtc.HasValue || d.StartDateUtc <= now)
                && (!d.EndDateUtc.HasValue || d.EndDateUtc >= now)
                && (!d.UsageLimit.HasValue || d.UsedCount < d.UsageLimit.Value))
            .OrderBy(d => d.Code)
            .ToList();
        return Task.FromResult(active);
    }

    public Task AddAsync(DiscountCode discountCode, CancellationToken ct = default)
    {
        _discounts[discountCode.Code.Trim().ToUpperInvariant()] = discountCode;
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
