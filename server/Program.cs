using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Data;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// ------------------------------------------------------------------ cấu hình
builder.Services.Configure<VietQrOptions>(builder.Configuration.GetSection("VietQr"));
builder.Services.Configure<CallbackOptions>(builder.Configuration.GetSection("Callback"));
builder.Services.Configure<KioskOptions>(builder.Configuration.GetSection("Kiosk"));

var vietQrCfg = builder.Configuration.GetSection("VietQr").Get<VietQrOptions>() ?? new VietQrOptions();
var callbackCfg = builder.Configuration.GetSection("Callback").Get<CallbackOptions>() ?? new CallbackOptions();
var kioskCfg = builder.Configuration.GetSection("Kiosk").Get<KioskOptions>() ?? new KioskOptions();

// Dừng ngay khi thiếu cấu hình bí mật thay vì chạy với giá trị rỗng (không an toàn).
Helpers.Require(!string.IsNullOrWhiteSpace(vietQrCfg.Username) && !string.IsNullOrWhiteSpace(vietQrCfg.Password),
    "VietQr:Username / VietQr:Password (tài khoản VietQR cấp)");
Helpers.Require(!string.IsNullOrWhiteSpace(vietQrCfg.BankAccount) && !string.IsNullOrWhiteSpace(vietQrCfg.AccountName),
    "VietQr:BankAccount / VietQr:AccountName");
Helpers.Require(!string.IsNullOrWhiteSpace(callbackCfg.Username) && !string.IsNullOrWhiteSpace(callbackCfg.Password),
    "Callback:Username / Callback:Password (do bạn đặt, gửi cho VietQR)");
Helpers.Require(callbackCfg.JwtSecret.Length >= 32, "Callback:JwtSecret (tối thiểu 32 ký tự)");
Helpers.Require(!string.IsNullOrWhiteSpace(callbackCfg.BasePath), "Callback:BasePath");
Helpers.Require(kioskCfg.ApiKey.Length >= 16, "Kiosk:ApiKey (tối thiểu 16 ký tự)");
Helpers.Require(kioskCfg.OrderTtlSeconds is >= 60 and <= 900, "Kiosk:OrderTtlSeconds (60..900)");

// ------------------------------------------------------------------ dịch vụ
Directory.CreateDirectory("data");
builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=data/kiosk.db"));

builder.Services.ConfigureHttpJsonOptions(o =>
{
    // VietQR có thể gửi số dưới dạng chuỗi ("amount":"10000")
    o.SerializerOptions.NumberHandling = JsonNumberHandling.AllowReadingFromString;
});

