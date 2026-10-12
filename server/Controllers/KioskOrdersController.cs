using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Data;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;

namespace VietQrKiosk.Server.Controllers;

/// <summary>API quản lý đơn hàng từ máy Kiosk (app Android).</summary>
[ApiController]
[Route("kiosk/orders")]
[KioskApiKey]
public class KioskOrdersController(
    AppDb db,
    VietQrClient qrClient,
    OrderNotifier notifier,
    IOptions<KioskOptions> kioskOptions,
    ILogger<KioskOrdersController> log) : ControllerBase
{
    /// <summary>Tạo đơn + mã QR.</summary>
    [HttpPost]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest req, CancellationToken ct)
    {
        var k = kioskOptions.Value;
        if (req.Amount < k.MinAmount || req.Amount > k.MaxAmount)
        {
            return BadRequest(new ErrorBody($"Số tiền phải từ {k.MinAmount:N0} đến {k.MaxAmount:N0} VND"));
        }

        var orderId = Helpers.NewOrderId();
        VietQrGenerateDto qr;
        try
        {
            qr = await qrClient.GenerateQrAsync(orderId, req.Amount, orderId, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            log.LogError(ex, "Tạo QR thất bại cho đơn {OrderId}", orderId);
            return StatusCode(StatusCodes.Status502BadGateway,
                new ErrorBody("Không tạo được mã QR, vui lòng thử lại"));
        }

        var now = DateTime.UtcNow;
        var deviceId = req.DeviceId is { Length: > 64 } ? req.DeviceId[..64] : req.DeviceId;
        var order = new Order
        {
            OrderId = orderId,
            Amount = req.Amount,
            Status = OrderStatus.Pending,
            QrCode = qr.QrCode!,
            // Dùng đúng content VietQR trả về (sandbox: VQRxxxx); nếu không có thì dùng content đã gửi.
            QrContent = string.IsNullOrWhiteSpace(qr.Content) ? orderId : qr.Content!,
            DeviceId = deviceId,
            CreatedAt = now,
            ExpiresAt = now.AddSeconds(k.OrderTtlSeconds)
        };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        log.LogInformation("Tạo đơn {OrderId} {Amount} VND từ {Device}", order.OrderId, order.Amount, deviceId ?? "-");
        return Ok(Helpers.ToDto(order, now));
    }

    /// <summary>Hỏi trạng thái đơn. ?wait=20 -> giữ kết nối tối đa 20s tới khi trạng thái đổi (long-poll).</summary>
    [HttpGet("{orderId}")]
    public async Task<IActionResult> GetOrder(string orderId, [FromQuery] int? wait, CancellationToken ct)
    {
        var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
        if (order == null) return NotFound(new ErrorBody("Không tìm thấy đơn"));

        var seconds = Math.Clamp(wait ?? 0, 0, 25);
        if (seconds > 0 && order.Status == OrderStatus.Pending)
        {
            var registered = notifier.Register(orderId);
            // Đọc lại SAU khi đăng ký để không bỏ lỡ thay đổi xảy ra đúng khoảnh khắc này.
            order = await db.Orders.AsNoTracking().FirstAsync(o => o.OrderId == orderId, ct);
            if (order.Status == OrderStatus.Pending)
            {
                await notifier.WaitAsync(registered, TimeSpan.FromSeconds(seconds), ct);
                order = await db.Orders.AsNoTracking().FirstAsync(o => o.OrderId == orderId, ct);
            }
            else
            {
                notifier.Notify(orderId); // dọn đăng ký thừa
            }
        }

        return Ok(Helpers.ToDto(order, DateTime.UtcNow));
    }

    /// <summary>Huỷ đơn. Nếu đã được trả đúng lúc đó, kết quả trả về là PAID (máy phải dùng kết quả này).</summary>
    [HttpPost("{orderId}/cancel")]
    public async Task<IActionResult> CancelOrder(string orderId, CancellationToken ct)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
        if (order == null) return NotFound(new ErrorBody("Không tìm thấy đơn"));

        if (order.Status == OrderStatus.Pending)
        {
            order.Status = OrderStatus.Cancelled;
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException)
            {
                // Callback thanh toán thắng cuộc đua: đọc lại trạng thái thật.
                db.ChangeTracker.Clear();
                order = await db.Orders.AsNoTracking().FirstAsync(o => o.OrderId == orderId, ct);
            }
            notifier.Notify(orderId);
        }

        return Ok(Helpers.ToDto(order, DateTime.UtcNow));
    }
}

