using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Infra.External;

public interface IVietQrClient
{
    Task<VietQrGenerateDto> GenerateQrAsync(string orderId, long amount, string content, CancellationToken ct);
}
