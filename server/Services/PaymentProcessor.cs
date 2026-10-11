using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Data;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

/// <summary>
/// Xử lý một giao dịch VietQR gọi về (Transaction Sync). Nguyên tắc:
///  1. Idempotent: cùng transactionid chỉ xử lý một lần, gọi lại vẫn trả thành công.
///  2. Chỉ tự xác nhận (PAID) khi đơn đang PENDING VÀ số tiền khớp tuyệt đối.
///  3. Mọi trường hợp còn lại không bị bỏ qua: ghi nhật ký + chuyển đơn sang REVIEW để người xử lý.
/// </summary>
public class PaymentProcessor
{
    private readonly AppDb _db;
    private readonly OrderNotifier _notifier;
    private readonly ILogger<PaymentProcessor> _log;

    public PaymentProcessor(AppDb db, OrderNotifier notifier, ILogger<PaymentProcessor> log)
    {
        _db = db;
        _notifier = notifier;
        _log = log;
    }

    /// <returns>reftransactionid trả lại cho VietQR.</returns>
    public async Task<string> ProcessAsync(TransactionCallback cb, CancellationToken ct)
    {
        var key = !string.IsNullOrWhiteSpace(cb.TransactionId) ? cb.TransactionId!.Trim()
                : !string.IsNullOrWhiteSpace(cb.ReferenceNumber) ? cb.ReferenceNumber!.Trim()
                : "NOID-" + Guid.NewGuid().ToString("N");

        var existing = await _db.BankTransactions.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TransactionId == key, ct);
        if (existing != null)
        {
            _log.LogInformation("Giao dịch {Txn} đã xử lý trước đó, bỏ qua", key);
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
                var amountOk = cb.Amount == order.Amount;

                if (order.Status == OrderStatus.Pending && amountOk)
                {
                    order.Status = OrderStatus.Paid;
                    order.PaidAt = DateTime.UtcNow;
                    order.BankTransactionId = key;
                    txn.Result = "PAID";
                    notifyOrderId = order.OrderId;
                }
                else if (order.Status == OrderStatus.Paid)
                {
                    txn.Result = "DUPLICATE_PAYMENT"; // đơn đã trả rồi mà còn tiền về nữa -> cần hoàn tiền
                }
                else if (order.Status == OrderStatus.Pending)
                {
                    order.Status = OrderStatus.Review; // sai số tiền
                    txn.Result = "AMOUNT_MISMATCH";
                    notifyOrderId = order.OrderId;
                }
                else
                {
                    // Expired / Cancelled / Review: tiền về nhưng máy không còn chờ -> người xử lý
                    txn.Result = "LATE_PAYMENT_" + order.Status.ToString().ToUpperInvariant();
                    order.Status = OrderStatus.Review;
                    notifyOrderId = order.OrderId;
                }
            }
        }

        _db.BankTransactions.Add(txn);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
        {
            // Hai request cùng transactionid chạy song song, hoặc đơn bị đổi trạng thái giữa chừng.
            _db.ChangeTracker.Clear();
            var dup = await _db.BankTransactions.AsNoTracking()
                .FirstOrDefaultAsync(t => t.TransactionId == key, ct);
            if (dup != null) return dup.RefTransactionId;

            _log.LogError(ex, "Lưu giao dịch {Txn} thất bại, VietQR sẽ gọi lại", key);
            throw; // trả lỗi -> VietQR retry -> lần sau xử lý đúng (idempotent)
        }

        _log.LogInformation("Transaction {Txn}: order={Order} amount={Amount} -> {Result}",
            key, txn.OrderId ?? "-", txn.Amount, txn.Result);

        if (notifyOrderId != null) _notifier.Notify(notifyOrderId);
        return txn.RefTransactionId;
    }

    private async Task<Order?> FindOrderAsync(TransactionCallback cb, CancellationToken ct)
    {
        Order? order = null;

        if (!string.IsNullOrWhiteSpace(cb.OrderId))
        {
            var id = cb.OrderId.Trim();
            order = await _db.Orders.FirstOrDefaultAsync(o => o.OrderId == id, ct);
        }

        if (order == null && !string.IsNullOrWhiteSpace(cb.Content))
        {
            // Dự phòng: khớp theo nội dung chuyển khoản (sandbox VietQR trả content dạng VQRxxxx).
            var content = cb.Content.Trim().ToUpper();
            order = await _db.Orders.FirstOrDefaultAsync(o => o.QrContent.ToUpper() == content, ct);
        }

        return order;
    }
}
