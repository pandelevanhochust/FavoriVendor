using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// Chỉ môi trường Development: giả lập khách đã chuyển khoản để thử app mà không cần VietQR.
/// </summary>
[ApiController]
[Route("vendor/dev")]
[KioskApiKey]
public class KioskDevController : ControllerBase
{
    private readonly IOrderRepository _orderRepo;
    private readonly IPaymentProcessor _processor;
    private readonly VietQrOptions _vietQrOptions;

    public KioskDevController(
        IOrderRepository orderRepo,
        IPaymentProcessor processor,
        IOptions<VietQrOptions> vietQrOptions)
    {
        _orderRepo = orderRepo;
        _processor = processor;
        _vietQrOptions = vietQrOptions.Value;
    }

    [HttpPost("simulate-payment/{orderId}")]
    public async Task<IActionResult> SimulatePayment(string orderId, CancellationToken ct)
    {
        var order = await _orderRepo.GetByIdAsync(orderId, asNoTracking: true, ct);
        if (order == null) return NotFound(new ErrorBody("Không tìm thấy đơn"));

        await _processor.ProcessAsync(new TransactionCallback
        {
            TransactionId = "SIM" + Guid.NewGuid().ToString("N"),
            TransactionTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ReferenceNumber = "SIM",
            Amount = order.Amount, // số tiền thực tế cần thanh toán
            Content = order.QrContent,
            BankAccount = _vietQrOptions.BankAccount,
            OrderId = order.OrderId,
            TransType = "C"
        }, ct);

        return Ok(new { simulated = true, orderId = order.OrderId, amount = order.Amount });
    }
}
