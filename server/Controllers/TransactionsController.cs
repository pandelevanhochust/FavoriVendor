using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using VietQrKiosk.Server.Infra.Repositories;

using VietQrKiosk.Server.Models;

using VietQrKiosk.Server.Services;

using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]

[Route("vendor/transactions")]

[Tags("Transactions")]

[Authorize]

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

    /// <remarks>
    /// Retrieves a paginated list of transactions filtered by date range and payment category.
    /// </remarks>
    /// <param name="startDate" example="2026-11-09T00:00:00+07:00">Start datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="endDate" example="2026-11-09T23:59:59+07:00">End datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="type" example="bank">
    /// Transaction category filter. Allowed Enum values:
    /// - 'bank': VietQR bank transfer payments.
    /// - 'cash': Direct cash box payments from Android kiosk.
    /// - 'no_order': External transfer received with no matching kiosk order.
    /// </param>
    /// <param name="limit" example="50">Maximum number of records to return (allowed range: 1 to 200, default: 50).</param>
    /// <param name="page" example="1">1-based page index for pagination (default: 1).</param>
    /// <param name="tz" example="7">Timezone offset in hours from UTC (default: 7 for Vietnam ICT).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A list of BankTransactionDto items and pagination headers (X-Total-Count, X-Page, X-Limit).</returns>

    [HttpGet]

    public async Task<IActionResult> GetTransactions(

        [FromQuery] string? startDate,

        [FromQuery] string? endDate,

        [FromQuery] string? type,

        [FromQuery] int limit = 50,

        [FromQuery] int page = 1,

        [FromQuery] int tz = 7,

        CancellationToken ct = default)

    {

        var count = Math.Clamp(limit, 1, 200);

        var pageNum = Math.Max(1, page);

        var (fromUtc, toUtc) = Helpers.ParseDateRange(startDate, endDate, tz);

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

    /// <remarks>
    /// Retrieves bank transaction details associated with a specific order ID.
    /// </remarks>
    /// <param name="orderId" example="ORD-20261109-001">The unique kiosk order identifier.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Matching BankTransactionDto details.</returns>

    [HttpGet("{orderId}")]

    public async Task<IActionResult> GetTransactionByOrderId(string orderId, CancellationToken ct = default)

    {

        var txn = await _txnRepo.GetByOrderIdAsync(orderId, ct);

        if (txn == null) return NotFound(new ErrorBody("Transaction not found for this order ID"));

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

    /// <remarks>
    /// Synchronizes a direct or offline cash payment collected by the Android kiosk hardware to the backend database.
    /// </remarks>
    /// <remarks>
    /// Automatically creates a PAID Order entity and a CASH BankTransaction record in PostgreSQL. The operation is idempotent.
    /// </remarks>
    /// <param name="req">Cash payment payload containing order ID, collected amount, pricing, and timestamp.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Sync result confirming transaction persistence.</returns>

    [HttpPost("cash")]

    [HttpPost("sync-cash")]

    public async Task<IActionResult> SyncCashTransaction([FromBody] SyncCashTransactionRequest req, CancellationToken ct)

    {

        if (req == null || string.IsNullOrWhiteSpace(req.OrderId) || req.Amount <= 0)

        {

            return BadRequest(new ErrorBody("Invalid cash transaction payload."));

        }

        var orderId = req.OrderId.Trim();

        var existingOrder = await _orderRepo.GetByIdAsync(orderId, asNoTracking: true, ct);

        if (existingOrder != null)

        {

            _logger.LogInformation("Cash transaction {OrderId} already exists in DB, returning idempotent success", orderId);

            return Ok(new SyncCashTransactionResponse(true, orderId, "Transaction already synced."));

        }

        var now = DateTime.UtcNow;

        var paidAt = req.CreatedAt > 0 

            ? DateTimeOffset.FromUnixTimeMilliseconds(req.CreatedAt).UtcDateTime 

            : now;

        var originalAmount = (req.UnitPrice > 0 && req.Quantity > 0)

            ? req.UnitPrice * req.Quantity

            : req.Amount + req.DiscountAmount;

        // 1. Create PAID Order record

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

        // 2. Create BankTransaction record with TransType = CASH

        var txn = new Entities.BankTransaction

        {

            TransactionId = "CASH-" + orderId,

            RefTransactionId = orderId,

            ReferenceNumber = "CASH_DIRECT",

            Amount = req.Amount,

            Content = $"Kiosk cash payment order {orderId} (Unit price: {req.UnitPrice:N0} x {req.Quantity})",

            BankAccount = "CASH_BOX",

            TransType = "CASH",

            OrderId = orderId,

            Result = "PAID",

            TransactionTimeMs = req.CreatedAt > 0 ? req.CreatedAt : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),

            ReceivedAt = paidAt

        };

        await _txnRepo.AddAsync(txn, ct);

        // 3. Record discount usage if applicable

        if (!string.IsNullOrWhiteSpace(req.DiscountCode))

        {

            await _discountService.RecordUsageAsync(req.DiscountCode, ct);

        }

        await _orderRepo.SaveChangesAsync(ct);

        await _txnRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Persisted cash transaction {OrderId}: {Amount:N0} VND successfully", orderId, req.Amount);

        return Ok(new SyncCashTransactionResponse(true, orderId, "Cash transaction successfully saved."));

    }

    /// <remarks>
    /// Calculates aggregate revenue, transaction counts, and breakdown between VietQR bank transfers (TransType=C) and cash box payments (TransType=CASH) from the bank_transactions table.
    /// </remarks>
    /// <param name="startDate" example="2026-11-09T00:00:00+07:00">Start datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="endDate" example="2026-11-09T23:59:59+07:00">End datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="tz" example="7">Timezone offset in hours from UTC (default: 7 for Vietnam ICT).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>TransactionRevenueSummaryDto with revenue breakdown and transaction counts.</returns>

    [HttpGet("revenue-summary")]

    public async Task<ActionResult<TransactionRevenueSummaryDto>> GetRevenueSummary(

        [FromQuery] string? startDate,

        [FromQuery] string? endDate,

        [FromQuery] int tz = 7,

        CancellationToken ct = default)

    {

        var (fromUtc, toUtc) = Helpers.ParseDateRange(startDate, endDate, tz);

        var summary = await _txnRepo.GetRevenueSummaryAsync(fromUtc, toUtc, ct);

        return Ok(summary);

    }

}