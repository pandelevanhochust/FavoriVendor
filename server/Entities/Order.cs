namespace VietQrKiosk.Server.Entities;

public class Order
{
    /// <summary>Mã đơn hàng định dạng 12 ký tự.</summary>
    public string OrderId { get; set; } = string.Empty;

    /// <summary>Số tiền gốc chưa áp dụng mã giảm giá.</summary>
    public long OriginalAmount { get; set; }

    /// <summary>Số tiền được giảm từ mã giảm giá.</summary>
    public long DiscountAmount { get; set; }

    /// <summary>Số tiền thực tế khách cần thanh toán qua VietQR.</summary>
    public long Amount { get; set; }

    /// <summary>Mã giảm giá đã áp dụng (nếu có).</summary>
    public string? DiscountCode { get; set; }

    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    public string? QrCode { get; set; }
    public string? QrContent { get; set; }
    public string? DeviceId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? PaidAt { get; set; }

    /// <summary>TransactionId từ giao dịch ngân hàng khớp lệnh thành công.</summary>
    public string? BankTransactionId { get; set; }

    public List<BankTransaction> BankTransactions { get; set; } = new();
}
