namespace VietQrKiosk.Server.Models;

// ====================================================================== API cho app Android (máy)

public record CreateOrderRequest(long Amount, string? DeviceId);

/// <summary>Trạng thái: PENDING | PAID | EXPIRED | CANCELLED | REVIEW</summary>
public record OrderDto(
    string OrderId,
    string Status,
    long Amount,
    string? QrCode,
    string? Content,
    int ExpiresInSeconds,
    DateTime? PaidAt);

public record ErrorBody(string Message);

// ====================================================================== nội bộ

/// <summary>Một khoản tiền vào, bất kể đến từ tin biến động số dư hay từ tra cứu trạng thái.</summary>
public record PaymentNotification(
    string? ReferenceNumber,
    decimal Amount,
    string? Content,
    string? OrderId,
    string? TransType,
    string? BankAccount,
    long TimePaidMs,
    string Source);

// ====================================================================== tin nhắn MQTT (tài liệu VietQR)

/// <summary>vietqr/request/{terminalCode}</summary>
public class QrRequestMessage
{
    public long Amount { get; set; }
    public string Content { get; set; } = "";
    public string BankAccount { get; set; } = "";
    public string BankCode { get; set; } = "";
    public string UserBankName { get; set; } = "";
    public string TransType { get; set; } = "C";
    public string OrderId { get; set; } = "";
    public string TerminalCode { get; set; } = "";
    public string? ServiceCode { get; set; }
}

/// <summary>vietqr/response/{terminalCode}. Lưu ý: content VietQR trả về có tiền tố "VQRxxxxxxxxxx ".</summary>
public class QrResponseMessage
{
    public string? BankCode { get; set; }
    public string? BankName { get; set; }
    public string? BankAccount { get; set; }
    public string? UserBankName { get; set; }
    public decimal Amount { get; set; }
    public string? Content { get; set; }
    public string? QrCode { get; set; }
    public string? OrderId { get; set; }
    public string? ImgId { get; set; }
    public string? TransactionId { get; set; }
    public string? TransactionRefId { get; set; }
    public string? QrLink { get; set; }
    public string? TerminalCode { get; set; }
    public string? ServiceCode { get; set; }
}

/// <summary>vietqr/bdsd/{terminalCode}. Ví dụ trong tài liệu cho thấy orderId có thể vắng hoặc rỗng.</summary>
public class BdsdMessage
{
    public string? BankAccount { get; set; }
    public decimal Amount { get; set; }
    public string? TransType { get; set; }
    public string? ReferenceNumber { get; set; }
    public string? OrderId { get; set; }
    public string? Content { get; set; }
    /// <summary>0: chờ, 1: thành công, 2: đã huỷ</summary>
    public int? Status { get; set; }
    /// <summary>dd/MM/yyyy HH:mm:ss, múi giờ UTC+7</summary>
    public string? TimePaid { get; set; }
}

/// <summary>vietqr/request-status/{terminalCode}</summary>
public class StatusRequestMessage
{
    public string BankAccount { get; set; } = "";
    /// <summary>0: theo orderId, 1: theo referenceNumber</summary>
    public int Type { get; set; }
    public string Value { get; set; } = "";
    public string CheckSum { get; set; } = "";
}

/// <summary>vietqr/response-status/{terminalCode}</summary>
public class StatusResponseMessage
{
    public string? ReferenceNumber { get; set; }
    public string? OrderId { get; set; }
    public decimal Amount { get; set; }
    public string? Content { get; set; }
    public string? TransType { get; set; }
    /// <summary>0: chờ thanh toán, 1: thành công, 2: đã huỷ</summary>
    public int Status { get; set; }
    public int Type { get; set; }
    public long TimeCreated { get; set; }
    /// <summary>Giây kể từ epoch.</summary>
    public long TimePaid { get; set; }
    public string? TerminalCode { get; set; }
    public string? Note { get; set; }
    public int RefundCount { get; set; }
    public decimal AmountRefunded { get; set; }
}

/// <summary>/vqr/handle-box</summary>
public class BoxSyncRequest
{
    public string MacAddr { get; set; } = "";
    public string? SerialNumber { get; set; }
    public string SecretKey { get; set; } = "";
    public string CheckSum { get; set; } = "";
}

/// <summary>/vqr/handle-box/response/{macAddr}</summary>
public class BoxSyncResponse
{
    public string? QrCertificate { get; set; }
    public string? BoxId { get; set; }
}

/// <summary>vietqr/boxId/{boxId}: gửi xuống sau khi chủ tài khoản quét qrCertificate bằng app VietQR.</summary>
public class BoxActivationMessage
{
    public string? NotificationType { get; set; }
    public string? BankAccount { get; set; }
    public string? BankShortName { get; set; }
    public string? UserBankName { get; set; }
    public string? TerminalCode { get; set; }
    public string? TerminalName { get; set; }
    public string? QrCode { get; set; }
    public string? BankCode { get; set; }
    public string? ImgBank { get; set; }
    public string? HomePage { get; set; }
}
