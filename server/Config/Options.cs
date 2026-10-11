namespace VietQrKiosk.Server.Config;

/// <summary>Thông tin gọi API của VietQR (do VietQR cấp cho bạn).</summary>
public class VietQrOptions
{
    /// <summary>Test: https://dev.vietqr.org/  |  Golive: https://api.vietqr.org/</summary>
    public string BaseUrl { get; set; } = "https://dev.vietqr.org/";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";

    /// <summary>Tài khoản nhận tiền đã liên kết với VietQR.</summary>
    public string BankCode { get; set; } = "MB";
    public string BankAccount { get; set; } = "";
    /// <summary>Tên chủ tài khoản, không dấu.</summary>
    public string AccountName { get; set; } = "";
}

/// <summary>
/// Thông tin để VietQR gọi vào server của bạn (Get Token + Transaction Sync).
/// Username/Password do BẠN tự đặt rồi gửi cho VietQR khi đăng ký.
/// </summary>
public class CallbackOptions
{
    /// <summary>Phần "URL Path (Suffix)" khai báo với VietQR. Mặc định: vietqr</summary>
    public string BasePath { get; set; } = "vietqr";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    /// <summary>Khoá ký JWT (HS256), tối thiểu 32 ký tự ngẫu nhiên.</summary>
    public string JwtSecret { get; set; } = "";
    public int TokenSeconds { get; set; } = 300;
}

/// <summary>Cấu hình cho máy (app Android).</summary>
public class KioskOptions
{
    /// <summary>Khoá API app Android gửi trong header X-Api-Key. Tối thiểu 16 ký tự.</summary>
    public string ApiKey { get; set; } = "";
    /// <summary>Thời gian sống của một đơn/QR (giây). VietQR cho phép tối đa 15 phút.</summary>
    public int OrderTtlSeconds { get; set; } = 300;
    public long MinAmount { get; set; } = 1000;
    public long MaxAmount { get; set; } = 20_000_000;
}
