using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("healthz")]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;

    public HealthController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var dbCanConnect = await _db.Database.CanConnectAsync(ct);
        return Ok(new
        {
            ok = true,
            database = dbCanConnect ? "Connected" : "Disconnected",
            timestamp = DateTime.UtcNow
        });
    }
}
