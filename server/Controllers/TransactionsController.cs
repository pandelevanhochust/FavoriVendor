using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;

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

    public TransactionsController(ITransactionRepository txnRepo)
    {
        _txnRepo = txnRepo;
    }

    /// <summary>Lấy danh sách các giao dịch gần nhất trên Server.</summary>
    [HttpGet]
    public async Task<IActionResult> GetRecentTransactions([FromQuery] int limit = 50, CancellationToken ct = default)
    {
        var count = Math.Clamp(limit, 1, 200);
        var txns = await _txnRepo.GetRecentTransactionsAsync(count, ct);

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
        ));

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
}
