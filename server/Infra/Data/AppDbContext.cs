using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<BankTransaction> BankTransactions => Set<BankTransaction>();
    public DbSet<DiscountCode> DiscountCodes => Set<DiscountCode>();
    public DbSet<PhotoLayout> PhotoLayouts => Set<PhotoLayout>();
    public DbSet<PhotoCategory> PhotoCategories => Set<PhotoCategory>();
    public DbSet<PhotoFrame> PhotoFrames => Set<PhotoFrame>();
    public DbSet<PhotoFilter> PhotoFilters => Set<PhotoFilter>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Order Configuration
        modelBuilder.Entity<Order>(b =>
        {
            b.ToTable("orders");
            b.HasKey(o => o.OrderId);
            b.Property(o => o.OrderId).HasMaxLength(64);
            b.Property(o => o.DeviceId).HasMaxLength(64);
            b.Property(o => o.DiscountCode).HasMaxLength(50);
            b.Property(o => o.Status).HasConversion<string>().HasMaxLength(20);
            b.Property(o => o.QrCode).IsRequired(false);
            b.Property(o => o.QrContent).HasMaxLength(100).IsRequired(false);
            b.Property(o => o.BankTransactionId).HasMaxLength(128);

            b.HasIndex(o => o.Status);
            b.HasIndex(o => o.CreatedAt);
            b.HasIndex(o => o.QrContent);
        });

        // BankTransaction Configuration (PostgreSQL Transaction History)
        modelBuilder.Entity<BankTransaction>(b =>
        {
            b.ToTable("bank_transactions");
            b.HasKey(t => t.Id);
            b.Property(t => t.Id).ValueGeneratedOnAdd();
            b.Property(t => t.TransactionId).HasMaxLength(128).IsRequired();
            b.Property(t => t.RefTransactionId).HasMaxLength(64).IsRequired();
            b.Property(t => t.ReferenceNumber).HasMaxLength(128);
            b.Property(t => t.Content).HasMaxLength(500);
            b.Property(t => t.BankAccount).HasMaxLength(64);
            b.Property(t => t.TransType).HasMaxLength(20);
            b.Property(t => t.Result).HasMaxLength(50).IsRequired();
            b.Property(t => t.OrderId).HasMaxLength(64);

            b.HasIndex(t => t.TransactionId).IsUnique();
            b.HasIndex(t => t.RefTransactionId);
            b.HasIndex(t => t.OrderId);
            b.HasIndex(t => t.ReceivedAt);

            b.HasOne(t => t.Order)
             .WithMany(o => o.BankTransactions)
             .HasForeignKey(t => t.OrderId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        // DiscountCode Configuration
        modelBuilder.Entity<DiscountCode>(b =>
        {
            b.ToTable("discount_codes");
            b.HasKey(d => d.Id);
            b.Property(d => d.Id).ValueGeneratedOnAdd();
            b.Property(d => d.Code).HasMaxLength(50).IsRequired();
            b.Property(d => d.Description).HasMaxLength(255);
            b.Property(d => d.Type).HasConversion<string>().HasMaxLength(20);

            b.HasIndex(d => d.Code).IsUnique();
            b.HasIndex(d => d.IsActive);
        });

        // PhotoLayout Configuration
        modelBuilder.Entity<PhotoLayout>(b =>
        {
            b.ToTable("photo_layouts");
            b.HasKey(l => l.Id);
            b.Property(l => l.Id).HasMaxLength(32);
            b.Property(l => l.Name).HasMaxLength(100).IsRequired();
            b.Property(l => l.Slug).HasMaxLength(100).IsRequired();
            b.Property(l => l.Description).HasMaxLength(500);
            b.Property(l => l.PricingTiersJson).HasColumnType("jsonb");
            b.Property(l => l.PreviewUrl).HasMaxLength(500);

            b.HasIndex(l => l.Slug).IsUnique();
            b.HasIndex(l => l.IsActive);
            b.HasIndex(l => l.DisplayOrder);
        });

        // PhotoCategory Configuration
        modelBuilder.Entity<PhotoCategory>(b =>
        {
            b.ToTable("photo_categories");
            b.HasKey(c => c.Id);
            b.Property(c => c.Id).ValueGeneratedOnAdd();
            b.Property(c => c.Name).HasMaxLength(100).IsRequired();
            b.Property(c => c.Slug).HasMaxLength(100).IsRequired();
            b.Property(c => c.Icon).HasMaxLength(50);

            b.HasIndex(c => c.Slug).IsUnique();
            b.HasIndex(c => c.IsActive);
            b.HasIndex(c => c.DisplayOrder);
        });

        // PhotoFrame Configuration
        modelBuilder.Entity<PhotoFrame>(b =>
        {
            b.ToTable("photo_frames");
            b.HasKey(f => f.Id);
            b.Property(f => f.Id).ValueGeneratedOnAdd();
            b.Property(f => f.LayoutId).HasMaxLength(32).IsRequired();
            b.Property(f => f.Name).HasMaxLength(100).IsRequired();
            b.Property(f => f.FrameUrl).HasMaxLength(500).IsRequired();
            b.Property(f => f.ThumbnailUrl).HasMaxLength(500);
            b.Property(f => f.HolesJson).HasColumnType("jsonb");

            b.HasIndex(f => f.LayoutId);
            b.HasIndex(f => f.CategoryId);
            b.HasIndex(f => f.IsActive);
            b.HasIndex(f => f.DisplayOrder);

            b.HasOne(f => f.Layout)
             .WithMany(l => l.Frames)
             .HasForeignKey(f => f.LayoutId)
             .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(f => f.Category)
             .WithMany(c => c.Frames)
             .HasForeignKey(f => f.CategoryId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        // PhotoFilter Configuration
        modelBuilder.Entity<PhotoFilter>(b =>
        {
            b.ToTable("photo_filters");
            b.HasKey(f => f.Id);
            b.Property(f => f.Id).ValueGeneratedOnAdd();
            b.Property(f => f.Code).HasMaxLength(50).IsRequired();
            b.Property(f => f.Name).HasMaxLength(100).IsRequired();
            b.Property(f => f.Category).HasMaxLength(50).HasDefaultValue("General");
            b.Property(f => f.Type).HasMaxLength(20).HasDefaultValue("LUT");
            b.Property(f => f.LutUrl).HasMaxLength(500);
            b.Property(f => f.ThumbnailUrl).HasMaxLength(500);
            b.Property(f => f.ConfigJson).HasColumnType("jsonb");

            b.HasIndex(f => f.Code).IsUnique();
            b.HasIndex(f => f.Category);
            b.HasIndex(f => f.IsActive);
            b.HasIndex(f => f.DisplayOrder);
        });

        // User Configuration
        modelBuilder.Entity<User>(b =>
        {
            b.ToTable("users");
            b.HasKey(u => u.Id);
            b.Property(u => u.Id).ValueGeneratedOnAdd();
            b.Property(u => u.Username).HasMaxLength(50).IsRequired();
            b.Property(u => u.Email).HasMaxLength(150);
            b.Property(u => u.PasswordHash).HasMaxLength(255).IsRequired();
            b.Property(u => u.FullName).HasMaxLength(100).IsRequired();
            b.Property(u => u.Role).HasMaxLength(20).HasDefaultValue("Admin");

            b.HasIndex(u => u.Username).IsUnique();
            b.HasIndex(u => u.Role);
            b.HasIndex(u => u.IsActive);
        });

        // RefreshToken Configuration
        modelBuilder.Entity<RefreshToken>(b =>
        {
            b.ToTable("refresh_tokens");
            b.HasKey(r => r.Id);
            b.Property(r => r.Id).ValueGeneratedOnAdd();
            b.Property(r => r.Token).HasMaxLength(255).IsRequired();
            b.Property(r => r.ReplacedByToken).HasMaxLength(255);

            b.HasIndex(r => r.Token).IsUnique();
            b.HasIndex(r => r.UserId);
            b.HasIndex(r => r.ExpiresAt);

            b.HasOne(r => r.User)
             .WithMany()
             .HasForeignKey(r => r.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });
    }
}