using System.Text.Json;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

/// <summary>Phân loại tin MQTT nhận từ VietQR theo topic và chuyển cho đúng nơi xử lý.</summary>
public sealed class MqttMessageHandler
{
    private readonly IServiceProvider _sp;
    private readonly PendingQrRegistry _pending;
    private readonly TerminalStore _terminal;
    private readonly MqttStats _stats;
    private readonly MqttOptions _opt;
    private readonly ILogger<MqttMessageHandler> _log;

    // Dùng IServiceProvider (không inject ProvisioningService) để tránh vòng phụ thuộc với VietQrMqttClient.
    public MqttMessageHandler(IServiceProvider sp, PendingQrRegistry pending, TerminalStore terminal, MqttStats stats,
        IOptions<MqttOptions> opt, ILogger<MqttMessageHandler> log)
    {
        _sp = sp;
        _pending = pending;
        _terminal = terminal;
        _stats = stats;
        _opt = opt.Value;
        _log = log;
    }

    public async Task HandleAsync(string topic, string json)
    {
        _log.LogInformation("MQTT SUB [{Topic}]: {Json}", topic, json);

        var t = _terminal.Current.TerminalCode;
        if (!string.IsNullOrWhiteSpace(t))
        {
            if (topic == MqttTopics.QrResponse(t)) { OnQrResponse(json); return; }
            if (topic == MqttTopics.Bdsd(t)) { await OnBdsdAsync(json); return; }
            if (topic == MqttTopics.StatusResponse(t)) { await OnStatusAsync(json); return; }
        }

        if (!string.IsNullOrWhiteSpace(_opt.MacAddr) && topic == MqttTopics.SyncResponse(_opt.MacAddr))
        {
            _sp.GetRequiredService<ProvisioningService>().OnSyncResponse(json);
            return;
        }

        if (topic.StartsWith(MqttTopics.BoxIdPrefix, StringComparison.Ordinal))
        {
            _sp.GetRequiredService<ProvisioningService>().OnActivation(json);
            return;
        }

        _log.LogWarning("MQTT: nhận tin trên topic không xử lý: {Topic}", topic);
    }

    private void OnQrResponse(string json)
    {
        Interlocked.Increment(ref _stats.QrResponses);
        var m = JsonSerializer.Deserialize<QrResponseMessage>(json, JsonOpts.Read);
        if (m == null || string.IsNullOrWhiteSpace(m.OrderId))
        {
            _log.LogWarning("Phản hồi tạo QR không có orderId, bỏ qua");
            return;
        }

        if (!_pending.Complete(m.OrderId, m))
        {
            // Đến sau khi đã hết thời gian chờ: giao dịch bên VietQR vẫn tồn tại; nếu khách trả sẽ về REVIEW.
            _log.LogWarning("Nhận mã QR cho đơn {OrderId} nhưng không còn ai chờ", m.OrderId);
        }
    }

    private async Task OnBdsdAsync(string json)
    {
        Interlocked.Increment(ref _stats.BdsdReceived);
        _stats.LastBdsdUtc = DateTime.UtcNow;

        var m = JsonSerializer.Deserialize<BdsdMessage>(json, JsonOpts.Read);
        if (m == null) return;

        _log.LogInformation("BĐSD: ref={Ref} amount={Amount} order={Order} status={Status} content={Content}",
            m.ReferenceNumber, m.Amount, m.OrderId, m.Status, m.Content);

        if (m.Status is not null && m.Status != 1)
        {
            _log.LogInformation("BĐSD {Ref} có status={Status} (không phải thành công), bỏ qua", m.ReferenceNumber, m.Status);
            return;
        }

        var n = new PaymentNotification(m.ReferenceNumber, m.Amount, m.Content, m.OrderId, m.TransType, m.BankAccount,
            Helpers.ParseTimePaidMs(m.TimePaid), "BDSD");
        await ProcessAsync(n);
    }

    private async Task OnStatusAsync(string json)
    {
        Interlocked.Increment(ref _stats.StatusResponses);
        var m = JsonSerializer.Deserialize<StatusResponseMessage>(json, JsonOpts.Read);
        if (m == null) return;

        _log.LogInformation("Tra cứu: order={Order} status={Status} ref={Ref} amount={Amount}", m.OrderId, m.Status, m.ReferenceNumber, m.Amount);

        if (m.Status != 1) return; // 0: còn chờ, 2: VietQR đã huỷ giao dịch: không có tiền để ghi nhận

        var timePaidMs = (m.TimePaid ?? 0) > 0
            ? ((m.TimePaid!.Value < 100_000_000_000L) ? m.TimePaid.Value * 1000 : m.TimePaid.Value)
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var n = new PaymentNotification(
            m.ReferenceNumber,
            m.Amount ?? 0,
            m.Content,
            m.OrderId,
            m.TransType ?? "C",
            _terminal.Current.BankAccount,
            timePaidMs,
            "STATUS");
        await ProcessAsync(n);
    }

    private async Task ProcessAsync(PaymentNotification n)
    {
        // Không gắn CancellationToken: đã nhận tiền thì phải ghi xong.
        using var scope = _sp.CreateScope();
        await scope.ServiceProvider.GetRequiredService<PaymentProcessor>().ProcessAsync(n, CancellationToken.None);
    }
}
