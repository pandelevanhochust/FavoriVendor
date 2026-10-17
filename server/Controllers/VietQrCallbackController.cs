using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// API để VietQR gọi vào server (Get Token + Transaction Sync).
/// URL khai báo với VietQR:
///   Get Token         : https://&lt;host&gt;/&lt;BasePath&gt;/api/token_generate
///   Transaction Sync  : https://&lt;host&gt;/&lt;BasePath&gt;/bank/api/transaction-sync
/// Lưu ý: Sử dụng HTTP API callback, KHÔNG sử dụng MQTT.
/// </summary>
[ApiController]
[Route("[callbackBasePath]")]
public class VietQrCallbackController : ControllerBase
{
    private readonly CallbackOptions _options;
    private readonly IPaymentProcessor _processor;
    private readonly ILogger<VietQrCallbackController> _log;

    public VietQrCallbackController(
        IOptions<CallbackOptions> callbackOptions,
        IPaymentProcessor processor,
        ILogger<VietQrCallbackController> log)
    {
        _options = callbackOptions.Value;
        _processor = processor;
        _log = log;
    }

    [HttpPost("api/token_generate")]
    public IActionResult GenerateToken()
    {
        if (!Helpers.TryParseBasic(Request.Headers.Authorization.ToString(), out var user, out var pass)
            || !Helpers.FixedEquals(user, _options.Username)
            || !Helpers.FixedEquals(pass, _options.Password))
        {
            return StatusCode(StatusCodes.Status401Unauthorized,
                new { status = "FAILED", message = "INVALID_CREDENTIALS" });
        }

        return Ok(new TokenResponse(Helpers.CreateJwt(_options), "Bearer", _options.TokenSeconds));
    }

    [HttpPost("bank/api/transaction-sync")]
    [Authorize(AuthenticationSchemes = "VietQrCallback")]
    public async Task<IActionResult> TransactionSync([FromBody] TransactionCallback body)
    {
        try
        {
            // Không gắn CancellationToken của request: đã nhận tiền thì phải ghi xong vào Postgres dù VietQR ngắt kết nối
            var refId = await _processor.ProcessAsync(body, CancellationToken.None);
            return Ok(new CallbackResponse(false, null, "Transaction processed successfully", new RefObject(refId)));
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "transaction-sync lỗi, order={OrderId} txn={Txn}", body.OrderId, body.TransactionId);
            return BadRequest(new CallbackResponse(true, "TRANSACTION_FAILED", "Internal error", null));
        }
    }
}
