using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Controllers;
using VietQrKiosk.Server.Infra;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// ------------------------------------------------------------------ cấu hình
builder.Services.Configure<MqttOptions>(builder.Configuration.GetSection("Mqtt"));
builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection("Admin"));
builder.Services.Configure<KioskOptions>(builder.Configuration.GetSection("Kiosk"));

var mqttCfg = builder.Configuration.GetSection("Mqtt").Get<MqttOptions>() ?? new MqttOptions();
var adminCfg = builder.Configuration.GetSection("Admin").Get<AdminOptions>() ?? new AdminOptions();
var kioskCfg = builder.Configuration.GetSection("Kiosk").Get<KioskOptions>() ?? new KioskOptions();

// Dừng ngay khi thiếu cấu hình bí mật thay vì chạy với giá trị rỗng (không an toàn).
Helpers.Require(!string.IsNullOrWhiteSpace(mqttCfg.Host), "Mqtt:Host (VietQR cấp)");
Helpers.Require(mqttCfg.Port is > 0 and <= 65535, "Mqtt:Port");
Helpers.Require(!string.IsNullOrWhiteSpace(mqttCfg.Username) && !string.IsNullOrWhiteSpace(mqttCfg.Password),
    "Mqtt:Username / Mqtt:Password (VietQR cấp)");
Helpers.Require(!string.IsNullOrWhiteSpace(mqttCfg.ClientId), "Mqtt:ClientId (cố định, duy nhất)");
Helpers.Require(kioskCfg.ApiKey.Length >= 16, "Kiosk:ApiKey (tối thiểu 16 ký tự)");
Helpers.Require(kioskCfg.OrderTtlSeconds is >= 60 and <= 900, "Kiosk:OrderTtlSeconds (60..900)");
Helpers.Require(adminCfg.ApiKey.Length == 0 || adminCfg.ApiKey.Length >= 16,
    "Admin:ApiKey (để trống để tắt API quản trị, hoặc tối thiểu 16 ký tự)");

// ------------------------------------------------------------------ dịch vụ
Directory.CreateDirectory("data");

// Cơ sở dữ liệu PostgreSQL (lớp Infra)
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Host=localhost;Port=5433;Database=vietqr_kiosk;Username=kiosk_user;Password=kiosk_secret_pass";

builder.Services.AddPooledDbContextFactory<KioskDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddSingleton<IOrderRepository, OrderRepository>();
builder.Services.AddSingleton<IBankTransactionRepository, BankTransactionRepository>();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.NumberHandling = JsonNumberHandling.AllowReadingFromString;
});

// OpenAPI & Scalar API Reference
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "VietQR Kiosk API", Version = "v1" });
    c.AddSecurityDefinition("ApiKey", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "Nhập API Key vào header X-Api-Key để xác thực",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Name = "X-Api-Key",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Scheme = "ApiKeyScheme"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "ApiKey"
                }
            },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddSingleton<OrderNotifier>();
builder.Services.AddSingleton<MqttStats>();
builder.Services.AddSingleton<TerminalStore>();
builder.Services.AddSingleton<PendingQrRegistry>();
builder.Services.AddSingleton<MqttMessageHandler>();
builder.Services.AddSingleton<VietQrMqttClient>();
builder.Services.AddSingleton<IMqttPublisher>(sp => sp.GetRequiredService<VietQrMqttClient>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<VietQrMqttClient>());
builder.Services.AddSingleton<QrService>();
builder.Services.AddSingleton<ProvisioningService>();
builder.Services.AddSingleton<PaymentProcessor>();
builder.Services.AddHostedService<OrderExpiryService>();
builder.Services.AddHostedService<OrderReconcileService>();

var app = builder.Build();

// Tự động khởi tạo schema bảng và index cho PostgreSQL
using (var scope = app.Services.CreateScope())
{
    var factory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<KioskDbContext>>();
    await using var db = await factory.CreateDbContextAsync();
    await db.Database.EnsureCreatedAsync();
}

if (!app.Services.GetRequiredService<TerminalStore>().IsConfigured)
{
    app.Logger.LogWarning("Chưa có điểm bán/tài khoản nhận tiền: đặt Mqtt:TerminalCode, BankAccount, AccountName "
        + "hoặc chạy đồng bộ điểm bán (POST /admin/mqtt/provision). Tạo QR sẽ báo lỗi cho tới khi có.");
}

// ------------------------------------------------------------------ OpenAPI & Scalar UI
app.UseSwagger(options =>
{
    options.RouteTemplate = "openapi/{documentName}.json";
});
app.MapScalarApiReference(options =>
{
    options.WithTitle("VietQR Kiosk API Documentation")
           .WithTheme(ScalarTheme.Moon);
});

// ------------------------------------------------------------------ đăng ký Controllers / Endpoints
app.MapHealthEndpoints();
app.MapAdminEndpoints(adminCfg);
app.MapKioskEndpoints(app.Environment.IsDevelopment());

app.Run();
