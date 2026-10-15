using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;
using VietQrKiosk.Server.Config;

namespace VietQrKiosk.Server.Services;

public interface IMqttPublisher
{
    bool IsConnected { get; }

    Task PublishAsync(string topic, object payload, CancellationToken ct, bool logPayload = true);

    /// <summary>Đăng ký topic: được nhớ lại và đăng ký lại sau mỗi lần kết nối.</summary>
    Task SubscribeAsync(string topic, CancellationToken ct);
}

/// <summary>
/// Giữ kết nối MQTT tới VietQR (tự nối lại), đăng ký các topic của điểm bán và chuyển tin cho MqttMessageHandler.
/// Dùng phiên bền vững (CleanSession=false, ClientId cố định, QoS 1) để broker giữ lại tin biến động số dư
/// gửi trong lúc server offline. Đây KHÔNG phải bảo đảm tuyệt đối nên vẫn có đối soát bù (OrderReconcileService).
/// </summary>
public sealed class VietQrMqttClient : BackgroundService, IMqttPublisher
{
    private readonly MqttOptions _opt;
    private readonly TerminalStore _terminal;
    private readonly MqttMessageHandler _handler;
    private readonly ILogger<VietQrMqttClient> _log;
    private readonly IMqttClient _client;
    private readonly ConcurrentDictionary<string, byte> _topics = new();
    private readonly SemaphoreSlim _subscribeLock = new(1, 1);

    public VietQrMqttClient(IOptions<MqttOptions> opt, TerminalStore terminal, MqttMessageHandler handler,
        ILogger<VietQrMqttClient> log)
    {
        _opt = opt.Value;
        _terminal = terminal;
        _handler = handler;
        _log = log;
        _client = new MqttFactory().CreateMqttClient();

        AddTerminalTopics();
        if (!string.IsNullOrWhiteSpace(_terminal.Current.BoxId)) _topics[MqttTopics.BoxId(_terminal.Current.BoxId)] = 0;
        if (!string.IsNullOrWhiteSpace(_opt.MacAddr)) _topics[MqttTopics.SyncResponse(_opt.MacAddr)] = 0;

        // Sau khi đồng bộ điểm bán xong có terminalCode mới: đăng ký thêm các topic của điểm bán đó.
        _terminal.Changed += () => _ = OnTerminalChangedAsync();
    }

    public bool IsConnected => _client.IsConnected;

    private void AddTerminalTopics()
    {
        var t = _terminal.Current.TerminalCode;
        if (string.IsNullOrWhiteSpace(t)) return;
        _topics[MqttTopics.QrResponse(t)] = 0;
        _topics[MqttTopics.Bdsd(t)] = 0;
        _topics[MqttTopics.StatusResponse(t)] = 0;
    }

    private async Task OnTerminalChangedAsync()
    {
        try
        {
            AddTerminalTopics();
            if (_client.IsConnected) await SubscribeAllAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Không đăng ký được topic của điểm bán mới");
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _client.ApplicationMessageReceivedAsync += OnMessageAsync;
        _client.DisconnectedAsync += e =>
        {
            _log.LogWarning("MQTT mất kết nối: {Reason}", e.Exception?.Message ?? e.Reason.ToString());
            return Task.CompletedTask;
        };

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!_client.IsConnected) await ConnectAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Kết nối MQTT tới {Host}:{Port} thất bại, thử lại sau 5 giây", _opt.Host, _opt.Port);
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        try
        {
            if (_client.IsConnected) await _client.DisconnectAsync();
        }
        catch
        {
            // đang tắt dịch vụ
        }
    }

    private async Task ConnectAsync(CancellationToken ct)
    {
        var builder = new MqttClientOptionsBuilder()
            .WithTcpServer(_opt.Host, _opt.Port)
            .WithClientId(_opt.ClientId)
            .WithCleanSession(_opt.CleanSession)
            .WithKeepAlivePeriod(TimeSpan.FromSeconds(_opt.KeepAliveSeconds));

        if (!string.IsNullOrEmpty(_opt.Username))
            builder = builder.WithCredentials(_opt.Username, _opt.Password);

        if (_opt.UseTls)
        {
            builder = builder.WithTlsOptions(new MqttClientTlsOptions
            {
                UseTls = true,
                AllowUntrustedCertificates = _opt.AllowUntrustedCertificate,
                IgnoreCertificateChainErrors = _opt.AllowUntrustedCertificate,
                IgnoreCertificateRevocationErrors = _opt.AllowUntrustedCertificate
            });
        }

        await _client.ConnectAsync(builder.Build(), ct);
        _log.LogInformation("Đã kết nối MQTT tới {Host}:{Port} (clientId={ClientId}, tls={Tls})",
            _opt.Host, _opt.Port, _opt.ClientId, _opt.UseTls);

        await SubscribeAllAsync(ct);
    }

    private async Task SubscribeAllAsync(CancellationToken ct)
    {
        await _subscribeLock.WaitAsync(ct);
        try
        {
            foreach (var topic in _topics.Keys)
            {
                await SubscribeOneAsync(topic, ct);
            }
        }
        finally
        {
            _subscribeLock.Release();
        }
    }

    private async Task SubscribeOneAsync(string topic, CancellationToken ct)
    {
        var options = new MqttClientSubscribeOptionsBuilder()
            .WithTopicFilter(f => f.WithTopic(topic).WithAtLeastOnceQoS())
            .Build();
        await _client.SubscribeAsync(options, ct);
        _log.LogInformation("MQTT SUB {Topic}", topic);
    }

    public async Task SubscribeAsync(string topic, CancellationToken ct)
    {
        _topics[topic] = 0;
        if (!_client.IsConnected) return; // sẽ được đăng ký khi nối lại
        await _subscribeLock.WaitAsync(ct);
        try
        {
            await SubscribeOneAsync(topic, ct);
        }
        finally
        {
            _subscribeLock.Release();
        }
    }

    public async Task PublishAsync(string topic, object payload, CancellationToken ct, bool logPayload = true)
    {
        if (!_client.IsConnected) throw new InvalidOperationException("MQTT chưa kết nối tới VietQR");

        var json = JsonSerializer.Serialize(payload, JsonOpts.Write);
        var message = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(Encoding.UTF8.GetBytes(json))
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();

        await _client.PublishAsync(message, ct);

        // Không ghi nội dung của tin chứa bí mật (secretKey); tin thường chỉ có số tài khoản và số tiền.
        _log.LogInformation("MQTT PUB {Topic} {Payload}", topic, logPayload ? json : "(ẩn)");
    }

    private async Task OnMessageAsync(MqttApplicationMessageReceivedEventArgs e)
    {
        var topic = e.ApplicationMessage.Topic;
        try
        {
            var segment = e.ApplicationMessage.PayloadSegment;
            var json = segment.Array == null ? "" : Encoding.UTF8.GetString(segment.Array, segment.Offset, segment.Count);
            await _handler.HandleAsync(topic, json);
        }
        catch (Exception ex)
        {
            // Không ném tiếp để không làm đứt kết nối. Khoản tiền bị lỡ sẽ được đối soát bù qua tra cứu trạng thái.
            _log.LogError(ex, "Lỗi xử lý tin MQTT trên {Topic}", topic);
        }
    }

    public override void Dispose()
    {
        _client.Dispose();
        base.Dispose();
    }
}
