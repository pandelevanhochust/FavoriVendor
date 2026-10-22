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
    }
}
