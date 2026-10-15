namespace VietQrKiosk.Server.Infra;

public enum OrderStatus
{
    Pending,    // đang chờ khách chuyển khoản
    Paid,       // đã nhận đủ tiền -> máy được phép giao hàng
    Expired,    // hết hạn, chưa nhận tiền
    Cancelled,  // khách/máy huỷ
    Review      // có tiền về nhưng KHÔNG tự xác nhận được (sai số tiền, trả muộn...) -> nhân viên xử lý
}

public class Order
{
    /// <summary>Mã đơn gửi cho VietQR (tối đa 13 ký tự, không ký tự đặc biệt). Khóa chính.</summary>
    public string OrderId { get; set; } = "";
    public long Amount { get; set; }
    public OrderStatus Status { get; set; }

    /// <summary>Nội dung chuyển khoản VietQR trả về (sandbox dạng VQRxxxx) - dùng làm khoá đối soát dự phòng.</summary>
    public string QrContent { get; set; } = "";
    public string QrCode { get; set; } = "";
    /// <summary>Token "VQRxxxxxxxxxx" đầu nội dung chuyển khoản mà VietQR gán, viết hoa. Khoá đối soát khi tin biến động số dư không có orderId.</summary>
    public string? QrToken { get; set; }
    public string? TransactionRefId { get; set; }
    /// <summary>Số lần đã hỏi VietQR trạng thái giao dịch (đối soát khi nghi mất tin biến động số dư).</summary>
    public int ReconcileCount { get; set; }
    public DateTime? LastReconcileAt { get; set; }
    public string? DeviceId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? PaidAt { get; set; }
    public string? BankTransactionId { get; set; }

    /// <summary>Cột xmin của PostgreSQL dùng cho optimistic concurrency control.</summary>
    public uint Version { get; set; }
}

/// <summary>Nhật ký MỌI giao dịch VietQR gọi về (kể cả không khớp đơn) phục vụ đối soát.</summary>
public class BankTransaction
{
    public long Id { get; set; }
    /// <summary>transactionId / referenceNumber của VietQR - unique để chống xử lý trùng.</summary>
    public string TransactionId { get; set; } = "";
    public string RefTransactionId { get; set; } = "";
    public string? ReferenceNumber { get; set; }
    public string? OrderId { get; set; }
    public long Amount { get; set; }
    public string? Content { get; set; }
    public string? BankAccount { get; set; }
    public string TransType { get; set; } = "";
    public long TransactionTimeMs { get; set; }
    /// <summary>PAID, NO_ORDER, AMOUNT_MISMATCH, DUPLICATE_PAYMENT, LATE_PAYMENT_*, IGNORED_NOT_CREDIT</summary>
    public string Result { get; set; } = "";
    public DateTime ReceivedAt { get; set; }
}