builder.Services.AddHttpClient("vietqr", c =>
{
    c.BaseAddress = new Uri(vietQrCfg.BaseUrl.TrimEnd('/') + "/");
    c.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddSingleton<VietQrClient>();
builder.Services.AddSingleton<OrderNotifier>();
builder.Services.AddScoped<PaymentProcessor>();
builder.Services.AddHostedService<OrderExpiryService>();

// JWT chỉ dùng cho chiều VietQR -> server (Transaction Sync).
builder.Services
    .AddAuthentication()
    .AddJwtBearer("VietQrCallback", o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(callbackCfg.JwtSecret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
        o.Events = new JwtBearerEvents
        {
            OnChallenge = async ctx =>
            {
                ctx.HandleResponse();
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await ctx.Response.WriteAsJsonAsync(
                    new CallbackResponse(true, "INVALID_TOKEN", "Invalid or expired token", null));
            }
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    // Demo dùng EnsureCreated. Khi cần đổi schema ở production hãy chuyển sang EF Migrations.
    scope.ServiceProvider.GetRequiredService<AppDb>().Database.EnsureCreated();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/healthz", () => Results.Ok(new { ok = true }));

// ================================================================== VietQR -> server
// URL khai báo với VietQR:
//   Get Token         : https://<host>/<BasePath>/api/token_generate
//   Transaction Sync  : https://<host>/<BasePath>/bank/api/transaction-sync
var callbackGroup = app.MapGroup("/" + callbackCfg.BasePath.Trim('/'));

callbackGroup.MapPost("/api/token_generate", (HttpRequest request, IOptions<CallbackOptions> co) =>
{
    var o = co.Value;
    if (!Helpers.TryParseBasic(request.Headers.Authorization.ToString(), out var user, out var pass)
        || !Helpers.FixedEquals(user, o.Username)
        || !Helpers.FixedEquals(pass, o.Password))
    {
        return Results.Json(new { status = "FAILED", message = "INVALID_CREDENTIALS" }, statusCode: 401);
    }

    return Results.Json(new TokenResponse(Helpers.CreateJwt(o), "Bearer", o.TokenSeconds));
});

callbackGroup.MapPost("/bank/api/transaction-sync",
    async (TransactionCallback body, PaymentProcessor processor, ILogger<Program> log) =>
    {
        try
        {
            // Không gắn CancellationToken của request: đã nhận tiền thì phải ghi xong dù VietQR ngắt kết nối.
            var refId = await processor.ProcessAsync(body, CancellationToken.None);
            return Results.Json(new CallbackResponse(false, null, "Transaction processed successfully", new RefObject(refId)));
        }
        catch (Exception ex)
        {
            log.LogError(ex, "transaction-sync lỗi, order={OrderId} txn={Txn}", body.OrderId, body.TransactionId);
            return Results.Json(new CallbackResponse(true, "TRANSACTION_FAILED", "Internal error", null), statusCode: 400);
        }
    })
    .RequireAuthorization(p => p.AddAuthenticationSchemes("VietQrCallback").RequireAuthenticatedUser());

// ================================================================== máy (app Android) -> server
var kioskGroup = app.MapGroup("/kiosk");

kioskGroup.AddEndpointFilter(async (ctx, next) =>
{
    var opt = ctx.HttpContext.RequestServices.GetRequiredService<IOptions<KioskOptions>>().Value;
    var provided = ctx.HttpContext.Request.Headers["X-Api-Key"].ToString();
    if (!Helpers.FixedEquals(provided, opt.ApiKey))
        return Results.Json(new ErrorBody("Unauthorized"), statusCode: 401);
    return await next(ctx);
});

// Tạo đơn + mã QR
kioskGroup.MapPost("/orders", async (
    CreateOrderRequest req, AppDb db, VietQrClient qrClient,
    IOptions<KioskOptions> ko, ILogger<Program> log, CancellationToken ct) =>
{
    var k = ko.Value;
    if (req.Amount < k.MinAmount || req.Amount > k.MaxAmount)
        return Results.Json(new ErrorBody($"Số tiền phải từ {k.MinAmount:N0} đến {k.MaxAmount:N0} VND"), statusCode: 400);

    var orderId = Helpers.NewOrderId();
    VietQrGenerateDto qr;
    try
    {
        qr = await qrClient.GenerateQrAsync(orderId, req.Amount, orderId, ct);
    }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        log.LogError(ex, "Tạo QR thất bại cho đơn {OrderId}", orderId);
        return Results.Json(new ErrorBody("Không tạo được mã QR, vui lòng thử lại"), statusCode: 502);
    }

    var now = DateTime.UtcNow;
    var deviceId = req.DeviceId is { Length: > 64 } ? req.DeviceId[..64] : req.DeviceId;
    var order = new Order
    {
        OrderId = orderId,
        Amount = req.Amount,
        Status = OrderStatus.Pending,
        QrCode = qr.QrCode!,
        // Dùng đúng content VietQR trả về (sandbox: VQRxxxx); nếu không có thì dùng content đã gửi.
        QrContent = string.IsNullOrWhiteSpace(qr.Content) ? orderId : qr.Content!,
        DeviceId = deviceId,
        CreatedAt = now,
        ExpiresAt = now.AddSeconds(k.OrderTtlSeconds)
    };
    db.Orders.Add(order);
    await db.SaveChangesAsync(ct);

    log.LogInformation("Tạo đơn {OrderId} {Amount} VND từ {Device}", order.OrderId, order.Amount, deviceId ?? "-");
    return Results.Ok(Helpers.ToDto(order, now));
});

// Hỏi trạng thái đơn. ?wait=20 -> giữ kết nối tối đa 20s tới khi trạng thái đổi (long-poll).
kioskGroup.MapGet("/orders/{orderId}", async (
    string orderId, int? wait, AppDb db, OrderNotifier notifier, CancellationToken ct) =>
{
    var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
    if (order == null) return Results.Json(new ErrorBody("Không tìm thấy đơn"), statusCode: 404);

    var seconds = Math.Clamp(wait ?? 0, 0, 25);
    if (seconds > 0 && order.Status == OrderStatus.Pending)
    {
        var registered = notifier.Register(orderId);
        // Đọc lại SAU khi đăng ký để không bỏ lỡ thay đổi xảy ra đúng khoảnh khắc này.
        order = await db.Orders.AsNoTracking().FirstAsync(o => o.OrderId == orderId, ct);
        if (order.Status == OrderStatus.Pending)
        {
            await notifier.WaitAsync(registered, TimeSpan.FromSeconds(seconds), ct);
            order = await db.Orders.AsNoTracking().FirstAsync(o => o.OrderId == orderId, ct);
        }
        else
        {
            notifier.Notify(orderId); // dọn đăng ký thừa
        }
    }

    return Results.Ok(Helpers.ToDto(order, DateTime.UtcNow));
});

// Huỷ đơn. Nếu đã được trả đúng lúc đó, kết quả trả về là PAID (máy phải dùng kết quả này).
kioskGroup.MapPost("/orders/{orderId}/cancel", async (
    string orderId, AppDb db, OrderNotifier notifier, CancellationToken ct) =>
{
    var order = await db.Orders.FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
    if (order == null) return Results.Json(new ErrorBody("Không tìm thấy đơn"), statusCode: 404);

    if (order.Status == OrderStatus.Pending)
    {
        order.Status = OrderStatus.Cancelled;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Callback thanh toán thắng cuộc đua: đọc lại trạng thái thật.
            db.ChangeTracker.Clear();
            order = await db.Orders.AsNoTracking().FirstAsync(o => o.OrderId == orderId, ct);
        }
        notifier.Notify(orderId);
    }

    return Results.Ok(Helpers.ToDto(order, DateTime.UtcNow));
});

// Chỉ môi trường Development: giả lập khách đã chuyển khoản để thử app mà không cần VietQR.
if (app.Environment.IsDevelopment())
{
    kioskGroup.MapPost("/dev/simulate-payment/{orderId}", async (
        string orderId, AppDb db, PaymentProcessor processor, CancellationToken ct) =>
    {
        var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
        if (order == null) return Results.Json(new ErrorBody("Không tìm thấy đơn"), statusCode: 404);

        await processor.ProcessAsync(new TransactionCallback
        {
            TransactionId = "SIM" + Guid.NewGuid().ToString("N"),
            TransactionTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ReferenceNumber = "SIM",
            Amount = order.Amount,
            Content = order.QrContent,
            BankAccount = vietQrCfg.BankAccount,
            OrderId = order.OrderId,
            TransType = "C"
        }, ct);

        return Results.Ok(new { simulated = true });
    });
}

app.Run();
