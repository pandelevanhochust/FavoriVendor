using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(string orderId, bool asNoTracking = false, CancellationToken ct = default);
    Task<Order?> GetByContentAsync(string content, bool asNoTracking = false, CancellationToken ct = default);
    Task AddAsync(Order order, CancellationToken ct = default);
    Task<List<Order>> GetExpiredPendingOrdersAsync(DateTime nowUtc, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
