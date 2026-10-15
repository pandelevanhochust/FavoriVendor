namespace VietQrKiosk.Server.Infra.Repositories;

public interface IBankTransactionRepository
{
    Task<BankTransaction?> GetByIdAsync(string transactionId, CancellationToken ct = default);
    Task CreateAsync(BankTransaction transaction, CancellationToken ct = default);
    Task UpdateResultAsync(string transactionId, string result, string? orderId, CancellationToken ct = default);
}

