using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// API xem lịch sử giao dịch đã lưu trong PostgreSQL.
/// </summary>
[ApiController]
[Route("kiosk/transactions")]
[KioskApiKey]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionRepository _txnRepo;

    public TransactionsController(ITransactionRepository txnRepo)
    {
        _txnRepo = txnRepo;
    }

    /// <summary>Lấy danh sách các giao dịch gần nhất lưu trong Postgres.</summary>
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
}
