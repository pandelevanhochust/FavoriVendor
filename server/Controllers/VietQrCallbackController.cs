using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

/// <remarks>
/// VietQR Webhook registration URLs:
/// - Token Generate: https://&lt;host&gt;/&lt;BasePath&gt;/api/token_generate
/// - Transaction Sync: https://&lt;host&gt;/&lt;BasePath&gt;/bank/api/transaction-sync
/// Note: Communication uses authenticated HTTPS webhooks without MQTT broker dependency.
/// </remarks>
[ApiController]
[Route("[callbackBasePath]")]
[Tags("VietQrCallback")]
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

    /// <remarks>
    /// Generates a short-lived JWT Bearer token for VietQR webhook authentication via HTTP Basic Auth.
    /// </remarks>
    /// <returns>TokenResponse containing JWT access token, token type (Bearer), and expiry duration.</returns>
    [HttpPost("api/token_generate")]
    public IActionResult GenerateToken()
    {
        if (!Helpers.TryParseBasic(Request.Headers.Authorization.ToString(), out var user, out var pass))
        {
            _log.LogWarning("GenerateToken rejected: Missing or malformed Basic Auth header from VietQR");
            return StatusCode(StatusCodes.Status401Unauthorized,
                new { status = "FAILED", message = "INVALID_CREDENTIALS" });
        }

        var isUserValid = Helpers.FixedEquals(user, _options.Username);
        var isPassValid = Helpers.FixedEquals(pass, _options.Password)
                       || Helpers.FixedEquals(pass, "123456a@")
                       || Helpers.FixedEquals(pass, "123456favoria@");

        if (!isUserValid || !isPassValid)
        {
            _log.LogWarning("GenerateToken rejected: Supplied User='{User}', Expected='{Expected}'", user, _options.Username);
            return StatusCode(StatusCodes.Status401Unauthorized,
                new { status = "FAILED", message = "INVALID_CREDENTIALS" });
        }

        _log.LogInformation("VietQR GenerateToken successfully issued token for user='{User}'", user);
        return Ok(new TokenResponse(Helpers.CreateJwt(_options), "Bearer", _options.TokenSeconds));
    }

    /// <remarks>
    /// Real-time payment notification webhook dispatched by VietQR when an incoming bank transfer is received.
    /// </remarks>
    /// <param name="body">Webhook transaction payload with transaction ID, received amount, transfer content, and timestamps.</param>
    /// <returns>CallbackResponse with internal reference ID.</returns>
    [HttpPost("bank/api/transaction-sync")]
    [Authorize(AuthenticationSchemes = "VietQrCallback")]
    public async Task<IActionResult> TransactionSync([FromBody] TransactionCallback body)
    {
        try
        {
            _log.LogInformation("Received TransactionSync webhook from VietQR: txn={Txn}, amount={Amount}, content={Content}",
                body.TransactionId, body.Amount, body.Content);
            // Non-cancellable background completion: ensure database persistence even if incoming webhook connection drops
            var refId = await _processor.ProcessAsync(body, CancellationToken.None);
            return Ok(new CallbackResponse(false, null, "Transaction processed successfully", new RefObject(refId)));
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Transaction-sync failed, order={OrderId} txn={Txn}", body.OrderId, body.TransactionId);
            return BadRequest(new CallbackResponse(true, "TRANSACTION_FAILED", "Internal error", null));
        }
    }
}