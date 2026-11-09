using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Services;
using Xunit;

namespace VietQrKiosk.Tests;

public class FilterTests
{
    [Fact]
    public void ParseDateFilter_SingleDate_ConvertsCorrectlyToUtc()
    {
        // 2026-10-22 in UTC+7 should be from 2026-10-21 17:00:00 UTC to 2026-10-22 16:59:59.999 UTC
        var (fromUtc, toUtc) = Helpers.ParseDateFilter("2026-10-22", null, null, tzOffsetHours: 7);

        Assert.NotNull(fromUtc);
        Assert.NotNull(toUtc);
        Assert.Equal(new DateTime(2026, 10, 21, 17, 0, 0, DateTimeKind.Utc), fromUtc.Value);
        Assert.Equal(new DateTime(2026, 10, 22, 16, 59, 59, 999, DateTimeKind.Utc), toUtc.Value);
    }

    [Fact]
    public void ParseDateFilter_DateRange_ConvertsCorrectlyToUtc()
    {
        var (fromUtc, toUtc) = Helpers.ParseDateFilter(null, "2026-10-20", "2026-10-22", tzOffsetHours: 7);

        Assert.NotNull(fromUtc);
        Assert.NotNull(toUtc);
        Assert.Equal(new DateTime(2026, 10, 19, 17, 0, 0, DateTimeKind.Utc), fromUtc.Value);
        Assert.Equal(new DateTime(2026, 10, 22, 16, 59, 59, 999, DateTimeKind.Utc), toUtc.Value);
    }

    [Fact]
    public async Task InMemoryTransactionRepository_FilterByType_Works()
    {
        var repo = new InMemoryTransactionRepository();

        // Cash transaction
        await repo.AddAsync(new BankTransaction
        {
            TransactionId = "CASH-001",
            TransType = "CASH",
            BankAccount = "CASH_BOX",
            Amount = 10000,
            Content = "Cash payment",
            Result = "PAID",
            ReceivedAt = DateTime.UtcNow
        });

        // VietQR bank transaction
        await repo.AddAsync(new BankTransaction
        {
            TransactionId = "BANK-001",
            TransType = "C",
            BankAccount = "839656868",
            OrderId = "ORD-001",
            Amount = 20000,
            Content = "VietQR payment",
            Result = "PAID",
            ReceivedAt = DateTime.UtcNow
        });

        // Other device / no order
        await repo.AddAsync(new BankTransaction
        {
            TransactionId = "NOORD-001",
            TransType = "C",
            BankAccount = "839656868",
            Amount = 50000,
            Content = "Other device transfer",
            Result = "NO_ORDER",
            ReceivedAt = DateTime.UtcNow
        });

        var cashTxns = await repo.GetTransactionsFilteredAsync(type: "cash");
        Assert.Single(cashTxns);
        Assert.Equal("CASH-001", cashTxns[0].TransactionId);

        var bankTxns = await repo.GetTransactionsFilteredAsync(type: "bank");
        Assert.Single(bankTxns);
        Assert.Equal("BANK-001", bankTxns[0].TransactionId);

        var noOrderTxns = await repo.GetTransactionsFilteredAsync(type: "no_order");
        Assert.Single(noOrderTxns);
        Assert.Equal("NOORD-001", noOrderTxns[0].TransactionId);

        var allTxns = await repo.GetTransactionsFilteredAsync();
        Assert.Equal(3, allTxns.Count);
    }

