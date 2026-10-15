using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Infra;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

/// <summary>
/// MQTT là bất đồng bộ: yêu cầu gửi đi một topic, mã QR về ở topic khác và chỉ có orderId để ghép cặp.
/// Registry này giữ các yêu cầu đang chờ phản hồi.
/// </summary>
public sealed class PendingQrRegistry
{
    private readonly ConcurrentDictionary<string, TaskCompletionSource<QrResponseMessage>> _map = new();

    public Task<QrResponseMessage> Register(string orderId)
    {
        var tcs = new TaskCompletionSource<QrResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        _map[orderId] = tcs;
        return tcs.Task;
    }

    public bool Complete(string orderId, QrResponseMessage message) =>
        _map.TryRemove(orderId, out var tcs) && tcs.TrySetResult(message);

    public void Remove(string orderId) => _map.TryRemove(orderId, out _);
}

/// <summary>Xin VietQR tạo mã QR động qua MQTT và chờ phản hồi.</summary>
public sealed class QrService
{
    private readonly IMqttPublisher _mqtt;
    private readonly PendingQrRegistry _pending;
    private readonly TerminalStore _terminal;
    private readonly MqttStats _stats;
    private readonly MqttOptions _opt;

    public QrService(IMqttPublisher mqtt, PendingQrRegistry pending, TerminalStore terminal, MqttStats stats,
        IOptions<MqttOptions> opt)
    {
        _mqtt = mqtt;
        _pending = pending;
        _terminal = terminal;
        _stats = stats;
        _opt = opt.Value;
    }

    public async Task<QrResponseMessage> RequestQrAsync(Order order, CancellationToken ct)
    {
        if (!_terminal.IsConfigured)
            throw new InvalidOperationException(
                "Chưa có điểm bán/tài khoản nhận tiền: đặt Mqtt:TerminalCode, BankAccount, AccountName hoặc chạy đồng bộ điểm bán");

        var t = _terminal.Current;
        var waiter = _pending.Register(order.OrderId);
        try
        {
            var request = new QrRequestMessage
            {
                Amount = order.Amount,
                // Nội dung ngắn: VietQR sẽ gắn thêm tiền tố "VQRxxxxxxxxxx " phía trước.
                Content = order.OrderId,
                BankAccount = t.BankAccount,
                BankCode = t.BankCode,
                UserBankName = t.AccountName,
                TransType = "C",
                OrderId = order.OrderId,
                TerminalCode = t.TerminalCode,
                ServiceCode = string.IsNullOrWhiteSpace(t.ServiceCode) ? null : t.ServiceCode
            };

            Interlocked.Increment(ref _stats.QrRequests);
            await _mqtt.PublishAsync(MqttTopics.QrRequest(t.TerminalCode), request, ct);

            try
            {
                return await waiter.WaitAsync(TimeSpan.FromSeconds(_opt.QrResponseTimeoutSeconds), ct);
            }
            catch (TimeoutException)
            {
                throw new TimeoutException(
                    $"VietQR không trả mã QR cho đơn {order.OrderId} trong {_opt.QrResponseTimeoutSeconds} giây");
            }
        }
        finally
        {
            _pending.Remove(order.OrderId);
        }
    }
}
