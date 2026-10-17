using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services.Interfaces;

public interface IDiscountService
{
    Task<ValidateDiscountResponse> ValidateAsync(string code, long orderAmount, CancellationToken ct = default);
    Task<(bool IsValid, string? ErrorReason, long DiscountAmount, long FinalAmount, DiscountCode? Discount)> ApplyDiscountAsync(
        string? code, long orderAmount, CancellationToken ct = default);
    Task RecordUsageAsync(string code, CancellationToken ct = default);
    Task<List<DiscountSummaryDto>> GetActiveDiscountsAsync(CancellationToken ct = default);
}
