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

    -- 4. Bảng photo_layouts
    CREATE TABLE IF NOT EXISTS public.photo_layouts (
        ""Id"" VARCHAR(32) PRIMARY KEY,
        ""Name"" VARCHAR(100) NOT NULL,
        ""Slug"" VARCHAR(100) NOT NULL UNIQUE,
        ""WidthPx"" INT NOT NULL DEFAULT 1200,
        ""HeightPx"" INT NOT NULL DEFAULT 1800,
        ""HoleCount"" INT NOT NULL DEFAULT 4,
        ""Description"" VARCHAR(500),
        ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
        ""DisplayOrder"" INT NOT NULL DEFAULT 0,
        ""PricingTiersJson"" JSONB,
        ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ""UpdatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_photo_layouts_is_active ON public.photo_layouts(""IsActive"");
    CREATE INDEX IF NOT EXISTS ix_photo_layouts_display_order ON public.photo_layouts(""DisplayOrder"");

    -- 5. Bảng photo_categories
    CREATE TABLE IF NOT EXISTS public.photo_categories (
        ""Id"" SERIAL PRIMARY KEY,
        ""Name"" VARCHAR(100) NOT NULL,
        ""Slug"" VARCHAR(100) NOT NULL UNIQUE,
        ""Icon"" VARCHAR(50),
        ""DisplayOrder"" INT NOT NULL DEFAULT 0,
        ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
        ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_photo_categories_is_active ON public.photo_categories(""IsActive"");
    CREATE INDEX IF NOT EXISTS ix_photo_categories_display_order ON public.photo_categories(""DisplayOrder"");

    -- 6. Bảng photo_frames
    CREATE TABLE IF NOT EXISTS public.photo_frames (
        ""Id"" SERIAL PRIMARY KEY,
        ""LayoutId"" VARCHAR(32) NOT NULL REFERENCES public.photo_layouts(""Id"") ON DELETE CASCADE,
        ""CategoryId"" INT REFERENCES public.photo_categories(""Id"") ON DELETE SET NULL,
        ""Name"" VARCHAR(100) NOT NULL,
        ""FrameUrl"" VARCHAR(500) NOT NULL,
        ""ThumbnailUrl"" VARCHAR(500),
        ""HolesJson"" JSONB NOT NULL DEFAULT '[]'::jsonb,
        ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
        ""DisplayOrder"" INT NOT NULL DEFAULT 0,
        ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ""UpdatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_photo_frames_layout_id ON public.photo_frames(""LayoutId"");
    CREATE INDEX IF NOT EXISTS ix_photo_frames_category_id ON public.photo_frames(""CategoryId"");
    CREATE INDEX IF NOT EXISTS ix_photo_frames_is_active ON public.photo_frames(""IsActive"");
    CREATE INDEX IF NOT EXISTS ix_photo_frames_display_order ON public.photo_frames(""DisplayOrder"");
END $$;
";
            await db.Database.ExecuteSqlRawAsync(ddlSql);

            // Seed Discount Codes
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

            // Seed Photo Layouts
            if (!await db.PhotoLayouts.AnyAsync())
            {
                logger.LogInformation("Đang khởi tạo các PhotoLayouts mặc định...");
                db.PhotoLayouts.AddRange(
                    new PhotoLayout
                    {
                        Id = "1x4",
                        Name = "Dải 4 ảnh (1x4 Strips)",
                        Slug = "strip-4-cuts",
                        WidthPx = 1200,
                        HeightPx = 1800,
                        HoleCount = 4,
                        Description = "Khổ dải film dọc 4 ảnh cổ điển",
                        DisplayOrder = 1,
                        IsActive = true,
                        PricingTiersJson = "[{\"quantity\":2,\"price\":70000},{\"quantity\":4,\"price\":100000},{\"quantity\":6,\"price\":130000}]",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoLayout
                    {
                        Id = "2x2",
                        Name = "Lưới 4 ảnh vuông (2x2 Grid)",
                        Slug = "grid-4-cuts",
                        WidthPx = 1200,
                        HeightPx = 1800,
                        HoleCount = 4,
                        Description = "Khổ 4 ảnh bố cục lưới 2x2 hiện đại",
                        DisplayOrder = 2,
                        IsActive = true,
                        PricingTiersJson = "[{\"quantity\":2,\"price\":70000},{\"quantity\":4,\"price\":100000}]",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoLayout
                    {
                        Id = "2x3",
                        Name = "Lưới 6 ảnh (2x3 Postcard)",
                        Slug = "postcard-6-cuts",
                        WidthPx = 1200,
                        HeightPx = 1800,
                        HoleCount = 6,
                        Description = "Khổ bưu thiếp 6 ảnh chi tiết",
                        DisplayOrder = 3,
                        IsActive = true,
                        PricingTiersJson = "[{\"quantity\":2,\"price\":80000},{\"quantity\":4,\"price\":120000}]",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    }
                );
                await db.SaveChangesAsync();
                logger.LogInformation("Khởi tạo PhotoLayouts mặc định thành công.");
            }

            // Seed Categories
            if (!await db.PhotoCategories.AnyAsync())
            {
                logger.LogInformation("Đang khởi tạo danh mục Frame mặc định...");
                db.PhotoCategories.AddRange(
                    new PhotoCategory { Name = "Hot Trend", Slug = "hot-trend", Icon = "FireOutlined", DisplayOrder = 1, IsActive = true },
                    new PhotoCategory { Name = "Sinh nhật", Slug = "birthday", Icon = "GiftOutlined", DisplayOrder = 2, IsActive = true },
                    new PhotoCategory { Name = "Tình yêu", Slug = "love", Icon = "HeartOutlined", DisplayOrder = 3, IsActive = true },
                    new PhotoCategory { Name = "Vintage", Slug = "vintage", Icon = "CameraOutlined", DisplayOrder = 4, IsActive = true }
                );
                await db.SaveChangesAsync();
                logger.LogInformation("Khởi tạo danh mục Frame thành công.");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi khởi tạo cơ sở dữ liệu PostgreSQL / Supabase");
            throw;
        }
    }
}
