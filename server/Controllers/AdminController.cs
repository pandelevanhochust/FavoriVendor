using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;

namespace VietQrKiosk.Server.Controllers;

public static class AdminController
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app, AdminOptions adminCfg)
    {
        if (adminCfg.ApiKey.Length == 0) return app;

        var admin = app.MapGroup("/admin").WithTags("Admin");

        admin.AddEndpointFilter(async (ctx, next) =>
        {
            var provided = ctx.HttpContext.Request.Headers["X-Api-Key"].ToString();
            if (!Helpers.FixedEquals(provided, adminCfg.ApiKey))
                return Results.Json(new ErrorBody("Unauthorized"), statusCode: StatusCodes.Status401Unauthorized);
            return await next(ctx);
        });

        // Đồng bộ điểm bán: trả qrCertificate để hiển thị thành mã QR cho chủ tài khoản quét bằng app VietQR.
        admin.MapPost("/mqtt/provision", async (ProvisioningService provisioning, CancellationToken ct) =>
        {
            try
            {
                var r = await provisioning.StartAsync(ct);
                return Results.Ok(new
                {
                    qrCertificate = r.QrCertificate,
                    boxId = r.BoxId,
                    next = "Tạo mã QR từ qrCertificate, quét bằng app VietQR, chọn tài khoản và xác nhận. "
                           + "Sau đó xem GET /admin/mqtt/status để thấy terminalCode."
                });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.Json(new ErrorBody("Đồng bộ thất bại: " + ex.Message), statusCode: StatusCodes.Status502BadGateway);
            }
        });

        admin.MapGet("/mqtt/status", (VietQrMqttClient mqtt, TerminalStore terminal, MqttStats stats) =>
        {
            var t = terminal.Current;
            return Results.Ok(new
            {
                connected = mqtt.IsConnected,
                configured = terminal.IsConfigured,
                terminalCode = t.TerminalCode,
                bankCode = t.BankCode,
                bankAccount = Helpers.MaskAccount(t.BankAccount),
                boxId = t.BoxId,
                counters = new
                {
                    qrRequests = stats.QrRequests,
                    qrResponses = stats.QrResponses,
                    bdsdReceived = stats.BdsdReceived,
                    lastBdsdUtc = stats.LastBdsdUtc,
                    statusRequests = stats.StatusRequests,
                    statusResponses = stats.StatusResponses
                }
            });
        });

        return app;
    }
}

