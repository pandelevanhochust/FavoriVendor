using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

/// <summary>API quản lý đơn hàng từ máy Kiosk (app Android).</summary>
[ApiController]
[Route("vendor/orders")]
[KioskApiKey]
public class VendorOrdersController : ControllerBase
{
    private readonly IOrderService _orderService;

    public VendorOrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    /// <summary>
    /// Lấy danh sách đơn hàng có bộ lọc ngày (nguyên 1 ngày 'date' hoặc khoảng 'fromDate'-'toDate'),
    /// trạng thái đơn (status: PENDING, PAID, EXPIRED, CANCELLED), hình thức (type: cash, bank).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string? date,
        [FromQuery] string? fromDate,
        [FromQuery] string? toDate,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] int limit = 50,
        [FromQuery] int page = 1,
        [FromQuery] int tz = 7,
        CancellationToken ct = default)
    {
        var (fromUtc, toUtc) = Helpers.ParseDateFilter(date, fromDate, toDate, tz);

        OrderStatus? orderStatus = null;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status.Trim(), true, out var parsedStatus))
        {
            orderStatus = parsedStatus;
        }

        var (items, totalCount) = await _orderService.GetOrdersFilteredAsync(
            fromUtc, toUtc, orderStatus, type, limit, page, ct);

        Response.Headers["X-Total-Count"] = totalCount.ToString();
        Response.Headers["X-Page"] = Math.Max(1, page).ToString();
        Response.Headers["X-Limit"] = Math.Clamp(limit, 1, 200).ToString();

        return Ok(items);
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
