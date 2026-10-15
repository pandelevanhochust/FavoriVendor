using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Infra;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;

namespace VietQrKiosk.Server.Controllers;

public static class KioskController
{
    public static IEndpointRouteBuilder MapKioskEndpoints(this IEndpointRouteBuilder app, bool isDevelopment)
    {
        var kioskGroup = app.MapGroup("/kiosk").WithTags("Kiosk");

        kioskGroup.AddEndpointFilter(async (ctx, next) =>
        {
            var opt = ctx.HttpContext.RequestServices.GetRequiredService<IOptions<KioskOptions>>().Value;
            var provided = ctx.HttpContext.Request.Headers["X-Api-Key"].ToString();
            if (!Helpers.FixedEquals(provided, opt.ApiKey))
                return Results.Json(new ErrorBody("Unauthorized"), statusCode: StatusCodes.Status401Unauthorized);
            return await next(ctx);
        });

        // Tạo đơn + xin VietQR tạo mã QR qua MQTT
        kioskGroup.MapPost("/orders", async (
            CreateOrderRequest req, IOrderRepository orderRepo, QrService qr,
            IOptions<KioskOptions> ko, ILogger<Program> log, CancellationToken ct) =>
        {
            var k = ko.Value;
            if (req.Amount < k.MinAmount || req.Amount > k.MaxAmount)
                return Results.Json(new ErrorBody($"Số tiền phải từ {k.MinAmount:N0} đến {k.MaxAmount:N0} VND"), statusCode: StatusCodes.Status400BadRequest);

            var now = DateTime.UtcNow;
            var deviceId = req.DeviceId is { Length: > 64 } ? req.DeviceId[..64] : req.DeviceId;
            var order = new Order
            {
                OrderId = Helpers.NewOrderId(),
                Amount = req.Amount,
                Status = OrderStatus.Pending,
                QrCode = "",
                QrContent = "",
                DeviceId = deviceId,
                CreatedAt = now,
                ExpiresAt = now.AddSeconds(k.OrderTtlSeconds)
            };

            // Lưu TRƯỚC khi gửi yêu cầu: nếu tin biến động số dư đến sớm thì vẫn khớp được đơn.
            await orderRepo.CreateAsync(order, ct);

            QrResponseMessage? response = null;
            try
            {
                response = await qr.RequestQrAsync(order, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Tạo QR qua MQTT thất bại cho đơn {OrderId}", order.OrderId);
            }

            if (response == null || string.IsNullOrWhiteSpace(response.QrCode))
            {
                await orderRepo.CancelQuietlyAsync(order.OrderId, ct);
                return Results.Json(new ErrorBody("Không tạo được mã QR, vui lòng thử lại"),
                    statusCode: StatusCodes.Status502BadGateway);
            }

            order.QrCode = response.QrCode!;
            // Dùng đúng content VietQR trả về (có tiền tố "VQRxxxxxxxxxx ") làm khoá đối soát.
            order.QrContent = string.IsNullOrWhiteSpace(response.Content) ? order.OrderId : response.Content!;
            order.QrToken = Helpers.ExtractQrToken(response.Content);
            order.TransactionRefId = response.TransactionRefId;
            // QR chỉ thật sự dùng được từ lúc VietQR trả lời, nên tính hạn từ đây.
            order.ExpiresAt = DateTime.UtcNow.AddSeconds(k.OrderTtlSeconds);

            await orderRepo.UpdateQrInfoAsync(order.OrderId, order.QrCode, order.QrContent, order.QrToken,
                order.TransactionRefId, order.ExpiresAt, ct);

            // Tải lại bản mới nhất từ database (trong trường hợp vừa có tin thanh toán về)
            var latest = await orderRepo.GetByIdAsync(order.OrderId, ct) ?? order;

            log.LogInformation("Tạo đơn {OrderId} {Amount} VND từ {Device}, token={Token}",
                latest.OrderId, latest.Amount, deviceId ?? "-", latest.QrToken ?? "-");
            return Results.Ok(Helpers.ToDto(latest, DateTime.UtcNow));
        });

        // Hỏi trạng thái đơn. ?wait=20 -> giữ kết nối tối đa 20s tới khi trạng thái đổi (long-poll).
        kioskGroup.MapGet("/orders/{orderId}", async (
            string orderId, int? wait, IOrderRepository orderRepo, OrderNotifier notifier, CancellationToken ct) =>
        {
            var order = await orderRepo.GetByIdAsync(orderId, ct);
            if (order == null) return Results.Json(new ErrorBody("Không tìm thấy đơn"), statusCode: StatusCodes.Status404NotFound);

            var seconds = Math.Clamp(wait ?? 0, 0, 25);
            if (seconds > 0 && order.Status == OrderStatus.Pending)
            {
                var registered = notifier.Register(orderId);
                // Đọc lại SAU khi đăng ký để không bỏ lỡ thay đổi xảy ra đúng khoảnh khắc này.
                order = await orderRepo.GetByIdAsync(orderId, ct);
                if (order != null && order.Status == OrderStatus.Pending)
                {
                    await notifier.WaitAsync(registered, TimeSpan.FromSeconds(seconds), ct);
                    order = await orderRepo.GetByIdAsync(orderId, ct);
                }
                else
                {
                    notifier.Notify(orderId); // dọn đăng ký thừa
                }
            }

            return Results.Ok(order != null ? Helpers.ToDto(order, DateTime.UtcNow) : null);
        });

        // Huỷ đơn. Nếu đã được trả đúng lúc đó, kết quả trả về là PAID (máy phải dùng kết quả này).
        kioskGroup.MapPost("/orders/{orderId}/cancel", async (
            string orderId, IOrderRepository orderRepo, OrderNotifier notifier, CancellationToken ct) =>
        {
            var order = await orderRepo.GetByIdAsync(orderId, ct);
            if (order == null) return Results.Json(new ErrorBody("Không tìm thấy đơn"), statusCode: StatusCodes.Status404NotFound);

            if (order.Status == OrderStatus.Pending)
            {
                order = await orderRepo.TryCancelAsync(orderId, ct);
                notifier.Notify(orderId);
            }

            return Results.Ok(order != null ? Helpers.ToDto(order, DateTime.UtcNow) : null);
        });

        // Chỉ môi trường Development: giả lập khách đã chuyển khoản để thử app mà không cần VietQR.
        if (isDevelopment)
        {
            kioskGroup.MapPost("/dev/simulate-payment/{orderId}", async (
                string orderId, IOrderRepository orderRepo, PaymentProcessor processor, TerminalStore terminal, CancellationToken ct) =>
            {
                var order = await orderRepo.GetByIdAsync(orderId, ct);
                if (order == null) return Results.Json(new ErrorBody("Không tìm thấy đơn"), statusCode: StatusCodes.Status404NotFound);

                var result = await processor.ProcessAsync(new PaymentNotification(
                    "SIM" + Guid.NewGuid().ToString("N"),
                    order.Amount,
                    order.QrContent,
                    order.OrderId,
                    "C",
                    terminal.Current.BankAccount,
                    DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    "DEV"), ct);

                return Results.Ok(new { simulated = true, result });
            });
        }

        return app;
    }
}
