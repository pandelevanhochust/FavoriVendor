using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

public class DiscountService : IDiscountService
{
    private readonly IDiscountRepository _discountRepo;
    private readonly ILogger<DiscountService> _logger;

    public DiscountService(IDiscountRepository discountRepo, ILogger<DiscountService> logger)
    {
        _discountRepo = discountRepo;
        _logger = logger;
    }

    public async Task<ValidateDiscountResponse> ValidateAsync(string code, long orderAmount, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return new ValidateDiscountResponse(false, "Mã giảm giá không được để trống", null, orderAmount, 0, orderAmount);
        }

        var discount = await _discountRepo.GetByCodeAsync(code, asNoTracking: true, ct);
        if (discount == null)
        {
            return new ValidateDiscountResponse(false, "Mã giảm giá không tồn tại.", code.ToUpper(), orderAmount, 0, orderAmount);
        }

        var now = DateTime.UtcNow;
        if (!discount.IsValid(orderAmount, now, out var errorReason))
        {
            return new ValidateDiscountResponse(false, errorReason, discount.Code, orderAmount, 0, orderAmount);
        }

        var discountAmount = discount.CalculateDiscount(orderAmount);
        var finalAmount = Math.Max(0, orderAmount - discountAmount);

        return new ValidateDiscountResponse(
            IsValid: true,
            Message: "Mã giảm giá hợp lệ.",
            Code: discount.Code,
            OriginalAmount: orderAmount,
            DiscountAmount: discountAmount,
            FinalAmount: finalAmount);
    }

    public async Task<(bool IsValid, string? ErrorReason, long DiscountAmount, long FinalAmount, DiscountCode? Discount)> ApplyDiscountAsync(
        string? code, long orderAmount, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return (true, null, 0, orderAmount, null);
        }

        var discount = await _discountRepo.GetByCodeAsync(code, asNoTracking: false, ct);
        if (discount == null)
        {
            return (false, "Mã giảm giá không tồn tại.", 0, orderAmount, null);
        }

        var now = DateTime.UtcNow;
        if (!discount.IsValid(orderAmount, now, out var errorReason))
        {
            return (false, errorReason, 0, orderAmount, null);
        }

        var discountAmount = discount.CalculateDiscount(orderAmount);
        var finalAmount = Math.Max(0, orderAmount - discountAmount);

        return (true, null, discountAmount, finalAmount, discount);
    }

    public async Task RecordUsageAsync(string code, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code)) return;

        var discount = await _discountRepo.GetByCodeAsync(code, asNoTracking: false, ct);
        if (discount != null)
        {
            discount.UsedCount++;
            await _discountRepo.SaveChangesAsync(ct);
            _logger.LogInformation("Ghi nhận sử dụng mã giảm giá {Code}, lượt dùng hiện tại: {UsedCount}", discount.Code, discount.UsedCount);
        }
    }

    public async Task<List<DiscountSummaryDto>> GetActiveDiscountsAsync(CancellationToken ct = default)
    {
        var discounts = await _discountRepo.GetActiveDiscountsAsync(ct);
        return discounts.Select(d => new DiscountSummaryDto(
            Code: d.Code,
            Description: d.Description,
            Type: d.Type.ToString(),
            Value: d.Value,
            MinOrderAmount: d.MinOrderAmount,
            MaxDiscountAmount: d.MaxDiscountAmount,
            EndDateUtc: d.EndDateUtc
        )).ToList();
    }
}
