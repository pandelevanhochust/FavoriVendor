using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using VietQrKiosk.Server.Entities;

using VietQrKiosk.Server.Models;

using VietQrKiosk.Server.Services;

using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]

[Route("vendor/orders")]

[Tags("Orders")]

[Authorize]

public class VendorOrdersController : ControllerBase

{

    private readonly IOrderService _orderService;

    public VendorOrdersController(IOrderService orderService)

    {

        _orderService = orderService;

    }

    /// <remarks>
    /// Retrieves a paginated list of orders filtered by status, payment method, and date window.
    /// </remarks>
    /// <param name="startDate" example="2026-11-09T00:00:00+07:00">Start datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="endDate" example="2026-11-09T23:59:59+07:00">End datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="status" example="PAID">
    /// Order status filter. Allowed Enum values:
    /// - 'PENDING': Order created, awaiting customer payment.
    /// - 'PAID': Payment confirmed via VietQR or cash collection.
    /// - 'EXPIRED': Order expired before payment completed.
    /// - 'CANCELLED': Explicitly cancelled by customer or operator.
    /// </param>
    /// <param name="type" example="bank">
    /// Payment method classification ('bank', 'cash').
    /// </param>
    /// <param name="limit" example="50">Maximum number of orders per page (range: 1 to 200, default: 50).</param>
    /// <param name="page" example="1">1-based page number (default: 1).</param>
    /// <param name="tz" example="7">Timezone offset in hours from UTC (default: 7 for Vietnam ICT).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A list of Order items and pagination response headers (X-Total-Count, X-Page, X-Limit).</returns>

    [HttpGet]

    public async Task<IActionResult> GetOrders(

        [FromQuery] string? startDate,

        [FromQuery] string? endDate,

        [FromQuery] string? status,

        [FromQuery] string? type,

        [FromQuery] int limit = 50,

        [FromQuery] int page = 1,

        [FromQuery] int tz = 7,

        CancellationToken ct = default)

    {

        var (fromUtc, toUtc) = Helpers.ParseDateRange(startDate, endDate, tz);

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

    /// <remarks>
    /// Creates a new photo booth order and generates an EMVCo-compliant dynamic VietQR payment code.
    /// </remarks>
    /// <remarks>
    /// Calculates discount deduction if a valid promo code is provided. Returns the order along with QR base64 image string and expiration countdown.
    /// </remarks>
    /// <param name="req">Order creation payload containing total amount, item unit price, quantity, and optional discount code.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Created OrderDto containing order ID, QR code payload, and expiration details.</returns>

    [HttpPost]

    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest req, CancellationToken ct)

    {

        var result = await _orderService.CreateOrderAsync(req, ct);

        if (!result.Success)

        {

            return StatusCode(result.StatusCode, new ErrorBody(result.ErrorMessage ?? "Failed to create order"));

        }

        return Ok(result.Order);

    }

    /// <remarks>
    /// Queries the current status of an order by ID with optional HTTP long-polling support.
    /// </remarks>
    /// <remarks>
    /// If 'wait' is specified (e.g. ?wait=20), the server keeps the HTTP connection open up to that many seconds until the order status changes to PAID.
    /// </remarks>
    /// <param name="orderId" example="ORD-20261109-001">The unique order ID.</param>
    /// <param name="wait" example="20">Maximum seconds to hold connection waiting for payment completion (0 to 60).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>OrderDto representing the latest state of the order.</returns>

    [HttpGet("{orderId}")]

    public async Task<IActionResult> GetOrder(string orderId, [FromQuery] int? wait, CancellationToken ct)

    {

        var (found, order) = await _orderService.GetOrderAsync(orderId, wait ?? 0, ct);

        if (!found || order == null)

        {

            return NotFound(new ErrorBody("Order not found"));

        }

        return Ok(order);

    }

    /// <remarks>
    /// Cancels a pending order.
    /// </remarks>
    /// <remarks>
    /// If the customer completed payment at the moment of cancellation, the server returns the authoritative PAID status instead of cancelling.
    /// </remarks>
    /// <param name="orderId" example="ORD-20261109-001">The order ID to cancel.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Updated OrderDto showing cancellation or confirmed payment.</returns>

    [HttpPost("{orderId}/cancel")]

    public async Task<IActionResult> CancelOrder(string orderId, CancellationToken ct)

    {

        var (found, order) = await _orderService.CancelOrderAsync(orderId, ct);

        if (!found || order == null)

        {

            return NotFound(new ErrorBody("Order not found"));

        }

        return Ok(order);

    }

    /// <remarks>
    /// Calculates revenue summary based on orders across a given date range.
    /// </remarks>
    /// <param name="startDate" example="2026-11-09T00:00:00+07:00">Start datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="endDate" example="2026-11-09T23:59:59+07:00">End datetime (ISO-8601 or YYYY-MM-DD HH:mm:ss).</param>
    /// <param name="tz" example="7">Timezone offset in hours from UTC (default: 7 for Vietnam ICT).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>RevenueSummaryDto with revenue breakdown and order counts.</returns>

    [HttpGet("revenue-summary")]

    public async Task<ActionResult<RevenueSummaryDto>> GetRevenueSummary(

        [FromQuery] string? startDate,

        [FromQuery] string? endDate,

        [FromQuery] int tz = 7,

        CancellationToken ct = default)

    {

        var (fromUtc, toUtc) = Helpers.ParseDateRange(startDate, endDate, tz);

        var summary = await _orderService.GetRevenueSummaryAsync(fromUtc, toUtc, ct);

        return Ok(summary);

    }

}