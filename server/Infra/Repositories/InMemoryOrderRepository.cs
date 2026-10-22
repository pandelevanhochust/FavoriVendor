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

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
