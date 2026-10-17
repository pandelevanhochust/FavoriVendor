using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;
using VietQrKiosk.Server.Infra.External;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Implementations;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Tests;

public class CleanArchitectureAndFeatureTests
{
    private AppDbContext CreateDbContext(string dbName)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public async Task DiscountService_ShouldCalculatePercentageAndFixedDiscountsCorrectly()
    {
        using var db = CreateDbContext("DiscountTest1");
        var discountRepo = new DiscountRepository(db);
        var logger = NullLogger<DiscountService>.Instance;
        var service = new DiscountService(discountRepo, logger);

        await discountRepo.AddAsync(new DiscountCode
        {
            Code = "SALE10",
            Type = DiscountType.Percentage,
            Value = 10,
            MinOrderAmount = 20000,
            MaxDiscountAmount = 15000,
            IsActive = true
        });

        await discountRepo.AddAsync(new DiscountCode
        {
            Code = "FIXED50K",
            Type = DiscountType.FixedAmount,
            Value = 50000,
            MinOrderAmount = 100000,
            IsActive = true
        });

        await discountRepo.SaveChangesAsync();

        // 1. Percentage discount: 10% của 50,000 là 5,000 -> final = 45,000
        var res1 = await service.ValidateAsync("SALE10", 50000);
        Assert.True(res1.IsValid);
        Assert.Equal(5000, res1.DiscountAmount);
        Assert.Equal(45000, res1.FinalAmount);

        // 2. Percentage discount cap: 10% của 200,000 là 20,000 nhưng capped ở 15,000 -> final = 185,000
        var res2 = await service.ValidateAsync("SALE10", 200000);
        Assert.True(res2.IsValid);
        Assert.Equal(15000, res2.DiscountAmount);
        Assert.Equal(185000, res2.FinalAmount);

        // 3. Minimum order not met: đơn 10,000 < min 20,000
        var res3 = await service.ValidateAsync("SALE10", 10000);
        Assert.False(res3.IsValid);

        // 4. Fixed discount: 50,000 off for 120,000 -> final = 70,000
        var res4 = await service.ValidateAsync("FIXED50K", 120000);
        Assert.True(res4.IsValid);
        Assert.Equal(50000, res4.DiscountAmount);
        Assert.Equal(70000, res4.FinalAmount);

        // 5. Non-existent discount
        var res5 = await service.ValidateAsync("DOESNOTEXIST", 50000);
        Assert.False(res5.IsValid);
    }

    [Fact]
    public async Task OrderService_ShouldCreateOrderWithDiscountAndDeduceAmount()
    {
        using var db = CreateDbContext("OrderTest1");
        var orderRepo = new OrderRepository(db);
        var discountRepo = new DiscountRepository(db);
        var discountService = new DiscountService(discountRepo, NullLogger<DiscountService>.Instance);
        var notifier = new OrderNotifier();

        await discountRepo.AddAsync(new DiscountCode
        {
            Code = "GIAM20K",
            Type = DiscountType.FixedAmount,
            Value = 20000,
            MinOrderAmount = 50000,
            IsActive = true
        });
        await discountRepo.SaveChangesAsync();

        var mockQrClient = new MockVietQrClient();
        var kioskOptions = Options.Create(new KioskOptions
        {
            MinAmount = 1000,
            MaxAmount = 20000000,
            OrderTtlSeconds = 300
        });

        var orderService = new OrderService(
            orderRepo,
            discountService,
            mockQrClient,
            notifier,
            kioskOptions,
            NullLogger<OrderService>.Instance
        );

        // Tạo đơn với mã giảm giá GIAM20K cho 100,000 VND
        var req = new CreateOrderRequest(100000, "DEVICE_01", "GIAM20K");
        var (success, orderDto, errorMessage, statusCode) = await orderService.CreateOrderAsync(req, CancellationToken.None);

        Assert.True(success);
        Assert.NotNull(orderDto);
        Assert.Equal(200, statusCode);
        Assert.Equal(100000, orderDto.OriginalAmount);
        Assert.Equal(20000, orderDto.DiscountAmount);
        Assert.Equal(80000, orderDto.Amount); // Số tiền cuối cùng cần thanh toán
        Assert.Equal("GIAM20K", orderDto.DiscountCode);
        Assert.Equal(80000, mockQrClient.LastRequestedAmount); // QR code được sinh theo số tiền cuối cùng 80,000!
    }

