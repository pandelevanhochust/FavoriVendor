using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Infra;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

/// <summary>
/// Xử lý một khoản tiền vào (từ tin biến động số dư hoặc từ tra cứu trạng thái). Nguyên tắc:
///  1. Idempotent: cùng referenceNumber chỉ xử lý một lần. Cùng một giao dịch có thể đến hai đường (BĐSD và tra cứu).
///  2. Chỉ tự xác nhận (PAID) khi đơn đang PENDING VÀ số tiền khớp tuyệt đối.
///  3. Mọi trường hợp còn lại không bị bỏ qua: ghi nhật ký + chuyển đơn sang REVIEW để người xử lý.
/// </summary>
public class PaymentProcessor
{
    private readonly IOrderRepository _orderRepo;
    private readonly IBankTransactionRepository _txnRepo;
    private readonly OrderNotifier _notifier;
    private readonly ILogger<PaymentProcessor> _log;

    public PaymentProcessor(
        IOrderRepository orderRepo,
        IBankTransactionRepository txnRepo,
        OrderNotifier notifier,
        ILogger<PaymentProcessor> log)
    {
        _orderRepo = orderRepo;
        _txnRepo = txnRepo;
        _notifier = notifier;
        _log = log;
    }

    /// <returns>Kết quả xử lý (PAID, NO_ORDER, AMOUNT_MISMATCH, DUPLICATE_PAYMENT, LATE_PAYMENT_*...).</returns>
    public async Task<string> ProcessAsync(PaymentNotification n, CancellationToken ct)
    {
        var key = !string.IsNullOrWhiteSpace(n.ReferenceNumber)
            ? n.ReferenceNumber!.Trim()
            : "NOREF-" + Guid.NewGuid().ToString("N");

        var existing = await _txnRepo.GetByIdAsync(key, ct);

        // Giao dịch đã xử lý xong (kể cả REVIEW) thì không làm lại. Riêng NO_ORDER được đánh giá lại: tin biến động số dư
        // đầu tiên có thể thiếu orderId, còn phản hồi tra cứu sau đó (cùng referenceNumber) thì có.
        if (existing != null && existing.Result != "NO_ORDER")
        {
            _log.LogInformation("Giao dịch {Ref} ({Source}) đã xử lý trước đó -> {Result}", key, n.Source, existing.Result);
            return existing.Result;
        }

        var isRetry = existing != null;
        var txn = existing ?? new BankTransaction
        {
            TransactionId = key,
            RefTransactionId = Guid.NewGuid().ToString("N"),
            ReferenceNumber = n.ReferenceNumber,
            Amount = (long)n.Amount,
            Content = n.Content,
            BankAccount = n.BankAccount,
            TransType = n.TransType ?? "",
            TransactionTimeMs = n.TimePaidMs,
            ReceivedAt = DateTime.UtcNow
        };

        string? notifyOrderId = null;

        if (!string.Equals(n.TransType, "C", StringComparison.OrdinalIgnoreCase))
        {
            txn.Result = "IGNORED_NOT_CREDIT"; // chỉ quan tâm tiền VÀO
        }
        else
        {
            var token = Helpers.ExtractQrToken(n.Content);
            var order = await _orderRepo.FindMatchingOrderAsync(n.OrderId, token, n.Content, ct);
            if (order == null)
            {
                txn.Result = "NO_ORDER";
            }
            else
            {
                txn.OrderId = order.OrderId;
                var amountOk = n.Amount == order.Amount;

                if (order.Status == OrderStatus.Pending && amountOk)
                {
                    var updated = await _orderRepo.TryMarkPaidAsync(order.OrderId, key, DateTime.UtcNow, ct);
                    if (updated)
                    {
                        txn.Result = "PAID";
                        notifyOrderId = order.OrderId;
                    }
                    else
                    {
                        // Luồng khác đã thay đổi trạng thái đơn
                        var current = await _orderRepo.GetByIdAsync(order.OrderId, ct);
                        txn.Result = current?.Status == OrderStatus.Paid ? "DUPLICATE_PAYMENT" : "LATE_PAYMENT_" + current?.Status;
                    }
                }
                else if (order.Status == OrderStatus.Paid)
                {
                    txn.Result = "DUPLICATE_PAYMENT"; // đơn đã trả rồi mà còn tiền về nữa -> cần hoàn tiền
                }
                else if (order.Status == OrderStatus.Pending)
                {
                    await _orderRepo.MarkReviewAsync(order.OrderId, ct); // sai số tiền
                    txn.Result = "AMOUNT_MISMATCH";
                    notifyOrderId = order.OrderId;
                }
                else
                {
                    // Expired / Cancelled / Review: tiền về nhưng máy không còn chờ -> người xử lý
                    txn.Result = "LATE_PAYMENT_" + order.Status.ToString().ToUpperInvariant();
                    await _orderRepo.MarkReviewAsync(order.OrderId, ct);
                    notifyOrderId = order.OrderId;
                }
            }
        }

        if (isRetry)
        {
            await _txnRepo.UpdateResultAsync(key, txn.Result, txn.OrderId, ct);
        }
        else
        {
            try
            {
                await _txnRepo.CreateAsync(txn, ct);
            }
            catch (DbUpdateException)
            {
                var dup = await _txnRepo.GetByIdAsync(key, ct);
                if (dup != null) return dup.Result;
                throw;
            }
        }

        _log.LogInformation("Giao dịch {Ref} [{Source}]{Retry}: order={Order} số tiền={Amount} -> {Result}",
            key, n.Source, isRetry ? " (đánh giá lại NO_ORDER)" : "", txn.OrderId ?? "-", txn.Amount, txn.Result);

        if (notifyOrderId != null) _notifier.Notify(notifyOrderId);
        return txn.Result;
    }
}
