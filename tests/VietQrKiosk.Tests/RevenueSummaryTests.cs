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
}
