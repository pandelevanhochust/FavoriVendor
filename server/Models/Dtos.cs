using System.Text.Json.Serialization;

namespace VietQrKiosk.Server.Models;

// ---------- API cho máy Kiosk (Android) ----------

public record CreateOrderRequest(
    long Amount,
    string? DeviceId,
    string? DiscountCode = null);

/// <summary>Trạng thái: PENDING | PAID | EXPIRED | CANCELLED | REVIEW</summary>
public record OrderDto(
    string OrderId,
    string Status,
    long Amount,
    long OriginalAmount,
    long DiscountAmount,
    string? DiscountCode,
    string? QrCode,
    string? Content,
    int ExpiresInSeconds,
    DateTime? PaidAt);

public record ValidateDiscountRequest(
    string Code,
    long Amount);

public record ValidateDiscountResponse(
    bool IsValid,
    string? Message,
    string? Code,
    long OriginalAmount,
    long DiscountAmount,
    long FinalAmount);

public record DiscountSummaryDto(
    string Code,
    string Description,
    string Type,
    long Value,
    long? MinOrderAmount,
    long? MaxDiscountAmount,
    DateTime? EndDateUtc);

public record ErrorBody(string Message);

// ---------- API server cung cấp cho VietQR gọi vào (HTTP API Callback) ----------

/// <summary>Response của API Get Token (đối tác) theo tài liệu VietQR.</summary>
public record TokenResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("token_type")] string TokenType,
    [property: JsonPropertyName("expires_in")] int ExpiresIn);

/// <summary>Body VietQR gửi vào API Transaction Sync.</summary>
public class TransactionCallback
{
    [JsonPropertyName("transactionid")] public string? TransactionId { get; set; }
    [JsonPropertyName("transactiontime")] public long TransactionTime { get; set; }
    [JsonPropertyName("referencenumber")] public string? ReferenceNumber { get; set; }
    [JsonPropertyName("amount")] public decimal Amount { get; set; }
    [JsonPropertyName("content")] public string? Content { get; set; }
    [JsonPropertyName("bankaccount")] public string? BankAccount { get; set; }
    [JsonPropertyName("orderId")] public string? OrderId { get; set; }
    [JsonPropertyName("transType")] public string? TransType { get; set; }
    [JsonPropertyName("sign")] public string? Sign { get; set; }
    [JsonPropertyName("terminalCode")] public string? TerminalCode { get; set; }
    [JsonPropertyName("subTerminalCode")] public string? SubTerminalCode { get; set; }
    [JsonPropertyName("serviceCode")] public string? ServiceCode { get; set; }
    [JsonPropertyName("urlLink")] public string? UrlLink { get; set; }
}

public record RefObject([property: JsonPropertyName("reftransactionid")] string Reftransactionid);

/// <summary>Định dạng response VietQR yêu cầu: {error, errorReason, toastMessage, object:{reftransactionid}}</summary>
public record CallbackResponse(bool Error, string? ErrorReason, string? ToastMessage, RefObject? Object);

// ---------- DTO đọc response của VietQR ----------

public class VietQrTokenDto
{
    [JsonPropertyName("access_token")] public string? AccessToken { get; set; }
    [JsonPropertyName("expires_in")] public int ExpiresIn { get; set; }
}

public class VietQrGenerateDto
{
    public string? QrCode { get; set; }
    public string? Content { get; set; }
    public string? QrLink { get; set; }
    public string? Status { get; set; }   // "FAILED" khi lỗi
    public string? Message { get; set; }  // mã lỗi, vd E34
}

// ---------- DTO xem lịch sử giao dịch (PostgreSQL) ----------

public record BankTransactionDto(
    long Id,
    string TransactionId,
    string RefTransactionId,
    string? ReferenceNumber,
    long Amount,
    string? Content,
    string? BankAccount,
    string TransType,
    string? OrderId,
    string Result,
    long TransactionTimeMs,
    DateTime ReceivedAt);
