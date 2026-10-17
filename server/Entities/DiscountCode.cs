namespace VietQrKiosk.Server.Entities;

public class DiscountCode
{
    public long Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DiscountType Type { get; set; } = DiscountType.Percentage;
    
    /// <summary>
    /// Giá trị giảm: ví dụ 10 (%) đối với Percentage, hoặc 20000 (VND) đối với FixedAmount.
    /// </summary>
    public long Value { get; set; }
    
    /// <summary>
    /// Đơn hàng tối thiểu (VND) để áp dụng mã.
    /// </summary>
    public long? MinOrderAmount { get; set; }
    
    /// <summary>
    /// Giảm tối đa (VND) nếu là mã giảm theo %.
    /// </summary>
    public long? MaxDiscountAmount { get; set; }
    
    /// <summary>
    /// Giới hạn số lượt sử dụng toàn hệ thống (null = không giới hạn).
    /// </summary>
    public int? UsageLimit { get; set; }
    
    /// <summary>
    /// Số lượt đã sử dụng.
    /// </summary>
    public int UsedCount { get; set; }
    
    public DateTime? StartDateUtc { get; set; }
    public DateTime? EndDateUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public bool IsValid(long orderAmount, DateTime nowUtc, out string errorReason)
    {
        if (!IsActive)
        {
            errorReason = "Mã giảm giá hiện đang bị khóa.";
            return false;
        }

        if (StartDateUtc.HasValue && nowUtc < StartDateUtc.Value)
        {
            errorReason = "Mã giảm giá chưa đến đợt áp dụng.";
            return false;
        }

        if (EndDateUtc.HasValue && nowUtc > EndDateUtc.Value)
        {
            errorReason = "Mã giảm giá đã hết hạn sử dụng.";
            return false;
        }

        if (UsageLimit.HasValue && UsedCount >= UsageLimit.Value)
        {
            errorReason = "Mã giảm giá đã hết lượt sử dụng.";
            return false;
        }

        if (MinOrderAmount.HasValue && orderAmount < MinOrderAmount.Value)
        {
            errorReason = $"Đơn hàng tối thiểu phải từ {MinOrderAmount.Value:N0} VND để dùng mã này.";
            return false;
        }

        errorReason = string.Empty;
        return true;
    }

    public long CalculateDiscount(long orderAmount)
    {
        long discount = 0;
        if (Type == DiscountType.Percentage)
        {
            discount = (long)Math.Round((double)orderAmount * Value / 100.0);
            if (MaxDiscountAmount.HasValue && discount > MaxDiscountAmount.Value)
            {
                discount = MaxDiscountAmount.Value;
            }
        }
        else if (Type == DiscountType.FixedAmount)
        {
            discount = Value;
        }

        // Không bao giờ giảm vượt quá giá trị đơn hàng
        return Math.Clamp(discount, 0, orderAmount);
    }
}