    [Fact]
    public async Task PaymentProcessor_ShouldProcessTransactionIdempotentlyAndSaveToPostgres()
    {
        using var db = CreateDbContext("PaymentTest1");
        var orderRepo = new OrderRepository(db);
        var txnRepo = new TransactionRepository(db);
        var discountRepo = new DiscountRepository(db);
        var discountService = new DiscountService(discountRepo, NullLogger<DiscountService>.Instance);
        var notifier = new OrderNotifier();

        await discountRepo.AddAsync(new DiscountCode
        {
            Code = "DISCOUNT10",
            Type = DiscountType.Percentage,
            Value = 10,
            IsActive = true,
            UsedCount = 0
        });

        var order = new Order
        {
            OrderId = "ORDER1234567",
            OriginalAmount = 50000,
            DiscountAmount = 5000,
            Amount = 45000, // Cần thanh toán 45,000
            DiscountCode = "DISCOUNT10",
            Status = OrderStatus.Pending,
            QrCode = "QR_DATA",
            QrContent = "ORDER1234567",
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddMinutes(5)
        };
        await orderRepo.AddAsync(order);
        await orderRepo.SaveChangesAsync();

        var processor = new PaymentProcessor(
            txnRepo,
            orderRepo,
            discountService,
            notifier,
            NullLogger<PaymentProcessor>.Instance
        );

        var callback = new TransactionCallback
        {
            TransactionId = "TXN_POSTGRES_001",
            Amount = 45000,
            TransType = "C",
            OrderId = "ORDER1234567",
            Content = "ORDER1234567",
            BankAccount = "42979886868",
            TransactionTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        // Lần 1: Xử lý thành công
        var ref1 = await processor.ProcessAsync(callback, CancellationToken.None);
        Assert.False(string.IsNullOrEmpty(ref1));

        // Kiểm tra Order đã sang trạng thái PAID
        var updatedOrder = await orderRepo.GetByIdAsync("ORDER1234567");
        Assert.NotNull(updatedOrder);
        Assert.Equal(OrderStatus.Paid, updatedOrder.Status);
        Assert.NotNull(updatedOrder.PaidAt);

        // Kiểm tra Lịch sử giao dịch đã được lưu vào database (PostgreSQL)
        var savedTxn = await txnRepo.GetByTransactionIdAsync("TXN_POSTGRES_001");
        Assert.NotNull(savedTxn);
        Assert.Equal("PAID", savedTxn.Result);
        Assert.Equal(45000, savedTxn.Amount);
        Assert.Equal("ORDER1234567", savedTxn.OrderId);

        // Kiểm tra lượt dùng mã giảm giá được tăng
        var updatedDiscount = await discountRepo.GetByCodeAsync("DISCOUNT10");
        Assert.NotNull(updatedDiscount);
        Assert.Equal(1, updatedDiscount.UsedCount);

        // Lần 2: Gọi lại cùng TransactionId (Idempotency) -> Phải trả về đúng refId cũ mà không tạo bản ghi mới
        var ref2 = await processor.ProcessAsync(callback, CancellationToken.None);
        Assert.Equal(ref1, ref2);
    }

    private class MockVietQrClient : IVietQrClient
    {
        public long LastRequestedAmount { get; private set; }

        public Task<VietQrGenerateDto> GenerateQrAsync(string orderId, long amount, string content, CancellationToken ct)
        {
            LastRequestedAmount = amount;
            return Task.FromResult(new VietQrGenerateDto
            {
                QrCode = "MOCK_QR_" + orderId,
                Content = content,
                Status = "SUCCESS"
            });
        }
    }
}
