using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using VietQrKiosk.Server.Infra;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

public static class Helpers
{
    // Bỏ các ký tự dễ nhầm (0/O, 1/I). 32 ký tự -> 12 ký tự ~ 2^60 khả năng.
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    /// <summary>Mã đơn 12 ký tự, chỉ chữ và số.</summary>
    public static string NewOrderId(int length = 12)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    /// <summary>So sánh hằng thời gian (băm SHA-256 trước để độ dài không bị lộ).</summary>
    public static bool FixedEquals(string? a, string? b)
    {
        var ha = SHA256.HashData(Encoding.UTF8.GetBytes(a ?? ""));
        var hb = SHA256.HashData(Encoding.UTF8.GetBytes(b ?? ""));
        return CryptographicOperations.FixedTimeEquals(ha, hb);
    }

    /// <summary>MD5 dạng hex thường. VietQR yêu cầu MD5 cho checkSum (không dùng cho mục đích bảo mật khác).</summary>
    public static string Md5Hex(string s) =>
        Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();

    private static readonly Regex QrTokenRx = new(@"VQR[0-9a-fA-F]{10}", RegexOptions.Compiled);

    /// <summary>
    /// VietQR gắn tiền tố "VQRxxxxxxxxxx" vào nội dung chuyển khoản của QR động
    /// (vd "VQR49e47786a6 Dondathangkhac"). Dùng nó để khớp đơn khi tin biến động số dư không có orderId.
    /// </summary>
    public static string? ExtractQrToken(string? content)
    {
        if (string.IsNullOrWhiteSpace(content)) return null;
        var m = QrTokenRx.Match(content);
        return m.Success ? m.Value.ToUpperInvariant() : null;
    }

    /// <summary>"dd/MM/yyyy HH:mm:ss" theo giờ UTC+7 -> mili giây kể từ epoch. Sai định dạng thì dùng giờ hiện tại.</summary>
    public static long ParseTimePaidMs(string? timePaid)
    {
        if (!string.IsNullOrWhiteSpace(timePaid)
            && DateTime.TryParseExact(timePaid.Trim(), "dd/MM/yyyy HH:mm:ss", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var local))
        {
            return new DateTimeOffset(local, TimeSpan.FromHours(7)).ToUnixTimeMilliseconds();
        }
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public static OrderDto ToDto(Order o, DateTime nowUtc)
    {
        var remaining = (int)Math.Max(0, (o.ExpiresAt - nowUtc).TotalSeconds);
        return new OrderDto(
            o.OrderId,
            o.Status.ToString().ToUpperInvariant(),
            o.Amount,
            o.QrCode,
            o.QrContent,
            remaining,
            o.PaidAt);
    }

    public static string MaskAccount(string? account)
    {
        if (string.IsNullOrEmpty(account)) return "";
        return account.Length <= 4 ? "****" : new string('*', account.Length - 4) + account[^4..];
    }

    public static void Require(bool ok, string message)
    {
        if (!ok) throw new InvalidOperationException("Cấu hình thiếu/sai: " + message);
    }
}

/// <summary>Tuỳ chọn JSON cho tin MQTT: VietQR lúc gửi số dạng chuỗi ("amount":"20000"), lúc dạng số thực (25000.0).</summary>
public static class JsonOpts
{
    public static readonly JsonSerializerOptions Read = new(JsonSerializerDefaults.Web)
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    public static readonly JsonSerializerOptions Write = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
}

/// <summary>Các topic theo tài liệu. Chú ý: chỉ topic đồng bộ thiết bị bắt đầu bằng dấu "/".</summary>
public static class MqttTopics
{
    public const string SyncRequest = "/vqr/handle-box";
    public const string BoxIdPrefix = "vietqr/boxId/";

    public static string SyncResponse(string macAddr) => $"/vqr/handle-box/response/{macAddr}";
    public static string BoxId(string boxId) => BoxIdPrefix + boxId;
    public static string QrRequest(string terminal) => $"vietqr/request/{terminal}";
    public static string QrResponse(string terminal) => $"vietqr/response/{terminal}";
    public static string Bdsd(string terminal) => $"vietqr/bdsd/{terminal}";
    public static string StatusRequest(string terminal) => $"vietqr/request-status/{terminal}";
    public static string StatusResponse(string terminal) => $"vietqr/response-status/{terminal}";
}

/// <summary>Bộ đếm để phát hiện sớm "VietQR im lặng" (sai quyền topic, sai checkSum...).</summary>
public sealed class MqttStats
{
    public long QrRequests, QrResponses, BdsdReceived, StatusRequests, StatusResponses;
    public DateTime? LastBdsdUtc;
}
