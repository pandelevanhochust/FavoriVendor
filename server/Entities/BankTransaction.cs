namespace VietQrKiosk.Server.Entities;

/// <summary>
/// Lưu lịch sử giao dịch nhận được từ VietQR API Callback.
/// </summary>
public class BankTransaction
{
    public long Id { get; set; }

    /// <summary>ID giao dịch do VietQR gửi sang.</summary>
    public string TransactionId { get; set; } = string.Empty;

    /// <summary>ID tham chiếu duy nhất do server sinh ra trả lại VietQR.</summary>
    public string RefTransactionId { get; set; } = string.Empty;

    /// <summary>Mã tham chiếu ngân hàng.</summary>
    public string? ReferenceNumber { get; set; }

    /// <summary>Số tiền nhận được (VND).</summary>
    public long Amount { get; set; }

    /// <summary>Nội dung chuyển khoản khách ghi.</summary>
    public string? Content { get; set; }

    /// <summary>Số tài khoản nhận.</summary>
    public string? BankAccount { get; set; }

    /// <summary>Loại giao dịch: "C" (tiền vào) / "D" (tiền ra).</summary>
    public string TransType { get; set; } = "C";

    /// <summary>Mã đơn hàng khớp được (nếu có).</summary>
    public string? OrderId { get; set; }
    public Order? Order { get; set; }

    /// <summary>
    /// Kết quả xử lý: PAID | DUPLICATE_PAYMENT | AMOUNT_MISMATCH | NO_ORDER | IGNORED_NOT_CREDIT | LATE_PAYMENT_*
    /// </summary>
    public string Result { get; set; } = string.Empty;

    /// <summary>Timestamp giao dịch từ VietQR (milliseconds unix).</summary>
    public long TransactionTimeMs { get; set; }

    /// <summary>Thời gian server nhận và ghi nhận callback.</summary>
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
}
