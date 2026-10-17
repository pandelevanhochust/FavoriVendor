using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

/// <summary>
/// Xử lý một giao dịch VietQR gọi về (Transaction Sync qua HTTP API Callback). Nguyên tắc:
///  1. Idempotent: cùng transactionid chỉ xử lý một lần, gọi lại vẫn trả thành công.
///  2. Lưu lịch sử toàn bộ giao dịch vào PostgreSQL (bảng bank_transactions).
///  3. Chỉ tự xác nhận (PAID) khi đơn đang PENDING VÀ số tiền khớp với FinalAmount của đơn.
///  4. Ghi nhận lượt sử dụng mã giảm giá khi đơn được xác nhận thanh toán thành công.
///  5. KHÔNG dùng MQTT - dùng API callback và đánh thức máy kiosk đang long-poll qua HTTP API.
/// </summary>
public class PaymentProcessor : IPaymentProcessor
{
    private readonly ITransactionRepository _txnRepo;
    private readonly IOrderRepository _orderRepo;
    private readonly IDiscountService _discountService;
    private readonly IOrderNotifier _notifier;
    private readonly ILogger<PaymentProcessor> _log;

    public PaymentProcessor(
        ITransactionRepository txnRepo,
        IOrderRepository orderRepo,
        IDiscountService discountService,
        IOrderNotifier notifier,
        ILogger<PaymentProcessor> log)
    {
        _txnRepo = txnRepo;
        _orderRepo = orderRepo;
        _discountService = discountService;
        _notifier = notifier;
        _log = log;
    }

    public async Task<string> ProcessAsync(TransactionCallback cb, CancellationToken ct)
    {
        var key = !string.IsNullOrWhiteSpace(cb.TransactionId) ? cb.TransactionId!.Trim()
                : !string.IsNullOrWhiteSpace(cb.ReferenceNumber) ? cb.ReferenceNumber!.Trim()
                : "NOID-" + Guid.NewGuid().ToString("N");

        // 1. Kiểm tra Idempotent từ Postgres
        var existing = await _txnRepo.GetByTransactionIdAsync(key, asNoTracking: true, ct);
        if (existing != null)
        {
            _log.LogInformation("Giao dịch {Txn} đã xử lý trước đó trong Postgres, trả lại refId cũ", key);
            return existing.RefTransactionId;
        }

        var txn = new BankTransaction
        {
            TransactionId = key,
            RefTransactionId = Guid.NewGuid().ToString("N"),
            ReferenceNumber = cb.ReferenceNumber,
            Amount = (long)cb.Amount,
            Content = cb.Content,
            BankAccount = cb.BankAccount,
            TransType = cb.TransType ?? "",
            TransactionTimeMs = cb.TransactionTime,
            ReceivedAt = DateTime.UtcNow
        };

        string? notifyOrderId = null;

        if (!string.Equals(cb.TransType, "C", StringComparison.OrdinalIgnoreCase))
        {
            txn.Result = "IGNORED_NOT_CREDIT"; // chỉ quan tâm tiền VÀO
        }
        else
        {
            var order = await FindOrderAsync(cb, ct);
            if (order == null)
            {
                txn.Result = "NO_ORDER";
            }
            else
            {
                txn.OrderId = order.OrderId;
                var amountOk = cb.Amount == order.Amount; // khớp với số tiền thực tế cần thanh toán

                if (order.Status == OrderStatus.Pending && amountOk)
                {
                    order.Status = OrderStatus.Paid;
                    order.PaidAt = DateTime.UtcNow;
                    order.BankTransactionId = key;
                    txn.Result = "PAID";
                    notifyOrderId = order.OrderId;

                    // Nếu có dùng mã giảm giá, ghi nhận lượt dùng
                    if (!string.IsNullOrWhiteSpace(order.DiscountCode))
                    {
                        try
                        {
                            await _discountService.RecordUsageAsync(order.DiscountCode, ct);
                        }
                        catch (Exception ex)
                        {
                            _log.LogWarning(ex, "Không thể cập nhật lượt dùng cho mã {Code}", order.DiscountCode);
                        }
                    }
                }
                else if (order.Status == OrderStatus.Paid)
                {
                    txn.Result = "DUPLICATE_PAYMENT"; // Đơn đã thanh toán rồi mà tiền vẫn về tiếp
                }
                else if (order.Status == OrderStatus.Pending)
                {
                    order.Status = OrderStatus.Review; // Sai số tiền thanh toán
                    txn.Result = "AMOUNT_MISMATCH";
                    notifyOrderId = order.OrderId;
                }
                else
                {
                    // Expired / Cancelled / Review: tiền về khi máy không còn chờ -> đánh dấu cần rà soát
                    txn.Result = "LATE_PAYMENT_" + order.Status.ToString().ToUpperInvariant();
                    order.Status = OrderStatus.Review;
                    notifyOrderId = order.OrderId;
                }
            }
        }

        // Lưu lịch sử giao dịch vào PostgreSQL
        await _txnRepo.AddAsync(txn, ct);
        try
        {
            await _txnRepo.SaveChangesAsync(ct);
            if (txn.OrderId != null)
            {
                await _orderRepo.SaveChangesAsync(ct);
            }
        }
        catch (DbUpdateException ex)
        {
            // Trường hợp 2 request song song hoặc xung đột
            var dup = await _txnRepo.GetByTransactionIdAsync(key, asNoTracking: true, ct);
            if (dup != null) return dup.RefTransactionId;

            _log.LogError(ex, "Lưu giao dịch {Txn} vào PostgreSQL thất bại, VietQR sẽ retry lại", key);
            throw;
        }

        _log.LogInformation("Đã lưu lịch sử giao dịch {Txn} vào Postgres: order={Order} amount={Amount} -> {Result}",
            key, txn.OrderId ?? "-", txn.Amount, txn.Result);

        // Đánh thức HTTP long-polling kết nối tới Kiosk
        if (notifyOrderId != null) _notifier.Notify(notifyOrderId);
        return txn.RefTransactionId;
    }

    private async Task<Order?> FindOrderAsync(TransactionCallback cb, CancellationToken ct)
    {
        Order? order = null;

        if (!string.IsNullOrWhiteSpace(cb.OrderId))
        {
            var id = cb.OrderId.Trim();
            order = await _orderRepo.GetByIdAsync(id, asNoTracking: false, ct);
        }

        if (order == null && !string.IsNullOrWhiteSpace(cb.Content))
        {
            order = await _orderRepo.GetByContentAsync(cb.Content, asNoTracking: false, ct);
        }

        return order;
    }
}
