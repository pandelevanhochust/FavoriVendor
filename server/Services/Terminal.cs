using System.Text.Json;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

public record TerminalInfo(string TerminalCode, string BankCode, string BankAccount, string AccountName,
    string ServiceCode, string BoxId);

/// <summary>
/// Điểm bán và tài khoản nhận tiền đang dùng. Lấy từ cấu hình; nếu cấu hình để trống thì lấy từ kết quả
/// đồng bộ điểm bán đã lưu ở data/terminal.json.
/// </summary>
public sealed class TerminalStore
{
    private readonly string _path = Path.Combine("data", "terminal.json");
    private readonly ILogger<TerminalStore> _log;
    private volatile TerminalInfo _current;

    public event Action? Changed;

    public TerminalStore(IOptions<MqttOptions> options, ILogger<TerminalStore> log)
    {
        _log = log;
        var o = options.Value;
        _current = new TerminalInfo(o.TerminalCode, o.BankCode, o.BankAccount, o.AccountName, o.ServiceCode, "");

        if (!File.Exists(_path)) return;
        try
        {
            var saved = JsonSerializer.Deserialize<TerminalInfo>(File.ReadAllText(_path));
            if (saved == null) return;
            // Cấu hình tường minh luôn thắng; file chỉ lấp chỗ trống và cung cấp BoxId.
            _current = string.IsNullOrWhiteSpace(o.TerminalCode) ? saved : _current with { BoxId = saved.BoxId };
            _log.LogInformation("Đã nạp điểm bán {Terminal} từ {Path}", _current.TerminalCode, _path);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Không đọc được {Path}", _path);
        }
    }

    public TerminalInfo Current => _current;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_current.TerminalCode)
        && !string.IsNullOrWhiteSpace(_current.BankAccount)
        && !string.IsNullOrWhiteSpace(_current.AccountName);

    public void Update(TerminalInfo info)
    {
        _current = info;
        try
        {
            Directory.CreateDirectory("data");
            File.WriteAllText(_path, JsonSerializer.Serialize(info));
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Không lưu được {Path}: sau khi khởi động lại phải đồng bộ lại hoặc đặt Mqtt:TerminalCode", _path);
        }
        Changed?.Invoke();
    }
}

/// <summary>
/// Đồng bộ "thiết bị" (chính server này) với tài khoản VietQR theo mục "Các bước đồng bộ MQTT":
///  1. gửi /vqr/handle-box  -> nhận qrCertificate + boxId
///  2. đăng ký topic vietqr/boxId/{boxId}
///  3. chủ tài khoản quét qrCertificate bằng app VietQR và xác nhận
///  4. nhận terminalCode, tài khoản ngân hàng... qua topic ở bước 2
/// Chỉ cần làm một lần (hoặc khi muốn đổi tài khoản nhận tiền).
/// </summary>
public sealed class ProvisioningService
{
    private readonly IMqttPublisher _mqtt;
    private readonly TerminalStore _store;
    private readonly MqttOptions _opt;
    private readonly ILogger<ProvisioningService> _log;
    private TaskCompletionSource<BoxSyncResponse>? _pending;

    public ProvisioningService(IMqttPublisher mqtt, TerminalStore store, IOptions<MqttOptions> opt,
        ILogger<ProvisioningService> log)
    {
        _mqtt = mqtt;
        _store = store;
        _opt = opt.Value;
        _log = log;
    }

    public async Task<BoxSyncResponse> StartAsync(CancellationToken ct)
    {
        Helpers.Require(!string.IsNullOrWhiteSpace(_opt.MacAddr), "Mqtt:MacAddr (định danh thiết bị, tự đặt, ổn định)");
        Helpers.Require(!string.IsNullOrWhiteSpace(_opt.SecretKey), "Mqtt:SecretKey (VietQR cấp)");

        await _mqtt.SubscribeAsync(MqttTopics.SyncResponse(_opt.MacAddr), ct);

        var tcs = new TaskCompletionSource<BoxSyncResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending = tcs;

        var request = new BoxSyncRequest
        {
            MacAddr = _opt.MacAddr,
            SerialNumber = string.IsNullOrWhiteSpace(_opt.SerialNumber) ? null : _opt.SerialNumber,
            SecretKey = _opt.SecretKey,
            // Công thức theo tài liệu: MD5(macAddr + "VietQRBoxAccessKey"); đã đối chiếu khớp với ví dụ của VietQR.
            CheckSum = Helpers.Md5Hex(_opt.MacAddr + "VietQRBoxAccessKey")
        };
        await _mqtt.PublishAsync(MqttTopics.SyncRequest, request, ct, logPayload: false);

        var response = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(20), ct);
        if (string.IsNullOrWhiteSpace(response.BoxId))
            throw new InvalidOperationException("VietQR trả về nhưng không có boxId");

        await _mqtt.SubscribeAsync(MqttTopics.BoxId(response.BoxId), ct);
        _store.Update(_store.Current with { BoxId = response.BoxId });
        return response;
    }

    public void OnSyncResponse(string json)
    {
        var response = JsonSerializer.Deserialize<BoxSyncResponse>(json, JsonOpts.Read);
        if (response == null) return;
        _log.LogInformation("Nhận phản hồi đồng bộ thiết bị: boxId={BoxId}", response.BoxId);
        _pending?.TrySetResult(response);
    }

    public void OnActivation(string json)
    {
        var m = JsonSerializer.Deserialize<BoxActivationMessage>(json, JsonOpts.Read);
        if (m == null || string.IsNullOrWhiteSpace(m.TerminalCode))
        {
            _log.LogWarning("Tin kích hoạt không có terminalCode, bỏ qua");
            return;
        }

        var current = _store.Current;
        _store.Update(new TerminalInfo(
            m.TerminalCode!,
            m.BankCode ?? current.BankCode,
            m.BankAccount ?? current.BankAccount,
            m.UserBankName ?? current.AccountName,
            current.ServiceCode,
            current.BoxId));

        _log.LogInformation("Đồng bộ điểm bán thành công: terminal={Terminal} ({Name}), tài khoản {Account}",
            m.TerminalCode, m.TerminalName, Helpers.MaskAccount(m.BankAccount));
    }
}
