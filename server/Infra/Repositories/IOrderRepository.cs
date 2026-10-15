namespace VietQrKiosk.Server.Infra.Repositories;

public interface IOrderRepository
{
    Task CreateAsync(Order order, CancellationToken ct = default);
    Task<Order?> GetByIdAsync(string orderId, CancellationToken ct = default);
    Task UpdateQrInfoAsync(string orderId, string qrCode, string qrContent, string? qrToken, string? transactionRefId, DateTime expiresAt, CancellationToken ct = default);
    Task<Order?> TryCancelAsync(string orderId, CancellationToken ct = default);
    Task<bool> CancelQuietlyAsync(string orderId, CancellationToken ct = default);
    Task<Order?> FindMatchingOrderAsync(string? orderId, string? qrToken, string? qrContent, CancellationToken ct = default);
    Task<bool> TryMarkPaidAsync(string orderId, string bankTransactionId, DateTime paidAt, CancellationToken ct = default);
    Task MarkReviewAsync(string orderId, CancellationToken ct = default);
    Task<List<Order>> GetExpiredPendingOrdersAsync(DateTime now, CancellationToken ct = default);
    Task<bool> TryMarkExpiredAsync(string orderId, CancellationToken ct = default);
    Task<List<Order>> GetDueForReconcileAsync(DateTime pendingFirstCheck, DateTime pendingRecheck, DateTime lateWindowStart, DateTime lateRecheck, int limit, CancellationToken ct = default);
    Task RecordReconcileAttemptAsync(string orderId, DateTime timestamp, CancellationToken ct = default);
}

