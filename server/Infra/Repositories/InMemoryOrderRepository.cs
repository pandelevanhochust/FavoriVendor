using System.Collections.Concurrent;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryOrderRepository : IOrderRepository
{
    private readonly ConcurrentDictionary<string, Order> _orders = new(StringComparer.OrdinalIgnoreCase);

    public Task<Order?> GetByIdAsync(string orderId, bool asNoTracking = false, CancellationToken ct = default)
    {
        _orders.TryGetValue(orderId, out var order);
        return Task.FromResult(order);
    }

    public Task<Order?> GetByContentAsync(string content, bool asNoTracking = false, CancellationToken ct = default)
    {
        var upperContent = content.Trim().ToUpperInvariant();
        var order = _orders.Values.FirstOrDefault(o =>
            !string.IsNullOrEmpty(o.QrContent) && o.QrContent.ToUpperInvariant().Contains(upperContent)
            || upperContent.Contains((o.QrContent ?? "").ToUpperInvariant())
            || (!string.IsNullOrEmpty(o.OrderId) && upperContent.Contains(o.OrderId.ToUpperInvariant())));

        return Task.FromResult(order);
    }

    public Task AddAsync(Order order, CancellationToken ct = default)
    {
        _orders[order.OrderId] = order;
        return Task.CompletedTask;
    }

    public Task<List<Order>> GetExpiredPendingOrdersAsync(DateTime nowUtc, CancellationToken ct = default)
    {
        var expired = _orders.Values
            .Where(o => o.Status == OrderStatus.Pending && o.ExpiresAt < nowUtc)
            .ToList();
        return Task.FromResult(expired);
    }

    public Task<List<Order>> GetOrdersFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        OrderStatus? status = null,
        string? paymentType = null,
        int limit = 50,
        int page = 1,
        CancellationToken ct = default)
    {
        var query = _orders.Values.AsEnumerable();

        if (fromUtc.HasValue)
            query = query.Where(o => o.CreatedAt >= fromUtc.Value);

        if (toUtc.HasValue)
            query = query.Where(o => o.CreatedAt <= toUtc.Value);

        if (status.HasValue)
            query = query.Where(o => o.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(paymentType))
        {
            var pType = paymentType.Trim().ToLowerInvariant();
            if (pType is "cash" or "tien_mat")
                query = query.Where(o => o.QrContent == "CASH" || (o.BankTransactionId != null && o.BankTransactionId.StartsWith("CASH-")));
            else if (pType is "bank" or "vietqr" or "transfer" or "chuyen_khoan")
                query = query.Where(o => o.QrContent != "CASH" && (o.BankTransactionId == null || !o.BankTransactionId.StartsWith("CASH-")));
        }

        var p = Math.Max(1, page);
        var take = Math.Clamp(limit, 1, 500);
        var skip = (p - 1) * take;

        var list = query.OrderByDescending(o => o.CreatedAt).Skip(skip).Take(take).ToList();
        return Task.FromResult(list);
    }

    public Task<int> CountOrdersFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        OrderStatus? status = null,
        string? paymentType = null,
        CancellationToken ct = default)
    {
        var query = _orders.Values.AsEnumerable();

        if (fromUtc.HasValue)
            query = query.Where(o => o.CreatedAt >= fromUtc.Value);

        if (toUtc.HasValue)
            query = query.Where(o => o.CreatedAt <= toUtc.Value);

        if (status.HasValue)
            query = query.Where(o => o.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(paymentType))
        {
            var pType = paymentType.Trim().ToLowerInvariant();
            if (pType is "cash" or "tien_mat")
                query = query.Where(o => o.QrContent == "CASH" || (o.BankTransactionId != null && o.BankTransactionId.StartsWith("CASH-")));
            else if (pType is "bank" or "vietqr" or "transfer" or "chuyen_khoan")
                query = query.Where(o => o.QrContent != "CASH" && (o.BankTransactionId == null || !o.BankTransactionId.StartsWith("CASH-")));
        }

        return Task.FromResult(query.Count());
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
