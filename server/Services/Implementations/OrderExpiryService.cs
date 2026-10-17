using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

/// <summary>Định kỳ chuyển các đơn PENDING quá hạn sang EXPIRED và đánh thức kiosk đang chờ.</summary>
public class OrderExpiryService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly IOrderNotifier _notifier;
    private readonly ILogger<OrderExpiryService> _log;

    public OrderExpiryService(IServiceScopeFactory scopes, IOrderNotifier notifier, ILogger<OrderExpiryService> log)
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
        var orderRepo = scope.ServiceProvider.GetRequiredService<IOrderRepository>();
        var now = DateTime.UtcNow;

        var expired = await orderRepo.GetExpiredPendingOrdersAsync(now, ct);
        if (expired.Count == 0) return;

        foreach (var o in expired) o.Status = OrderStatus.Expired;

        try
        {
            await orderRepo.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Có đơn vừa được thanh toán hoặc huỷ lúc này: bỏ qua, vòng sau quét tiếp
        }

        foreach (var o in expired) _notifier.Notify(o.OrderId);
        _log.LogInformation("Đã quét {Count} đơn hết hạn", expired.Count);
    }
}
