using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using Xunit;

namespace VietQrKiosk.Tests;

public class RevenueSummaryTests
{
    [Fact]
    public async Task GetRevenueSummary_CalculatesCorrectly()
    {
        var repo = new InMemoryOrderRepository();
        var now = DateTime.UtcNow;

        // 1. Paid VietQR order
        await repo.AddAsync(new Order
        {
            OrderId = "ORD-001",
            Amount = 100_000,
            Status = OrderStatus.Paid,
            QrContent = "VIETQR_PAY",
            BankTransactionId = "TXN-001",
            CreatedAt = now.AddHours(-2),
            PaidAt = now.AddHours(-2)
        });

        // 2. Paid Cash order
        await repo.AddAsync(new Order
        {
            OrderId = "ORD-002",
            Amount = 50_000,
            Status = OrderStatus.Paid,
            QrContent = "CASH",
            BankTransactionId = "CASH-ORD-002",
            CreatedAt = now.AddHours(-1),
            PaidAt = now.AddHours(-1)
        });

        // 3. Pending order (should NOT be added to revenue)
        await repo.AddAsync(new Order
        {
            OrderId = "ORD-003",
            Amount = 70_000,
            Status = OrderStatus.Pending,
            QrContent = "VIETQR_PAY",
            CreatedAt = now.AddMinutes(-30)
        });

        // 4. Cancelled/Expired order
        await repo.AddAsync(new Order
        {
            OrderId = "ORD-004",
            Amount = 60_000,
            Status = OrderStatus.Expired,
            QrContent = "VIETQR_PAY",
            CreatedAt = now.AddDays(-2)
        });

        var summary = await repo.GetRevenueSummaryAsync(fromUtc: now.AddDays(-1), toUtc: now.AddHours(1));

        Assert.Equal(100_000, summary.TransferRevenue);
        Assert.Equal(50_000, summary.CashRevenue);
        Assert.Equal(150_000, summary.TotalRevenue);
        Assert.Equal(1, summary.TransferCount);
        Assert.Equal(1, summary.CashCount);
        Assert.Equal(2, summary.TotalCount);
        Assert.Equal(3, summary.TotalOrders); // ORD-001, ORD-002, ORD-003
        Assert.Equal(1, summary.PendingOrders); // ORD-003
    }

    [Fact]
    public async Task GetRevenueSummary_WithNullQrContent_CountsAsTransfer()
    {
        var repo = new InMemoryOrderRepository();
        var now = DateTime.UtcNow;

        // Paid VietQR order with null QrContent
        await repo.AddAsync(new Order
        {
            OrderId = "ORD-NULL-QR",
            Amount = 120_000,
            Status = OrderStatus.Paid,
            QrContent = null,
            BankTransactionId = "TXN-999",
            CreatedAt = now.AddMinutes(-10),
            PaidAt = now.AddMinutes(-10)
        });

        // Paid Cash order with lowercase 'cash'
        await repo.AddAsync(new Order
        {
            OrderId = "ORD-LOWER-CASH",
            Amount = 40_000,
            Status = OrderStatus.Paid,
            QrContent = "cash",
            BankTransactionId = "CASH-ORD-999",
            CreatedAt = now.AddMinutes(-5),
            PaidAt = now.AddMinutes(-5)
        });

        var summary = await repo.GetRevenueSummaryAsync(fromUtc: now.AddHours(-1), toUtc: now.AddHours(1));

        Assert.Equal(120_000, summary.TransferRevenue);
        Assert.Equal(40_000, summary.CashRevenue);
        Assert.Equal(160_000, summary.TotalRevenue);
        Assert.Equal(1, summary.TransferCount);
        Assert.Equal(1, summary.CashCount);
        Assert.Equal(2, summary.TotalCount);
    }
[Fact]
    public async Task GetRevenueSummary_FromBankTransactions_CalculatesCorrectly()
    {
        var repo = new InMemoryTransactionRepository();
        var now = DateTime.UtcNow;

        // 1. Bank VietQR transaction
        await repo.AddAsync(new BankTransaction
        {
            TransactionId = "TXN-VQR-01",
            Amount = 150_000,
            TransType = "C",
            BankAccount = "839656868",
            Result = "PAID",
            OrderId = "ORD-01",
            ReceivedAt = now.AddMinutes(-20)
        });

        // 2. Cash transaction
        await repo.AddAsync(new BankTransaction
        {
            TransactionId = "CASH-ORD-02",
            Amount = 70_000,
            TransType = "CASH",
            BankAccount = "CASH_BOX",
            Result = "PAID",
            OrderId = "ORD-02",
            ReceivedAt = now.AddMinutes(-10)
        });

        // 3. Other device transfer (NO_ORDER) - should NOT count as booth revenue
        await repo.AddAsync(new BankTransaction
        {
            TransactionId = "TXN-OTHER-01",
            Amount = 200_000,
            TransType = "C",
            BankAccount = "839656868",
            Result = "NO_ORDER",
            ReceivedAt = now.AddMinutes(-5)
        });

        var summary = await repo.GetRevenueSummaryAsync(fromUtc: now.AddHours(-1), toUtc: now.AddHours(1));

        // TransType=C (150_000 + 200_000 = 350_000)
        Assert.Equal(350_000, summary.TransferRevenue);
        // TransType=CASH (70_000)
        Assert.Equal(70_000, summary.CashRevenue);
        Assert.Equal(420_000, summary.TotalRevenue);
        Assert.Equal(2, summary.TransferCount);
        Assert.Equal(1, summary.CashCount);
        Assert.Equal(3, summary.TotalCount);
    }
}
