using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext db, ILogger logger)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();

            if (!await db.DiscountCodes.AnyAsync())
            {
                logger.LogInformation("Seeding default discount codes...");
                db.DiscountCodes.AddRange(
                    new DiscountCode
                    {
                        Code = "GIAM10",
                        Description = "Giảm 10% tối đa 50,000 VND",
                        Type = DiscountType.Percentage,
                        Value = 10,
                        MaxDiscountAmount = 50000,
                        MinOrderAmount = 10000,
                        UsageLimit = 1000,
                        UsedCount = 0,
                        IsActive = true,
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new DiscountCode
                    {
                        Code = "GIAM20K",
                        Description = "Giảm trực tiếp 20,000 VND cho đơn từ 50,000 VND",
                        Type = DiscountType.FixedAmount,
                        Value = 20000,
                        MinOrderAmount = 50000,
                        UsageLimit = 500,
                        UsedCount = 0,
                        IsActive = true,
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new DiscountCode
                    {
                        Code = "VIP50",
                        Description = "Giảm 50% tối đa 100,000 VND cho thành viên VIP",
                        Type = DiscountType.Percentage,
                        Value = 50,
                        MaxDiscountAmount = 100000,
                        MinOrderAmount = 20000,
                        UsageLimit = 100,
                        UsedCount = 0,
                        IsActive = true,
                        CreatedAtUtc = DateTime.UtcNow
                    }
                );

                await db.SaveChangesAsync();
                logger.LogInformation("Default discount codes seeded successfully.");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi khởi tạo cơ sở dữ liệu");
            throw;
        }
    }
}
