using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Data;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// Chỉ môi trường Development: giả lập khách đã chuyển khoản để thử app mà không cần VietQR.
/// </summary>
[ApiController]
[Route("kiosk/dev")]
[KioskApiKey]
public class KioskDevController(
    AppDb db,
    PaymentProcessor processor,
    IOptions<VietQrOptions> vietQrOptions) : ControllerBase
{
    [HttpPost("simulate-payment/{orderId}")]
    public async Task<IActionResult> SimulatePayment(string orderId, CancellationToken ct)
    {
        var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
        if (order == null) return NotFound(new ErrorBody("Không tìm thấy đơn"));

        await processor.ProcessAsync(new TransactionCallback
        {
            TransactionId = "SIM" + Guid.NewGuid().ToString("N"),
            TransactionTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ReferenceNumber = "SIM",
            Amount = order.Amount,
            Content = order.QrContent,
            BankAccount = vietQrOptions.Value.BankAccount,
            OrderId = order.OrderId,
            TransType = "C"
        }, ct);

        return Ok(new { simulated = true });
    }
}

