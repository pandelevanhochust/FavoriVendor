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

    public async Task<(bool Success, string? ErrorMessage, DiscountSummaryDto? Discount)> CreateDiscountAsync(
        CreateDiscountRequest request, CancellationToken ct = default)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Code))
        {
            return (false, "Mã giảm giá không được để trống.", null);
        }

        var normalizedCode = request.Code.Trim().ToUpperInvariant();
        var existing = await _discountRepo.GetByCodeAsync(normalizedCode, asNoTracking: true, ct);
        if (existing != null)
        {
            return (false, $"Mã giảm giá '{normalizedCode}' đã tồn tại trên hệ thống.", null);
        }

        DiscountType discountType;
        var typeStr = request.Type?.Trim().ToUpperInvariant() ?? "";
        if (typeStr == "PERCENT" || typeStr == "PERCENTAGE")
        {
            discountType = DiscountType.Percentage;
            if (request.Value <= 0 || request.Value > 100)
            {
                return (false, "Tỷ lệ giảm giá (%) phải nằm trong khoảng từ 1% đến 100%.", null);
            }
        }
        else if (typeStr == "FIXED" || typeStr == "FIXED_AMOUNT" || typeStr == "FIXEDAMOUNT")
        {
            discountType = DiscountType.FixedAmount;
            if (request.Value <= 0)
            {
                return (false, "Số tiền giảm giá cố định phải lớn hơn 0 VND.", null);
            }
        }
        else
        {
            return (false, "Loại giảm giá không hợp lệ (hỗ trợ 'PERCENT' hoặc 'FIXED_AMOUNT').", null);
        }

        DateTime? endDate = null;
        if (request.ExpiresAtMs.HasValue && request.ExpiresAtMs.Value > 0)
        {
            endDate = DateTimeOffset.FromUnixTimeMilliseconds(request.ExpiresAtMs.Value).UtcDateTime;
        }
        else if (request.EndDateUtc.HasValue)
        {
            endDate = request.EndDateUtc.Value;
        }

        if (endDate.HasValue && endDate.Value <= DateTime.UtcNow)
        {
            return (false, "Thời gian hết hạn phải ở tương lai.", null);
        }

        var discount = new DiscountCode
        {
            Code = normalizedCode,
            Description = request.Description?.Trim() ?? string.Empty,
            Type = discountType,
            Value = request.Value,
            MinOrderAmount = request.MinOrderAmount > 0 ? request.MinOrderAmount : null,
            MaxDiscountAmount = request.MaxDiscountAmount > 0 ? request.MaxDiscountAmount : null,
            UsageLimit = request.UsageLimit > 0 ? request.UsageLimit : null,
            UsedCount = 0,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
            EndDateUtc = endDate
        };

        await _discountRepo.AddAsync(discount, ct);
        await _discountRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Đã tạo mã giảm giá mới: {Code} ({Type}, {Value})", discount.Code, discount.Type, discount.Value);

        var dto = new DiscountSummaryDto(
            Code: discount.Code,
            Description: discount.Description,
            Type: discount.Type.ToString(),
            Value: discount.Value,
            MinOrderAmount: discount.MinOrderAmount,
            MaxDiscountAmount: discount.MaxDiscountAmount,
            EndDateUtc: discount.EndDateUtc
        );

        return (true, null, dto);
    }
}
