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

    public async Task<BankTransaction?> GetByOrderIdAsync(string orderId, CancellationToken ct = default)
    {
        return await _db.BankTransactions
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.OrderId == orderId, ct);
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

    public async Task<List<BankTransaction>> GetTransactionsFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        string? type = null,
        int limit = 50,
        int page = 1,
        CancellationToken ct = default)
    {
        var query = _db.BankTransactions.AsNoTracking().AsQueryable();

        if (fromUtc.HasValue)
        {
            query = query.Where(t => t.ReceivedAt >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            query = query.Where(t => t.ReceivedAt <= toUtc.Value);
        }

        if (!string.IsNullOrWhiteSpace(type))
        {
            var normalizedType = type.Trim().ToLowerInvariant();
            if (normalizedType is "cash" or "tien_mat")
            {
                query = query.Where(t => t.TransType == "CASH" || t.BankAccount == "CASH_BOX" || t.TransactionId.StartsWith("CASH-"));
            }
            else if (normalizedType is "no_order" or "other" or "thiet_bi_khac")
            {
                query = query.Where(t => t.Result == "NO_ORDER");
            }
            else if (normalizedType is "bank" or "transfer" or "chuyen_khoan" or "vietqr")
            {
                query = query.Where(t => t.TransType != "CASH" && t.BankAccount != "CASH_BOX" && !t.TransactionId.StartsWith("CASH-") && t.Result != "NO_ORDER");
            }
        }

        var p = Math.Max(1, page);
        var take = Math.Clamp(limit, 1, 500);
        var skip = (p - 1) * take;

        return await query
            .OrderByDescending(t => t.ReceivedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);
    }

    public async Task<int> CountTransactionsFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        string? type = null,
        CancellationToken ct = default)
    {
        var query = _db.BankTransactions.AsNoTracking().AsQueryable();

        if (fromUtc.HasValue)
        {
            query = query.Where(t => t.ReceivedAt >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            query = query.Where(t => t.ReceivedAt <= toUtc.Value);
        }

        if (!string.IsNullOrWhiteSpace(type))
        {
            var normalizedType = type.Trim().ToLowerInvariant();
            if (normalizedType is "cash" or "tien_mat")
            {
                query = query.Where(t => t.TransType == "CASH" || t.BankAccount == "CASH_BOX" || t.TransactionId.StartsWith("CASH-"));
            }
            else if (normalizedType is "no_order" or "other" or "thiet_bi_khac")
            {
                query = query.Where(t => t.Result == "NO_ORDER");
            }
            else if (normalizedType is "bank" or "transfer" or "chuyen_khoan" or "vietqr")
            {
                query = query.Where(t => t.TransType != "CASH" && t.BankAccount != "CASH_BOX" && !t.TransactionId.StartsWith("CASH-") && t.Result != "NO_ORDER");
            }
        }

        return await query.CountAsync(ct);
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
