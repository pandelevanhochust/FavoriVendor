using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Controllers;
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

builder.Services
    .AddControllers(o =>
    {
        o.Conventions.Add(new ControllerRouteConvention(
            callbackCfg.BasePath, builder.Environment.IsDevelopment()));
    })
    .AddJsonOptions(o =>
    {
        // VietQR có thể gửi số dưới dạng chuỗi ("amount":"10000")
        o.JsonSerializerOptions.NumberHandling = JsonNumberHandling.AllowReadingFromString;
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

app.MapControllers();

app.Run();

