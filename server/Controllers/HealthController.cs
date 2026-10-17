using Microsoft.AspNetCore.Mvc;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("healthz")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            ok = true,
            status = "Healthy",
            mode = "InMemory-Stateless",
            timestamp = DateTime.UtcNow
        });
    }
}
