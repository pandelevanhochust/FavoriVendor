using Microsoft.EntityFrameworkCore;

namespace VietQrKiosk.Server.Infra.Repositories;

public class OrderRepository : IOrderRepository
{
    private readonly IDbContextFactory<KioskDbContext> _factory;

    public OrderRepository(IDbContextFactory<KioskDbContext> factory)
    {
        _factory = factory;
    }

    public async Task CreateAsync(Order order, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
    }

    public async Task<Order?> GetByIdAsync(string orderId, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        return await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == orderId, ct);
    }

    public async Task UpdateQrInfoAsync(string orderId, string qrCode, string qrContent, string? qrToken, string? transactionRefId, DateTime expiresAt, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        await db.Orders.Where(x => x.OrderId == orderId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.QrCode, qrCode)
                .SetProperty(x => x.QrContent, qrContent)
                .SetProperty(x => x.QrToken, qrToken)
                .SetProperty(x => x.TransactionRefId, transactionRefId)
                .SetProperty(x => x.ExpiresAt, expiresAt), ct);
    }

    public async Task<Order?> TryCancelAsync(string orderId, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        var order = await db.Orders.FirstOrDefaultAsync(x => x.OrderId == orderId, ct);
        if (order == null) return null;

        if (order.Status == OrderStatus.Pending)
        {
            order.Status = OrderStatus.Cancelled;
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                return await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == orderId, ct);
            }
        }
        return order;
    }

    public async Task<bool> CancelQuietlyAsync(string orderId, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        var affected = await db.Orders.Where(x => x.OrderId == orderId && x.Status == OrderStatus.Pending)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, OrderStatus.Cancelled), ct);
        return affected > 0;
    }

    public async Task<Order?> FindMatchingOrderAsync(string? orderId, string? qrToken, string? qrContent, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        if (!string.IsNullOrWhiteSpace(orderId))
        {
            var id = orderId.Trim();
            var byId = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == id, ct);
            if (byId != null) return byId;
        }

        if (!string.IsNullOrWhiteSpace(qrToken))
        {
            var tok = qrToken.Trim().ToUpper();
            var byToken = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.QrToken == tok, ct);
            if (byToken != null) return byToken;
        }

        if (!string.IsNullOrWhiteSpace(qrContent))
        {
            var content = qrContent.Trim().ToUpper();
            var byContent = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.QrContent.ToUpper() == content, ct);
            if (byContent != null) return byContent;
        }

        return null;
    }

    public async Task<bool> TryMarkPaidAsync(string orderId, string bankTransactionId, DateTime paidAt, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        var affected = await db.Orders.Where(x => x.OrderId == orderId && x.Status == OrderStatus.Pending)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status, OrderStatus.Paid)
                .SetProperty(x => x.PaidAt, paidAt)
                .SetProperty(x => x.BankTransactionId, bankTransactionId), ct);
        return affected > 0;
    }

    public async Task MarkReviewAsync(string orderId, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        await db.Orders.Where(x => x.OrderId == orderId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, OrderStatus.Review), ct);
    }

    public async Task<List<Order>> GetExpiredPendingOrdersAsync(DateTime now, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        return await db.Orders.AsNoTracking()
            .Where(x => x.Status == OrderStatus.Pending && x.ExpiresAt < now)
            .ToListAsync(ct);
    }

    public async Task<bool> TryMarkExpiredAsync(string orderId, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        var affected = await db.Orders.Where(x => x.OrderId == orderId && x.Status == OrderStatus.Pending)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, OrderStatus.Expired), ct);
        return affected > 0;
    }

    public async Task<List<Order>> GetDueForReconcileAsync(DateTime pendingFirstCheck, DateTime pendingRecheck, DateTime lateWindowStart, DateTime lateRecheck, int limit, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        return await db.Orders.AsNoTracking()
            .Where(o => o.QrCode != "" && o.ReconcileCount < 40 &&
                ((o.Status == OrderStatus.Pending && o.CreatedAt <= pendingFirstCheck
                    && (o.LastReconcileAt == null || o.LastReconcileAt <= pendingRecheck))
                || ((o.Status == OrderStatus.Expired || o.Status == OrderStatus.Cancelled)
                    && o.ExpiresAt >= lateWindowStart
                    && (o.LastReconcileAt == null || o.LastReconcileAt <= lateRecheck))))
            .OrderBy(o => o.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
    }

    public async Task RecordReconcileAttemptAsync(string orderId, DateTime timestamp, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        await db.Orders.Where(x => x.OrderId == orderId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.LastReconcileAt, (DateTime?)timestamp)
                .SetProperty(x => x.ReconcileCount, x => x.ReconcileCount + 1), ct);
    }
}
