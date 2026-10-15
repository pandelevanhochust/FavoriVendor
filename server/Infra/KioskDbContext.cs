using Microsoft.EntityFrameworkCore;

namespace VietQrKiosk.Server.Infra;

public class KioskDbContext : DbContext
{
    public KioskDbContext(DbContextOptions<KioskDbContext> options) : base(options) { }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<BankTransaction> BankTransactions => Set<BankTransaction>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Order>(e =>
        {
            e.ToTable("orders");
            e.HasKey(x => x.OrderId);
            e.Property(x => x.OrderId).HasMaxLength(32);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Status).IsConcurrencyToken();
            e.Property(x => x.Version).IsRowVersion(); // Npgsql xmin system column
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.QrContent);
            e.HasIndex(x => x.QrToken);
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => x.ExpiresAt);
        });

        b.Entity<BankTransaction>(e =>
        {
            e.ToTable("bank_transactions");
            e.HasKey(x => x.Id);
            e.Property(x => x.TransactionId).HasMaxLength(64);
            e.HasIndex(x => x.TransactionId).IsUnique();
            e.HasIndex(x => x.OrderId);
        });
    }
}