    [Fact]
    public async Task InMemoryOrderRepository_FilterByStatusAndType_Works()
    {
        var repo = new InMemoryOrderRepository();

        await repo.AddAsync(new Order
        {
            OrderId = "ORD-PAID-CASH",
            Status = OrderStatus.Paid,
            QrContent = "CASH",
            BankTransactionId = "CASH-ORD-PAID-CASH",
            Amount = 10000,
            CreatedAt = DateTime.UtcNow
        });

        await repo.AddAsync(new Order
        {
            OrderId = "ORD-PAID-BANK",
            Status = OrderStatus.Paid,
            QrContent = "CONTENT_1",
            BankTransactionId = "VQR-001",
            Amount = 25000,
            CreatedAt = DateTime.UtcNow
        });

        await repo.AddAsync(new Order
        {
            OrderId = "ORD-PENDING",
            Status = OrderStatus.Pending,
            QrContent = "CONTENT_2",
            Amount = 30000,
            CreatedAt = DateTime.UtcNow
        });

        var cashOrders = await repo.GetOrdersFilteredAsync(paymentType: "cash");
        Assert.Single(cashOrders);
        Assert.Equal("ORD-PAID-CASH", cashOrders[0].OrderId);

        var bankOrders = await repo.GetOrdersFilteredAsync(paymentType: "bank");
        Assert.Equal(2, bankOrders.Count);

        var pendingOrders = await repo.GetOrdersFilteredAsync(status: OrderStatus.Pending);
        Assert.Single(pendingOrders);
        Assert.Equal("ORD-PENDING", pendingOrders[0].OrderId);
    }

    [Fact]
    public void ParseDateFilter_DateTimeIsoWithExplicitOffset_ParsesCorrectly()
    {
        var (fromUtc, toUtc) = Helpers.ParseDateFilter(null, "2026-10-22T08:30:00+07:00", "2026-10-22T12:00:00+07:00", tzOffsetHours: 7);

        Assert.NotNull(fromUtc);
        Assert.NotNull(toUtc);
        Assert.Equal(new DateTime(2026, 10, 22, 1, 30, 0, DateTimeKind.Utc), fromUtc.Value);
        Assert.Equal(new DateTime(2026, 10, 22, 5, 0, 0, DateTimeKind.Utc), toUtc.Value);
    }

    [Fact]
    public void ParseDateFilter_DateTimeIsoUtc_ParsesCorrectly()
    {
        var (fromUtc, toUtc) = Helpers.ParseDateFilter(null, "2026-10-22T01:30:00Z", "2026-10-22T05:00:00Z", tzOffsetHours: 7);

        Assert.NotNull(fromUtc);
        Assert.NotNull(toUtc);
        Assert.Equal(new DateTime(2026, 10, 22, 1, 30, 0, DateTimeKind.Utc), fromUtc.Value);
        Assert.Equal(new DateTime(2026, 10, 22, 5, 0, 0, DateTimeKind.Utc), toUtc.Value);
    }

    [Fact]
    public async Task InMemoryTransactionRepository_BankTransactionWithNullFields_IncludedInBankFilter()
    {
        var repo = new InMemoryTransactionRepository();

        await repo.AddAsync(new BankTransaction
        {
            TransactionId = "BANK-NULL-ACCOUNT",
            TransType = "C",
            BankAccount = null,
            Amount = 50000,
            Content = "Transfer from mobile app",
            Result = "PAID",
            ReceivedAt = DateTime.UtcNow
        });

        var bankTxns = await repo.GetTransactionsFilteredAsync(type: "bank");
        Assert.Single(bankTxns);
        Assert.Equal("BANK-NULL-ACCOUNT", bankTxns[0].TransactionId);
    }

    [Fact]
    public async Task InMemoryOrderRepository_BankOrderWithNullQrContent_IncludedInBankFilter()
    {
        var repo = new InMemoryOrderRepository();

        await repo.AddAsync(new Order
        {
            OrderId = "ORD-NULL-QR",
            Status = OrderStatus.Paid,
            QrContent = null,
            BankTransactionId = "TXN-1234",
            Amount = 70000,
            CreatedAt = DateTime.UtcNow
        });

        var bankOrders = await repo.GetOrdersFilteredAsync(paymentType: "bank");
        Assert.Single(bankOrders);
        Assert.Equal("ORD-NULL-QR", bankOrders[0].OrderId);
    }
}
