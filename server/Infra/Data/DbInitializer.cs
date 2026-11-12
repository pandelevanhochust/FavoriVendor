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

    -- 7. Bảng photo_filters
    CREATE TABLE IF NOT EXISTS public.photo_filters (
        ""Id"" SERIAL PRIMARY KEY,
        ""Code"" VARCHAR(50) NOT NULL UNIQUE,
        ""Name"" VARCHAR(100) NOT NULL,
        ""Category"" VARCHAR(50) NOT NULL DEFAULT 'General',
        ""Type"" VARCHAR(20) NOT NULL DEFAULT 'LUT',
        ""LutUrl"" VARCHAR(500),
        ""ThumbnailUrl"" VARCHAR(500),
        ""IntensityDefault"" REAL NOT NULL DEFAULT 1.0,
        ""ConfigJson"" JSONB,
        ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
        ""DisplayOrder"" INT NOT NULL DEFAULT 0,
        ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ""UpdatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_photo_filters_code ON public.photo_filters(""Code"");
    CREATE INDEX IF NOT EXISTS ix_photo_filters_category ON public.photo_filters(""Category"");
    CREATE INDEX IF NOT EXISTS ix_photo_filters_is_active ON public.photo_filters(""IsActive"");
    CREATE INDEX IF NOT EXISTS ix_photo_filters_display_order ON public.photo_filters(""DisplayOrder"");
    -- 8. Bảng users
    CREATE TABLE IF NOT EXISTS public.users (
        ""Id"" SERIAL PRIMARY KEY,
        ""Username"" VARCHAR(50) NOT NULL UNIQUE,
        ""Email"" VARCHAR(150),
        ""PasswordHash"" VARCHAR(255) NOT NULL,
        ""FullName"" VARCHAR(100) NOT NULL,
        ""Role"" VARCHAR(20) NOT NULL DEFAULT 'Admin',
        ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
        ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ""LastLoginAt"" TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS ix_users_username ON public.users(""Username"");
    CREATE INDEX IF NOT EXISTS ix_users_role ON public.users(""Role"");

    -- 9. Bảng refresh_tokens
    CREATE TABLE IF NOT EXISTS public.refresh_tokens (
        ""Id"" SERIAL PRIMARY KEY,
        ""UserId"" INT NOT NULL REFERENCES public.users(""Id"") ON DELETE CASCADE,
        ""Token"" VARCHAR(255) NOT NULL UNIQUE,
        ""ExpiresAt"" TIMESTAMPTZ NOT NULL,
        ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ""RevokedAt"" TIMESTAMPTZ,
        ""ReplacedByToken"" VARCHAR(255)
    );

    CREATE INDEX IF NOT EXISTS ix_refresh_tokens_token ON public.refresh_tokens(""Token"");
    CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON public.refresh_tokens(""UserId"");
    CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON public.refresh_tokens(""ExpiresAt"");
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

            // Seed Photo Filters
            if (!await db.PhotoFilters.AnyAsync())
            {
                logger.LogInformation("Đang khởi tạo các PhotoFilters mặc định...");
                db.PhotoFilters.AddRange(
                    new PhotoFilter
                    {
                        Code = "original",
                        Name = "Ảnh Gốc (Natural)",
                        Category = "General",
                        Type = "Preset",
                        IntensityDefault = 1.0f,
                        DisplayOrder = 1,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoFilter
                    {
                        Code = "classic_bw",
                        Name = "Đen Trắng Cổ Điển (Classic B&W)",
                        Category = "Black & White",
                        Type = "Preset",
                        IntensityDefault = 1.0f,
                        ConfigJson = "{\"grayscale\":1.0,\"contrast\":1.2}",
                        DisplayOrder = 2,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoFilter
                    {
                        Code = "korean_soft",
                        Name = "Hàn Quốc Trong Trẻo (Korean Glow)",
                        Category = "Natural",
                        Type = "Preset",
                        IntensityDefault = 0.9f,
                        ConfigJson = "{\"brightness\":0.05,\"contrast\":0.95,\"saturation\":1.1}",
                        DisplayOrder = 3,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoFilter
                    {
                        Code = "vintage_warm",
                        Name = "Màu Phim Hoài Niệm (Vintage Warm)",
                        Category = "Film",
                        Type = "Preset",
                        IntensityDefault = 0.85f,
                        ConfigJson = "{\"sepia\":0.3,\"contrast\":1.1,\"saturation\":0.9}",
                        DisplayOrder = 4,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    }
                );
                await db.SaveChangesAsync();
                logger.LogInformation("Khởi tạo PhotoFilters mặc định thành công.");
            }

            // Seed Photo Frames from D:\WORK\Frames
            if (!await db.PhotoFrames.AnyAsync())
            {
                logger.LogInformation("Đang khởi tạo các PhotoFrames mặc định...");
                db.PhotoFrames.AddRange(
                    new PhotoFrame
                    {
                        Name = "Vintage Film Strip 4 Ô (1x4)",
                        LayoutId = "1x4",
                        CategoryId = 4,
                        FrameUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145330_5f8054b7eed74fa5b0c34e6031a7bd24.png",
                        ThumbnailUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145332_8e4595916ec243a0881e70debe5d3b53.png",
                        HolesJson = "[{\"x\":545,\"y\":173,\"w\":1310,\"h\":833,\"rotation\":0},{\"x\":545,\"y\":1006,\"w\":1310,\"h\":794,\"rotation\":0},{\"x\":545,\"y\":1800,\"w\":1310,\"h\":797,\"rotation\":0},{\"x\":545,\"y\":2597,\"w\":1310,\"h\":830,\"rotation\":0}]",
                        DisplayOrder = 1,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoFrame
                    {
                        Name = "Summer Vibes Lưới 4 Ô (2x2)",
                        LayoutId = "2x2",
                        CategoryId = 1,
                        FrameUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145333_adb887c3bc79423abfe8b8fd492a778a.png",
                        ThumbnailUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145334_9e190ae62582478483c431618c56ff29.png",
                        HolesJson = "[{\"x\":97,\"y\":343,\"w\":1103,\"h\":1274,\"rotation\":0},{\"x\":1206,\"y\":343,\"w\":1101,\"h\":1274,\"rotation\":0},{\"x\":97,\"y\":1617,\"w\":1103,\"h\":1274,\"rotation\":0},{\"x\":1206,\"y\":1617,\"w\":1101,\"h\":1274,\"rotation\":0}]",
                        DisplayOrder = 2,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoFrame
                    {
                        Name = "Summer Pastel 6 Ô (2x3)",
                        LayoutId = "2x3",
                        CategoryId = 1,
                        FrameUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145335_d98a8979cee64db5aa88733b8ef4f415.png",
                        ThumbnailUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145335_1654b14c10404898893ed260471f2268.png",
                        HolesJson = "[{\"x\":106,\"y\":421,\"w\":1088,\"h\":880,\"rotation\":0},{\"x\":1204,\"y\":421,\"w\":1088,\"h\":880,\"rotation\":0},{\"x\":106,\"y\":1314,\"w\":1088,\"h\":880,\"rotation\":0},{\"x\":1204,\"y\":1314,\"w\":1088,\"h\":880,\"rotation\":0},{\"x\":106,\"y\":2208,\"w\":1088,\"h\":880,\"rotation\":0},{\"x\":1204,\"y\":2208,\"w\":1088,\"h\":880,\"rotation\":0}]",
                        DisplayOrder = 3,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoFrame
                    {
                        Name = "Classic Black 4 Ô (2x2)",
                        LayoutId = "2x2",
                        CategoryId = 1,
                        FrameUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145336_9251b0cb27054706961d16abcd8ec7a6.png",
                        ThumbnailUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145337_b9a38a74c6564b81b72b264e80695a52.png",
                        HolesJson = "[{\"x\":142,\"y\":792,\"w\":1016,\"h\":1186,\"rotation\":0},{\"x\":1242,\"y\":792,\"w\":1016,\"h\":1186,\"rotation\":0},{\"x\":142,\"y\":2057,\"w\":1016,\"h\":1186,\"rotation\":0},{\"x\":1242,\"y\":2057,\"w\":1016,\"h\":1186,\"rotation\":0}]",
                        DisplayOrder = 4,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    },
                    new PhotoFrame
                    {
                        Name = "Classic Grid 6 Ô (2x3)",
                        LayoutId = "2x3",
                        CategoryId = 1,
                        FrameUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145337_4bf1448a22e64befb10790b6f65b0d4f.png",
                        ThumbnailUrl = "https://pub-bc5a451086074267b70e4328a218b0c9.r2.dev/frames/20261110_145338_31b0f886dd204c4d81cce153676cb05d.png",
                        HolesJson = "[{\"x\":142,\"y\":272,\"w\":1021,\"h\":811,\"rotation\":0},{\"x\":1237,\"y\":272,\"w\":1021,\"h\":811,\"rotation\":0},{\"x\":142,\"y\":1167,\"w\":1021,\"h\":811,\"rotation\":0},{\"x\":1237,\"y\":1167,\"w\":1021,\"h\":811,\"rotation\":0},{\"x\":142,\"y\":2062,\"w\":1021,\"h\":811,\"rotation\":0},{\"x\":1237,\"y\":2062,\"w\":1021,\"h\":811,\"rotation\":0}]",
                        DisplayOrder = 5,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    }
                );
                await db.SaveChangesAsync();
                logger.LogInformation("Khởi tạo PhotoFrames mặc định từ kho D:\\WORK\\Frames thành công.");
            }

            // Seed Default Admin User
            var existingAdmin = await db.Users.FirstOrDefaultAsync(u => u.Username == "admin");
            var hasher = new Microsoft.AspNetCore.Identity.PasswordHasher<string>();
            if (existingAdmin == null)
            {
                logger.LogInformation("Khởi tạo tài khoản quản trị mặc định: admin / admin...");
                db.Users.Add(new User
                {
                    Username = "admin",
                    PasswordHash = hasher.HashPassword("admin", "admin"),
                    FullName = "Quản trị viên",
                    Role = "Admin",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
                logger.LogInformation("✅ Khởi tạo tài khoản admin thành công.");
            }
            else
            {
                // Ensure password is admin
                existingAdmin.PasswordHash = hasher.HashPassword("admin", "admin");
                existingAdmin.IsActive = true;
                await db.SaveChangesAsync();
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi khởi tạo cơ sở dữ liệu PostgreSQL / Supabase");
            throw;
        }
    }
}
