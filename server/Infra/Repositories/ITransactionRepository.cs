using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface ITransactionRepository
{
    Task<TransactionRevenueSummaryDto> GetRevenueSummaryAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        CancellationToken ct = default);
    Task<BankTransaction?> GetByTransactionIdAsync(string transactionId, bool asNoTracking = false, CancellationToken ct = default);
    Task<BankTransaction?> GetByOrderIdAsync(string orderId, CancellationToken ct = default);
    Task AddAsync(BankTransaction transaction, CancellationToken ct = default);
    Task<List<BankTransaction>> GetRecentTransactionsAsync(int limit = 50, CancellationToken ct = default);
    Task<List<BankTransaction>> GetTransactionsFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        string? type = null,
        int limit = 50,
        int page = 1,
        CancellationToken ct = default);
    Task<int> CountTransactionsFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        string? type = null,
        CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
