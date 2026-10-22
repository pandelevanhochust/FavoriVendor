using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface ITransactionRepository
{
    Task<BankTransaction?> GetByTransactionIdAsync(string transactionId, bool asNoTracking = false, CancellationToken ct = default);
    Task<BankTransaction?> GetByOrderIdAsync(string orderId, CancellationToken ct = default);
    Task AddAsync(BankTransaction transaction, CancellationToken ct = default);
    Task<List<BankTransaction>> GetRecentTransactionsAsync(int limit = 50, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
