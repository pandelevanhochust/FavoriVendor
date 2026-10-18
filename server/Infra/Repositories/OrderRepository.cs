using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class OrderRepository : IOrderRepository
{
    private readonly AppDbContext _db;

    public OrderRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<Order?> GetByIdAsync(string orderId, bool asNoTracking = false, CancellationToken ct = default)
    {
        var query = asNoTracking ? _db.Orders.AsNoTracking() : _db.Orders;
        return await query.FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
    }

    public async Task<Order?> GetByContentAsync(string content, bool asNoTracking = false, CancellationToken ct = default)
    {
        var upperContent = content.Trim().ToUpperInvariant();
        var query = asNoTracking ? _db.Orders.AsNoTracking() : _db.Orders;
        return await query.FirstOrDefaultAsync(o => o.QrContent != null && o.QrContent.ToUpper() == upperContent, ct);
    }

    public async Task AddAsync(Order order, CancellationToken ct = default)
    {
        await _db.Orders.AddAsync(order, ct);
    }

    public async Task<List<Order>> GetExpiredPendingOrdersAsync(DateTime nowUtc, CancellationToken ct = default)
    {
        return await _db.Orders
            .Where(o => o.Status == OrderStatus.Pending && o.ExpiresAt < nowUtc)
            .ToListAsync(ct);
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
