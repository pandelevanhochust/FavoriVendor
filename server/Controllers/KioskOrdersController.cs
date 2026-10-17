using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

/// <summary>API quản lý đơn hàng từ máy Kiosk (app Android).</summary>
[ApiController]
[Route("kiosk/orders")]
[KioskApiKey]
public class KioskOrdersController : ControllerBase
{
    private readonly IOrderService _orderService;

    public KioskOrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    /// <summary>Tạo đơn + mã QR (hỗ trợ mã giảm giá nếu có).</summary>
    [HttpPost]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest req, CancellationToken ct)
    {
        var result = await _orderService.CreateOrderAsync(req, ct);
        if (!result.Success)
        {
            return StatusCode(result.StatusCode, new ErrorBody(result.ErrorMessage ?? "Lỗi tạo đơn"));
        }

        return Ok(result.Order);
    }

    /// <summary>Hỏi trạng thái đơn. ?wait=20 -> giữ kết nối tối đa 20s tới khi trạng thái đổi (long-poll qua HTTP API).</summary>
    [HttpGet("{orderId}")]
    public async Task<IActionResult> GetOrder(string orderId, [FromQuery] int? wait, CancellationToken ct)
    {
        var (found, order) = await _orderService.GetOrderAsync(orderId, wait ?? 0, ct);
        if (!found || order == null)
        {
            return NotFound(new ErrorBody("Không tìm thấy đơn"));
        }

        return Ok(order);
    }

    /// <summary>Huỷ đơn. Nếu đã được trả đúng lúc đó, kết quả trả về là PAID (máy phải dùng kết quả này).</summary>
    [HttpPost("{orderId}/cancel")]
    public async Task<IActionResult> CancelOrder(string orderId, CancellationToken ct)
    {
        var (found, order) = await _orderService.CancelOrderAsync(orderId, ct);
        if (!found || order == null)
        {
            return NotFound(new ErrorBody("Không tìm thấy đơn"));
        }

        return Ok(order);
    }
}
