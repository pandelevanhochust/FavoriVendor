namespace VietQrKiosk.Server.Config;

/// <summary>
/// Kết nối MQTT tới VietQR (tài liệu "API Host to Device (MQTTs)").
/// Host, Port, Username, Password do VietQR cung cấp sau khi đăng ký.
/// </summary>
public class MqttOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 8883;
    public bool UseTls { get; set; } = true;
    /// <summary>Chỉ dùng khi thử với broker chứng chỉ tự ký. KHÔNG bật ở môi trường thật.</summary>
    public bool AllowUntrustedCertificate { get; set; }
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";

    /// <summary>
    /// Phải CỐ ĐỊNH và duy nhất: broker dùng nó để giữ phiên và gửi lại tin chưa nhận khi server mất kết nối.
    /// Hai tiến trình dùng cùng ClientId sẽ đá nhau liên tục.
    /// </summary>
    public string ClientId { get; set; } = "vietqr-kiosk-server";
    /// <summary>false = phiên bền vững (khuyến nghị): tin biến động số dư gửi lúc server offline vẫn được giao lại.</summary>
    public bool CleanSession { get; set; }
    public int KeepAliveSeconds { get; set; } = 30;

    // ----- Điểm bán và tài khoản nhận tiền (có thể bỏ trống nếu dùng lệnh đồng bộ để lấy tự động) -----
    public string TerminalCode { get; set; } = "";
    public string BankCode { get; set; } = "MB";
    public string BankAccount { get; set; } = "";
    /// <summary>Tên chủ tài khoản, dùng khi tạo QR và để tính checkSum tra cứu giao dịch.</summary>
    public string AccountName { get; set; } = "";
    public string ServiceCode { get; set; } = "";

    /// <summary>Chờ VietQR trả mã QR tối đa ngần này giây.</summary>
    public int QrResponseTimeoutSeconds { get; set; } = 15;

    // ----- Đồng bộ điểm bán (chỉ cần khi chưa có TerminalCode) -----
    public string SecretKey { get; set; } = "";
    public string MacAddr { get; set; } = "";
    public string SerialNumber { get; set; } = "";
}

/// <summary>Khoá cho các API quản trị (/admin/...). Để trống = tắt hoàn toàn các API này.</summary>
public class AdminOptions
{
    public string ApiKey { get; set; } = "";
}

/// <summary>Cấu hình cho máy (app Android).</summary>
public class KioskOptions
{
    /// <summary>Khoá API app Android gửi trong header X-Api-Key. Tối thiểu 16 ký tự.</summary>
    public string ApiKey { get; set; } = "";
    /// <summary>Thời gian sống của một đơn/QR (giây). QR động của VietQR sống tối đa 15 phút.</summary>
    public int OrderTtlSeconds { get; set; } = 300;
    public long MinAmount { get; set; } = 1000;
    public long MaxAmount { get; set; } = 20_000_000;
}
