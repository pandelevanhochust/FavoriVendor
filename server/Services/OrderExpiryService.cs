using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Data;

namespace VietQrKiosk.Server.Services;

/// <summary>Định kỳ chuyển các đơn PENDING quá hạn sang EXPIRED và đánh thức app đang chờ.</summary>
public class OrderExpiryService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly OrderNotifier _notifier;
    private readonly ILogger<OrderExpiryService> _log;

    public OrderExpiryService(IServiceScopeFactory scopes, OrderNotifier notifier, ILogger<OrderExpiryService> log)
    {
        _scopes = scopes;
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
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDb>();
        var now = DateTime.UtcNow;

        var expired = await db.Orders
            .Where(o => o.Status == OrderStatus.Pending && o.ExpiresAt < now)
            .ToListAsync(ct);
        if (expired.Count == 0) return;

        foreach (var o in expired) o.Status = OrderStatus.Expired;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Có đơn vừa được trả tiền/huỷ đúng lúc này: bỏ lượt, vòng sau quét lại.
            db.ChangeTracker.Clear();
        }

        foreach (var o in expired) _notifier.Notify(o.OrderId);
        _log.LogInformation("Đã quét {Count} đơn hết hạn", expired.Count);
    }
}
