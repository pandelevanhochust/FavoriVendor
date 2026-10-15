using Microsoft.EntityFrameworkCore;

namespace VietQrKiosk.Server.Infra.Repositories;

public class BankTransactionRepository : IBankTransactionRepository
{
    private readonly IDbContextFactory<KioskDbContext> _factory;

    public BankTransactionRepository(IDbContextFactory<KioskDbContext> factory)
    {
        _factory = factory;
    }

    public async Task<BankTransaction?> GetByIdAsync(string transactionId, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        return await db.BankTransactions.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TransactionId == transactionId, ct);
    }

    public async Task CreateAsync(BankTransaction transaction, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        db.BankTransactions.Add(transaction);
        await db.SaveChangesAsync(ct);
    }

    public async Task UpdateResultAsync(string transactionId, string result, string? orderId, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(ct);
        await db.BankTransactions.Where(x => x.TransactionId == transactionId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Result, result)
                .SetProperty(x => x.OrderId, orderId), ct);
    }
}
