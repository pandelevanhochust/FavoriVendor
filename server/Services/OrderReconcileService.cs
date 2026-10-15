using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

/// <summary>
/// Đối soát bù. Khác với callback (VietQR tự gửi lại khi lỗi), tin MQTT bị lỡ thì không ai gửi lại.
/// Dịch vụ này hỏi VietQR trạng thái các đơn đáng ngờ qua vietqr/request-status:
///  - đơn PENDING (sau 12 giây, hỏi lại mỗi 15 giây): bắt trường hợp mất tin biến động số dư;
///  - đơn EXPIRED/CANCELLED trong 15 phút gần đây (mỗi 60 giây): bắt khách trả muộn -> đơn sang REVIEW.
/// Phản hồi đi qua MqttMessageHandler.OnStatusAsync và PaymentProcessor (idempotent theo referenceNumber).
/// </summary>
public sealed class OrderReconcileService : BackgroundService
{
    private readonly IOrderRepository _orderRepo;
    private readonly IMqttPublisher _mqtt;
    private readonly TerminalStore _terminal;
    private readonly MqttStats _stats;
    private readonly ILogger<OrderReconcileService> _log;
    private bool _warnedSilent;

    public OrderReconcileService(IOrderRepository orderRepo, IMqttPublisher mqtt, TerminalStore terminal,
        MqttStats stats, ILogger<OrderReconcileService> log)
    {
        _orderRepo = orderRepo;
        _mqtt = mqtt;
        _terminal = terminal;
        _stats = stats;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try { await TickAsync(stoppingToken); }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _log.LogError(ex, "Lỗi khi đối soát đơn");
                }
            }
        }
        catch (OperationCanceledException)
        {
            // dừng dịch vụ
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        if (!_mqtt.IsConnected || !_terminal.IsConfigured) return;
        var t = _terminal.Current;

        var now = DateTime.UtcNow;
        var pendingFirstCheck = now.AddSeconds(-12);
        var pendingRecheck = now.AddSeconds(-15);
        var lateRecheck = now.AddSeconds(-60);
        var lateWindowStart = now.AddMinutes(-15);

        var due = await _orderRepo.GetDueForReconcileAsync(pendingFirstCheck, pendingRecheck, lateWindowStart, lateRecheck, 20, ct);

        if (due.Count == 0) return;

        // checkSum theo tài liệu: MD5(bankAccount + userBankName).
        var checkSum = Helpers.Md5Hex(t.BankAccount + t.AccountName);

        foreach (var order in due)
        {
            var request = new StatusRequestMessage
            {
                BankAccount = t.BankAccount,
                Type = 0,
                Value = order.OrderId,
                CheckSum = checkSum
            };

            Interlocked.Increment(ref _stats.StatusRequests);
            await _mqtt.PublishAsync(MqttTopics.StatusRequest(t.TerminalCode), request, ct);

            await _orderRepo.RecordReconcileAttemptAsync(order.OrderId, now, ct);
        }

        if (!_warnedSilent && Interlocked.Read(ref _stats.StatusRequests) >= 6
            && Interlocked.Read(ref _stats.StatusResponses) == 0)
        {
            _warnedSilent = true;
            _log.LogWarning("Đã gửi {Count} yêu cầu tra cứu nhưng VietQR chưa trả lời lần nào. Kiểm tra: checkSum "
                + "(công thức/chữ hoa-thường của AccountName), quyền topic request-status của tài khoản MQTT.",
                _stats.StatusRequests);
        }
    }
}
