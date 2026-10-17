using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class TransactionRepository : ITransactionRepository
{
    private readonly AppDbContext _db;

    public TransactionRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<BankTransaction?> GetByTransactionIdAsync(string transactionId, bool asNoTracking = false, CancellationToken ct = default)
    {
        var query = asNoTracking ? _db.BankTransactions.AsNoTracking() : _db.BankTransactions;
        return await query.FirstOrDefaultAsync(t => t.TransactionId == transactionId, ct);
    }

    public async Task AddAsync(BankTransaction transaction, CancellationToken ct = default)
    {
        await _db.BankTransactions.AddAsync(transaction, ct);
    }

    public async Task<List<BankTransaction>> GetRecentTransactionsAsync(int limit = 50, CancellationToken ct = default)
    {
        return await _db.BankTransactions
            .AsNoTracking()
            .OrderByDescending(t => t.ReceivedAt)
            .Take(limit)
            .ToListAsync(ct);
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
