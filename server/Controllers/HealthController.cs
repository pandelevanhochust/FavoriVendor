using Microsoft.AspNetCore.Mvc;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("healthz")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { ok = true });
}

