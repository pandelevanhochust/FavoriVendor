using System.Collections.Concurrent;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public class InMemoryTransactionRepository : ITransactionRepository
{
    private readonly ConcurrentDictionary<string, BankTransaction> _txns = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentQueue<BankTransaction> _recentQueue = new();
    private long _autoId = 0;

    public Task<BankTransaction?> GetByTransactionIdAsync(string transactionId, bool asNoTracking = false, CancellationToken ct = default)
    {
        _txns.TryGetValue(transactionId, out var txn);
        return Task.FromResult(txn);
    }

    public Task<BankTransaction?> GetByOrderIdAsync(string orderId, CancellationToken ct = default)
    {
        var txn = _txns.Values.FirstOrDefault(t => string.Equals(t.OrderId, orderId, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult(txn);
    }

    public Task AddAsync(BankTransaction transaction, CancellationToken ct = default)
    {
        if (transaction.Id == 0)
        {
            transaction.Id = Interlocked.Increment(ref _autoId);
        }

        _txns[transaction.TransactionId] = transaction;
        _recentQueue.Enqueue(transaction);

        // Giữ tối đa 1000 giao dịch gần nhất trong RAM
        while (_recentQueue.Count > 1000)
        {
            _recentQueue.TryDequeue(out _);
        }

        return Task.CompletedTask;
    }

    public Task<List<BankTransaction>> GetRecentTransactionsAsync(int limit = 50, CancellationToken ct = default)
    {
        var list = _recentQueue.Reverse().Take(limit).ToList();
        return Task.FromResult(list);
    }

    public Task<List<BankTransaction>> GetTransactionsFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        string? type = null,
        int limit = 50,
        int page = 1,
        CancellationToken ct = default)
    {
        var query = _recentQueue.AsEnumerable();

        if (fromUtc.HasValue)
            query = query.Where(t => t.ReceivedAt >= fromUtc.Value);

        if (toUtc.HasValue)
            query = query.Where(t => t.ReceivedAt <= toUtc.Value);

        if (!string.IsNullOrWhiteSpace(type))
        {
            var normalizedType = type.Trim().ToLowerInvariant();
            if (normalizedType is "cash" or "tien_mat")
                query = query.Where(t => t.TransType == "CASH" || t.BankAccount == "CASH_BOX" || t.TransactionId.StartsWith("CASH-"));
            else if (normalizedType is "no_order" or "other" or "thiet_bi_khac")
                query = query.Where(t => t.Result == "NO_ORDER");
            else if (normalizedType is "bank" or "transfer" or "chuyen_khoan" or "vietqr")
                query = query.Where(t => t.TransType != "CASH" && t.BankAccount != "CASH_BOX" && !t.TransactionId.StartsWith("CASH-") && t.Result != "NO_ORDER");
        }

        var p = Math.Max(1, page);
        var take = Math.Clamp(limit, 1, 500);
        var skip = (p - 1) * take;

        var list = query.OrderByDescending(t => t.ReceivedAt).Skip(skip).Take(take).ToList();
        return Task.FromResult(list);
    }

    public Task<int> CountTransactionsFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        string? type = null,
        CancellationToken ct = default)
    {
        var query = _recentQueue.AsEnumerable();

        if (fromUtc.HasValue)
            query = query.Where(t => t.ReceivedAt >= fromUtc.Value);

        if (toUtc.HasValue)
            query = query.Where(t => t.ReceivedAt <= toUtc.Value);

        if (!string.IsNullOrWhiteSpace(type))
        {
            var normalizedType = type.Trim().ToLowerInvariant();
            if (normalizedType is "cash" or "tien_mat")
                query = query.Where(t => t.TransType == "CASH" || t.BankAccount == "CASH_BOX" || t.TransactionId.StartsWith("CASH-"));
            else if (normalizedType is "no_order" or "other" or "thiet_bi_khac")
                query = query.Where(t => t.Result == "NO_ORDER");
            else if (normalizedType is "bank" or "transfer" or "chuyen_khoan" or "vietqr")
                query = query.Where(t => t.TransType != "CASH" && t.BankAccount != "CASH_BOX" && !t.TransactionId.StartsWith("CASH-") && t.Result != "NO_ORDER");
        }

        return Task.FromResult(query.Count());
    }

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
