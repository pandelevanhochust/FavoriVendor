using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// API để VietQR gọi vào server (Get Token + Transaction Sync).
/// URL khai báo với VietQR:
///   Get Token         : https://&lt;host&gt;/&lt;BasePath&gt;/api/token_generate
///   Transaction Sync  : https://&lt;host&gt;/&lt;BasePath&gt;/bank/api/transaction-sync
/// </summary>
[ApiController]
[Route("[callbackBasePath]")]
public class VietQrCallbackController(
    IOptions<CallbackOptions> callbackOptions,
    PaymentProcessor processor,
    ILogger<VietQrCallbackController> log) : ControllerBase
{
    [HttpPost("api/token_generate")]
    public IActionResult GenerateToken()
    {
        var o = callbackOptions.Value;
        if (!Helpers.TryParseBasic(Request.Headers.Authorization.ToString(), out var user, out var pass)
            || !Helpers.FixedEquals(user, o.Username)
            || !Helpers.FixedEquals(pass, o.Password))
        {
            return StatusCode(StatusCodes.Status401Unauthorized,
                new { status = "FAILED", message = "INVALID_CREDENTIALS" });
        }

        return Ok(new TokenResponse(Helpers.CreateJwt(o), "Bearer", o.TokenSeconds));
    }

    [HttpPost("bank/api/transaction-sync")]
    [Authorize(AuthenticationSchemes = "VietQrCallback")]
    public async Task<IActionResult> TransactionSync([FromBody] TransactionCallback body)
    {
        try
        {
            // Không gắn CancellationToken của request: đã nhận tiền thì phải ghi xong dù VietQR ngắt kết nối.
            var refId = await processor.ProcessAsync(body, CancellationToken.None);
            return Ok(new CallbackResponse(false, null, "Transaction processed successfully", new RefObject(refId)));
        }
        catch (Exception ex)
        {
            log.LogError(ex, "transaction-sync lỗi, order={OrderId} txn={Txn}", body.OrderId, body.TransactionId);
            return BadRequest(new CallbackResponse(true, "TRANSACTION_FAILED", "Internal error", null));
        }
    }
}

