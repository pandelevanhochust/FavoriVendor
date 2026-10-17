using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.External;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

public class OrderService : IOrderService
{
    private readonly IOrderRepository _orderRepo;
    private readonly ITransactionRepository _txnRepo;
    private readonly IDiscountService _discountService;
    private readonly IVietQrClient _qrClient;
    private readonly IOrderNotifier _notifier;
    private readonly KioskOptions _kioskOptions;
    private readonly ILogger<OrderService> _log;

    public OrderService(
        IOrderRepository orderRepo,
        ITransactionRepository txnRepo,
        IDiscountService discountService,
        IVietQrClient qrClient,
        IOrderNotifier notifier,
        IOptions<KioskOptions> kioskOptions,
        ILogger<OrderService> log)
    {
        _orderRepo = orderRepo;
        _txnRepo = txnRepo;
        _discountService = discountService;
        _qrClient = qrClient;
        _notifier = notifier;
        _kioskOptions = kioskOptions.Value;
        _log = log;
    }

    public async Task<(bool Success, OrderDto? Order, string? ErrorMessage, int StatusCode)> CreateOrderAsync(
        CreateOrderRequest req, CancellationToken ct)
    {
        if (req.Amount < _kioskOptions.MinAmount || req.Amount > _kioskOptions.MaxAmount)
        {
            return (false, null, $"Số tiền phải từ {_kioskOptions.MinAmount:N0} đến {_kioskOptions.MaxAmount:N0} VND", 400);
        }

        // Áp dụng mã giảm giá (nếu có)
        var originalAmount = req.Amount;
        var discountAmount = 0L;
        var finalAmount = originalAmount;
        string? appliedDiscountCode = null;

        if (!string.IsNullOrWhiteSpace(req.DiscountCode))
        {
            var discountResult = await _discountService.ApplyDiscountAsync(req.DiscountCode, originalAmount, ct);
            if (!discountResult.IsValid)
            {
                return (false, null, discountResult.ErrorReason ?? "Mã giảm giá không hợp lệ", 400);
            }

            discountAmount = discountResult.DiscountAmount;
            finalAmount = discountResult.FinalAmount;
            appliedDiscountCode = discountResult.Discount?.Code;
        }

        var orderId = Helpers.NewOrderId();
        VietQrGenerateDto qr;
        try
        {
            // Sinh mã VietQR theo số tiền thực tế khách phải trả (finalAmount)
            qr = await _qrClient.GenerateQrAsync(orderId, finalAmount, orderId, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogError(ex, "Tạo QR thất bại cho đơn {OrderId}", orderId);
            return (false, null, "Không tạo được mã QR, vui lòng thử lại", 502);
        }

        var now = DateTime.UtcNow;
        var deviceId = req.DeviceId is { Length: > 64 } ? req.DeviceId[..64] : req.DeviceId;
        var order = new Order
        {
            OrderId = orderId,
            OriginalAmount = originalAmount,
            DiscountAmount = discountAmount,
            Amount = finalAmount,
            DiscountCode = appliedDiscountCode,
            Status = OrderStatus.Pending,
            QrCode = qr.QrCode!,
            QrContent = string.IsNullOrWhiteSpace(qr.Content) ? orderId : qr.Content!,
            DeviceId = deviceId,
            CreatedAt = now,
            ExpiresAt = now.AddSeconds(_kioskOptions.OrderTtlSeconds)
        };

        await _orderRepo.AddAsync(order, ct);
        await _orderRepo.SaveChangesAsync(ct);

        _log.LogInformation("Tạo đơn {OrderId}: gốc {Orig} VND, giảm {Disc} VND, cần thu {Final} VND (Mã: {Code}) từ {Device}",
            order.OrderId, originalAmount, discountAmount, finalAmount, appliedDiscountCode ?? "none", deviceId ?? "-");

        return (true, Helpers.ToDto(order, now), null, 200);
    }

    public async Task<(bool Found, OrderDto? Order)> GetOrderAsync(string orderId, int waitSeconds, CancellationToken ct)
    {
        var order = await _orderRepo.GetByIdAsync(orderId, asNoTracking: true, ct);
        if (order == null) return (false, null);

        var seconds = Math.Clamp(waitSeconds, 0, 25);
        if (seconds > 0 && order.Status == OrderStatus.Pending)
        {
            var registered = _notifier.Register(orderId);
            order = await _orderRepo.GetByIdAsync(orderId, asNoTracking: true, ct);
            if (order != null && order.Status == OrderStatus.Pending)
            {
                await _notifier.WaitAsync(registered, TimeSpan.FromSeconds(seconds), ct);
                order = await _orderRepo.GetByIdAsync(orderId, asNoTracking: true, ct);
            }
            else
            {
                _notifier.Notify(orderId);
            }
        }

        if (order == null) return (false, null);
        var txnDto = await GetTransactionDtoAsync(order, ct);
        return (true, Helpers.ToDto(order, DateTime.UtcNow, txnDto));
    }

    public async Task<(bool Found, OrderDto? Order)> CancelOrderAsync(string orderId, CancellationToken ct)
    {
        var order = await _orderRepo.GetByIdAsync(orderId, asNoTracking: false, ct);
        if (order == null) return (false, null);

        if (order.Status == OrderStatus.Pending)
        {
            order.Status = OrderStatus.Cancelled;
            await _orderRepo.SaveChangesAsync(ct);
            _notifier.Notify(orderId);
        }

        var txnDto = await GetTransactionDtoAsync(order, ct);
        return (true, Helpers.ToDto(order, DateTime.UtcNow, txnDto));
    }

    private async Task<BankTransactionDto?> GetTransactionDtoAsync(Order order, CancellationToken ct)
    {
        if (order.Status != OrderStatus.Paid) return null;

        var txn = await _txnRepo.GetByOrderIdAsync(order.OrderId, ct);
        if (txn == null && !string.IsNullOrEmpty(order.BankTransactionId))
        {
            txn = await _txnRepo.GetByTransactionIdAsync(order.BankTransactionId, ct: ct);
        }

        if (txn == null) return null;

        return new BankTransactionDto(
            Id: txn.Id,
            TransactionId: txn.TransactionId,
            RefTransactionId: txn.RefTransactionId,
            ReferenceNumber: txn.ReferenceNumber,
            Amount: txn.Amount,
            Content: txn.Content,
            BankAccount: txn.BankAccount,
            TransType: txn.TransType,
            OrderId: txn.OrderId,
            Result: txn.Result,
            TransactionTimeMs: txn.TransactionTimeMs,
            ReceivedAt: txn.ReceivedAt
        );
    }
}
