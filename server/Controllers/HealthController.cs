using Microsoft.AspNetCore.Mvc;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("healthz")]
[Tags("Health")]
public class HealthController : ControllerBase
{
    /// <remarks>
    /// Performs liveness and readiness probe for the server instance.
    /// </remarks>
    /// <returns>Instance health status, operational mode, and server UTC timestamp.</returns>
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