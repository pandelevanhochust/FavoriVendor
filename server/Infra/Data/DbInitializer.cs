using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext db, ILogger logger)
    {
        try
        {
            // Tự động tạo bảng trên Supabase / PostgreSQL nếu chưa tồn tại
            const string ddlSql = @"
DO $$ 
BEGIN
    -- Nếu bảng discount_codes tồn tại nhưng cột 'Code' chưa có (do tạo lowercase) -> drop để tạo lại chuẩn EF Core
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'discount_codes'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'discount_codes' AND column_name = 'Code'
    ) THEN
        DROP TABLE IF EXISTS public.bank_transactions CASCADE;
        DROP TABLE IF EXISTS public.orders CASCADE;
        DROP TABLE IF EXISTS public.discount_codes CASCADE;
    END IF;

    -- 1. Bảng orders
    CREATE TABLE IF NOT EXISTS public.orders (
        ""OrderId"" VARCHAR(64) PRIMARY KEY,
        ""OriginalAmount"" BIGINT NOT NULL,
        ""DiscountAmount"" BIGINT NOT NULL DEFAULT 0,
        ""Amount"" BIGINT NOT NULL,
        ""DiscountCode"" VARCHAR(50),
        ""Status"" VARCHAR(20) NOT NULL,
        ""QrCode"" TEXT,
        ""QrContent"" VARCHAR(100),
        ""DeviceId"" VARCHAR(64),
        ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ""ExpiresAt"" TIMESTAMPTZ NOT NULL,
        ""PaidAt"" TIMESTAMPTZ,
        ""BankTransactionId"" VARCHAR(128)
    );

    CREATE INDEX IF NOT EXISTS ix_orders_status ON public.orders(""Status"");
    CREATE INDEX IF NOT EXISTS ix_orders_created_at ON public.orders(""CreatedAt"");
    CREATE INDEX IF NOT EXISTS ix_orders_qr_content ON public.orders(""QrContent"");

    -- 2. Bảng bank_transactions
    CREATE TABLE IF NOT EXISTS public.bank_transactions (
        ""Id"" BIGSERIAL PRIMARY KEY,
        ""TransactionId"" VARCHAR(128) NOT NULL UNIQUE,
        ""RefTransactionId"" VARCHAR(64) NOT NULL,
        ""ReferenceNumber"" VARCHAR(128),
        ""Amount"" BIGINT NOT NULL,
        ""Content"" VARCHAR(500),
        ""BankAccount"" VARCHAR(64),
        ""TransType"" VARCHAR(20) NOT NULL DEFAULT 'C',
        ""OrderId"" VARCHAR(64) REFERENCES public.orders(""OrderId"") ON DELETE SET NULL,
        ""Result"" VARCHAR(50) NOT NULL,
        ""TransactionTimeMs"" BIGINT NOT NULL,
        ""ReceivedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_bank_transactions_ref_id ON public.bank_transactions(""RefTransactionId"");
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_order_id ON public.bank_transactions(""OrderId"");
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_received_at ON public.bank_transactions(""ReceivedAt"");

    -- 3. Bảng discount_codes
    CREATE TABLE IF NOT EXISTS public.discount_codes (
        ""Id"" BIGSERIAL PRIMARY KEY,
        ""Code"" VARCHAR(50) NOT NULL UNIQUE,
        ""Description"" VARCHAR(255),
        ""Type"" VARCHAR(20) NOT NULL DEFAULT 'Percentage',
        ""Value"" BIGINT NOT NULL,
        ""MinOrderAmount"" BIGINT,
        ""MaxDiscountAmount"" BIGINT,
        ""UsageLimit"" INT,
        ""UsedCount"" INT NOT NULL DEFAULT 0,
        ""StartDateUtc"" TIMESTAMPTZ,
        ""EndDateUtc"" TIMESTAMPTZ,
        ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
        ""CreatedAtUtc"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_discount_codes_is_active ON public.discount_codes(""IsActive"");
END $$;
";
            await db.Database.ExecuteSqlRawAsync(ddlSql);

            if (!await db.DiscountCodes.AnyAsync())
            {
                logger.LogInformation("Đang khởi tạo các mã giảm giá mặc định trong PostgreSQL...");
                db.DiscountCodes.AddRange(
                    new DiscountCode
                    {
                        Code = "GIAM10",
                        Description = "Giảm 10% tổng đơn hàng",
                        Type = DiscountType.Percentage,
                        Value = 10,
                        MinOrderAmount = null,
                        MaxDiscountAmount = null,
                        UsageLimit = null,
                        UsedCount = 0,
                        IsActive = true,
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new DiscountCode
                    {
                        Code = "GIAM20K",
                        Description = "Giảm 20.000đ cho đơn từ 50.000đ",
                        Type = DiscountType.FixedAmount,
                        Value = 20000,
                        MinOrderAmount = 50000,
                        MaxDiscountAmount = null,
                        UsageLimit = 100,
                        UsedCount = 0,
                        IsActive = true,
                        CreatedAtUtc = DateTime.UtcNow
                    },
                    new DiscountCode
                    {
                        Code = "VIP50",
                        Description = "Giảm 50% tối đa 50.000đ",
                        Type = DiscountType.Percentage,
                        Value = 50,
                        MinOrderAmount = null,
                        MaxDiscountAmount = 50000,
                        UsageLimit = 50,
                        UsedCount = 0,
                        IsActive = true,
                        CreatedAtUtc = DateTime.UtcNow
                    }
                );

                await db.SaveChangesAsync();
                logger.LogInformation("Khởi tạo mã giảm giá mặc định thành công.");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi khởi tạo cơ sở dữ liệu PostgreSQL / Supabase");
            throw;
        }
    }
}
