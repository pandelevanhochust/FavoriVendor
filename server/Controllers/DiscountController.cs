using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// API mã giảm giá dành cho Kiosk.
/// </summary>
[ApiController]
[Route("kiosk/discounts")]
[KioskApiKey]
public class DiscountController : ControllerBase
{
    private readonly IDiscountService _discountService;

    public DiscountController(IDiscountService discountService)
    {
        _discountService = discountService;
    }

    /// <summary>Kiểm tra tính hợp lệ của mã giảm giá và tính số tiền giảm trước khi tạo đơn.</summary>
    [HttpPost("validate")]
    public async Task<IActionResult> ValidateDiscount([FromBody] ValidateDiscountRequest req, CancellationToken ct)
    {
        var result = await _discountService.ValidateAsync(req.Code, req.Amount, ct);
        return Ok(result);
    }

    /// <summary>Lấy danh sách mã giảm giá đang hoạt động.</summary>
    [HttpGet("active")]
    public async Task<IActionResult> GetActiveDiscounts(CancellationToken ct)
    {
        var discounts = await _discountService.GetActiveDiscountsAsync(ct);
        return Ok(discounts);
    }
}
