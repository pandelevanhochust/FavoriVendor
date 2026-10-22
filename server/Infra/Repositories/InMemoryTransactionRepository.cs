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

    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
