using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// API xem lịch sử giao dịch (In-memory buffer trên server để app Android gọi lấy về).
/// </summary>
[ApiController]
[Route("vendor/transactions")]
[KioskApiKey]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionRepository _txnRepo;
    private readonly IOrderRepository _orderRepo;
    private readonly IDiscountService _discountService;
    private readonly ILogger<TransactionsController> _logger;

    public TransactionsController(
        ITransactionRepository txnRepo,
        IOrderRepository orderRepo,
        IDiscountService discountService,
        ILogger<TransactionsController> logger)
    {
        _txnRepo = txnRepo;
        _orderRepo = orderRepo;
        _discountService = discountService;
        _logger = logger;
    }

    /// <summary>
    /// Lấy danh sách giao dịch có bộ lọc ngày (nguyên 1 ngày 'date' hoặc khoảng 'fromDate'-'toDate'),
    /// và loại giao dịch 'type' (cash: tiền mặt, bank: chuyển khoản VietQR, no_order: thiết bị khác/không có đơn).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] string? date,
        [FromQuery] string? fromDate,
        [FromQuery] string? toDate,
        [FromQuery] string? type,
        [FromQuery] int limit = 50,
        [FromQuery] int page = 1,
        [FromQuery] int tz = 7,
        CancellationToken ct = default)
    {
        var count = Math.Clamp(limit, 1, 200);
        var pageNum = Math.Max(1, page);

        var (fromUtc, toUtc) = Helpers.ParseDateFilter(date, fromDate, toDate, tz);

        var txns = await _txnRepo.GetTransactionsFilteredAsync(fromUtc, toUtc, type, count, pageNum, ct);
        var totalCount = await _txnRepo.CountTransactionsFilteredAsync(fromUtc, toUtc, type, ct);

        Response.Headers["X-Total-Count"] = totalCount.ToString();
        Response.Headers["X-Page"] = pageNum.ToString();
        Response.Headers["X-Limit"] = count.ToString();

        var dtos = txns.Select(t => new BankTransactionDto(
            Id: t.Id,
            TransactionId: t.TransactionId,
            RefTransactionId: t.RefTransactionId,
            ReferenceNumber: t.ReferenceNumber,
            Amount: t.Amount,
            Content: t.Content,
            BankAccount: t.BankAccount,
            TransType: t.TransType,
            OrderId: t.OrderId,
            Result: t.Result,
            TransactionTimeMs: t.TransactionTimeMs,
            ReceivedAt: t.ReceivedAt
        )).ToList();

        return Ok(dtos);
    }

    /// <summary>Lấy chi tiết giao dịch ngân hàng theo orderId.</summary>
    [HttpGet("{orderId}")]
    public async Task<IActionResult> GetTransactionByOrderId(string orderId, CancellationToken ct = default)
    {
        var txn = await _txnRepo.GetByOrderIdAsync(orderId, ct);
        if (txn == null) return NotFound(new ErrorBody("Không tìm thấy giao dịch cho đơn hàng này"));

        return Ok(new BankTransactionDto(
            Id: txn.Id,
            TransactionId: txn.TransactionId,
            RefTransactionId: txn.RefTransactionId,
            ReferenceNumber: txn.ReferenceNumber,
            Amount: txn.Amount,
            Content: txn.Content,
            BankAccount: txn.BankAccount,
            TransType: txn.TransType,
            OrderId: txn.OrderId,
            Result: txn.Result,
            TransactionTimeMs: txn.TransactionTimeMs,
            ReceivedAt: txn.ReceivedAt
        ));
    }

    /// <summary>
    /// API đồng bộ giao dịch tiền mặt từ app Android Kiosk lên máy chủ và lưu vào cơ sở dữ liệu Supabase/PostgreSQL.
    /// </summary>
    [HttpPost("cash")]
    [HttpPost("sync-cash")]
    public async Task<IActionResult> SyncCashTransaction([FromBody] SyncCashTransactionRequest req, CancellationToken ct)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.OrderId) || req.Amount <= 0)
        {
            return BadRequest(new ErrorBody("Thông tin giao dịch tiền mặt không hợp lệ."));
        }

        var orderId = req.OrderId.Trim();
        var existingOrder = await _orderRepo.GetByIdAsync(orderId, asNoTracking: true, ct);
        if (existingOrder != null)
        {
            _logger.LogInformation("Giao dịch tiền mặt {OrderId} đã tồn tại trong DB, trả về thành công (Idempotent)", orderId);
            return Ok(new SyncCashTransactionResponse(true, orderId, "Giao dịch đã được lưu trước đó."));
        }

        var now = DateTime.UtcNow;
        var paidAt = req.CreatedAt > 0 
            ? DateTimeOffset.FromUnixTimeMilliseconds(req.CreatedAt).UtcDateTime 
            : now;

        var originalAmount = (req.UnitPrice > 0 && req.Quantity > 0)
            ? req.UnitPrice * req.Quantity
            : req.Amount + req.DiscountAmount;

        // 1. Tạo bản ghi đơn hàng Order trạng thái PAID
        var order = new Entities.Order
        {
            OrderId = orderId,
            OriginalAmount = originalAmount,
            DiscountAmount = req.DiscountAmount,
            Amount = req.Amount,
            DiscountCode = req.DiscountCode,
            Status = Entities.OrderStatus.Paid,
            QrCode = null,
            QrContent = "CASH",
            DeviceId = req.DeviceId,
            CreatedAt = paidAt,
            ExpiresAt = paidAt.AddMinutes(5),
            PaidAt = paidAt,
            BankTransactionId = "CASH-" + orderId
        };
        await _orderRepo.AddAsync(order, ct);

        // 2. Tạo bản ghi giao dịch BankTransaction (TransType = CASH)
        var txn = new Entities.BankTransaction
        {
            TransactionId = "CASH-" + orderId,
            RefTransactionId = orderId,
            ReferenceNumber = "CASH_DIRECT",
            Amount = req.Amount,
            Content = $"Thanh toán tiền mặt Kiosk đơn {orderId} (Đơn giá: {req.UnitPrice:N0}đ x {req.Quantity})",
            BankAccount = "CASH_BOX",
            TransType = "CASH",
            OrderId = orderId,
            Result = "PAID",
            TransactionTimeMs = req.CreatedAt > 0 ? req.CreatedAt : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ReceivedAt = now
        };
        await _txnRepo.AddAsync(txn, ct);

        // 3. Ghi nhận lượt sử dụng mã giảm giá (nếu có)
        if (!string.IsNullOrWhiteSpace(req.DiscountCode))
        {
            await _discountService.RecordUsageAsync(req.DiscountCode, ct);
        }

        await _orderRepo.SaveChangesAsync(ct);
        await _txnRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Đã lưu giao dịch tiền mặt {OrderId}: {Amount:N0} VND vào PostgreSQL Supabase thành công", orderId, req.Amount);

        return Ok(new SyncCashTransactionResponse(true, orderId, "Lưu giao dịch tiền mặt vào cơ sở dữ liệu thành công."));
    }
}
