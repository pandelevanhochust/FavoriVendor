using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services.Interfaces;

public interface IPaymentProcessor
{
    Task<string> ProcessAsync(TransactionCallback cb, CancellationToken ct);
}
