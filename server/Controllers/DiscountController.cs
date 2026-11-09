using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("vendor/discounts")]
[Tags("Discounts")]
[KioskApiKey]
public class DiscountController : ControllerBase
{
    private readonly IDiscountService _discountService;

    public DiscountController(IDiscountService discountService)
    {
        _discountService = discountService;
    }

    /// <remarks>
    /// Validates a promotional discount code against an order amount and calculates the deducted total.
    /// </remarks>
    /// <param name="req">Validation request payload with code string and original order amount.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Discount validation result including deducted amount and discount code metadata.</returns>
    [HttpPost("validate")]
    public async Task<IActionResult> ValidateDiscount([FromBody] ValidateDiscountRequest req, CancellationToken ct)
    {
        var result = await _discountService.ValidateAsync(req.Code, req.Amount, ct);
        return Ok(result);
    }

    /// <remarks>
    /// Retrieves all currently active and valid discount codes.
    /// </remarks>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>List of active discount configurations.</returns>
    [HttpGet("active")]
    public async Task<IActionResult> GetActiveDiscounts(CancellationToken ct)
    {
        var discounts = await _discountService.GetActiveDiscountsAsync(ct);
        return Ok(discounts);
    }

    /// <remarks>
    /// Creates a new promotional discount campaign code.
    /// </remarks>
    /// <param name="req">New discount code parameters.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Created discount details.</returns>
    [HttpPost]
    [HttpPost("create")]
    public async Task<IActionResult> CreateDiscount([FromBody] CreateDiscountRequest req, CancellationToken ct)
    {
        var (success, error, discount) = await _discountService.CreateDiscountAsync(req, ct);
        if (!success)
        {
            return BadRequest(new ErrorBody(error ?? "Unable to create discount code"));
        }
        return Ok(discount);
    }
}