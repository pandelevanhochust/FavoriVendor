using VietQrKiosk.Server.Services;

namespace VietQrKiosk.Server.Controllers;

public static class HealthController
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/healthz", (VietQrMqttClient mqtt, TerminalStore terminal) =>
            Results.Ok(new { ok = true, mqttConnected = mqtt.IsConnected, terminalConfigured = terminal.IsConfigured }))
            .WithTags("Health");

        return app;
    }
}

