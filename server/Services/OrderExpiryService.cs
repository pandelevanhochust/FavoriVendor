using VietQrKiosk.Server.Infra.Repositories;

namespace VietQrKiosk.Server.Services;

/// <summary>Định kỳ chuyển các đơn PENDING quá hạn sang EXPIRED và đánh thức app đang chờ.</summary>
public class OrderExpiryService : BackgroundService
{
    private readonly IOrderRepository _orderRepo;
    private readonly OrderNotifier _notifier;
    private readonly ILogger<OrderExpiryService> _log;

    public OrderExpiryService(IOrderRepository orderRepo, OrderNotifier notifier, ILogger<OrderExpiryService> log)
    {
        _orderRepo = orderRepo;
        _notifier = notifier;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try { await TickAsync(stoppingToken); }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _log.LogError(ex, "Lỗi khi quét đơn hết hạn");
                }
            }
        }
        catch (OperationCanceledException) { /* dừng service */ }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var expired = await _orderRepo.GetExpiredPendingOrdersAsync(now, ct);
        if (expired.Count == 0) return;

        var markedCount = 0;
        foreach (var o in expired)
        {
            if (await _orderRepo.TryMarkExpiredAsync(o.OrderId, ct))
            {
                markedCount++;
                _notifier.Notify(o.OrderId);
            }
        }

        if (markedCount > 0)
            _log.LogInformation("Đã quét và hết hạn {Count} đơn", markedCount);
    }
}
