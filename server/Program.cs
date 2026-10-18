using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Controllers;
using VietQrKiosk.Server.Infra.Data;
using VietQrKiosk.Server.Infra.External;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;
using VietQrKiosk.Server.Services.Implementations;
using VietQrKiosk.Server.Services.Interfaces;
// Tự động nạp biến môi trường từ .env nếu chạy local dotnet run
var candidateEnvFiles = new[] { ".env", "../.env", Path.Combine(AppContext.BaseDirectory, ".env") };
foreach (var envFile in candidateEnvFiles)
{
    if (File.Exists(envFile))
    {
        foreach (var line in File.ReadAllLines(envFile))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#')) continue;
            var parts = trimmed.Split('=', 2);
            if (parts.Length == 2)
            {
                var key = parts[0].Trim();
                var val = parts[1].Trim();
                Environment.SetEnvironmentVariable(key, val);
            }
        }
        break;
    }
}

if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")))
{
    Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
}

var builder = WebApplication.CreateBuilder(args);

// ------------------------------------------------------------------ Cấu hình
builder.Services.Configure<VietQrOptions>(builder.Configuration.GetSection("VietQr"));
builder.Services.Configure<CallbackOptions>(builder.Configuration.GetSection("Callback"));
builder.Services.Configure<KioskOptions>(builder.Configuration.GetSection("Kiosk"));

var vietQrCfg = builder.Configuration.GetSection("VietQr").Get<VietQrOptions>() ?? new VietQrOptions();
var callbackCfg = builder.Configuration.GetSection("Callback").Get<CallbackOptions>() ?? new CallbackOptions();
var kioskCfg = builder.Configuration.GetSection("Kiosk").Get<KioskOptions>() ?? new KioskOptions();

// Kiểm tra cấu hình bắt buộc
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

// ------------------------------------------------------------------ Infra: Database (PostgreSQL Supabase) & Repositories
var rawConnStr = builder.Configuration.GetConnectionString("Default");
if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DATABASE_URL")))
{
    rawConnStr = Environment.GetEnvironmentVariable("DATABASE_URL");
}

var connStr = FormatPostgresConnectionString(rawConnStr ?? "");
var hasPasswordPlaceholder = connStr.Contains("[YOUR-PASSWORD]", StringComparison.OrdinalIgnoreCase);
var usePostgres = !string.IsNullOrWhiteSpace(connStr) 
    && !connStr.Contains("localhost:5433") 
    && !hasPasswordPlaceholder;

if (hasPasswordPlaceholder)
{
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine("⚠️ [CẢNH BÁO] Connection string Supabase đang chứa placeholder '[YOUR-PASSWORD]'.");
    Console.WriteLine("   Vui lòng thay thế bằng mật khẩu thực tế của bạn trong server/appsettings.json.");
    Console.WriteLine("   Hệ thống tạm thời chạy với In-Memory Repositories để không làm gián đoạn ứng dụng.");
    Console.ResetColor();
}

if (usePostgres)
{
    builder.Services.AddDbContext<AppDbContext>(options =>
    {
        options.UseNpgsql(connStr, npgsqlOptions =>
        {
            npgsqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorCodesToAdd: null);
        });
    });

    builder.Services.AddScoped<IOrderRepository, OrderRepository>();
    builder.Services.AddScoped<ITransactionRepository, TransactionRepository>();
    builder.Services.AddScoped<IDiscountRepository, DiscountRepository>();
}
else
{
    // Fallback in-memory nếu chưa cấu hình chuỗi kết nối Supabase
    builder.Services.AddSingleton<IOrderRepository, InMemoryOrderRepository>();
    builder.Services.AddSingleton<ITransactionRepository, InMemoryTransactionRepository>();
    builder.Services.AddSingleton<IDiscountRepository, InMemoryDiscountRepository>();
}

builder.Services.AddHttpClient("vietqr", c =>
{
    c.BaseAddress = new Uri(vietQrCfg.BaseUrl.TrimEnd('/') + "/");
    c.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddSingleton<IVietQrClient, VietQrClient>();

// ------------------------------------------------------------------ Services: Business Logic
builder.Services.AddSingleton<IOrderNotifier, OrderNotifier>();
builder.Services.AddScoped<IDiscountService, DiscountService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<IPaymentProcessor, PaymentProcessor>();
builder.Services.AddHostedService<OrderExpiryService>();

// ------------------------------------------------------------------ Presentation: Controllers & Serialization
builder.Services.ConfigureHttpJsonOptions(o =>
{
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
        o.JsonSerializerOptions.NumberHandling = JsonNumberHandling.AllowReadingFromString;
    });

builder.Services.AddOpenApi();

// ------------------------------------------------------------------ Authentication (VietQR API Callback)
// JWT chỉ dùng cho chiều VietQR -> server (Transaction Sync). Không dùng MQTT.
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

// Cấu hình OpenAPI & Scalar API Reference
app.MapOpenApi();
app.MapScalarApiReference(options =>
{
    options.WithTitle("VietQR Kiosk API");
    options.WithTheme(ScalarTheme.Mars);
});

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Khởi tạo bảng và dữ liệu seed nếu chạy với PostgreSQL / Supabase
if (usePostgres)
{
    try
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        await DbInitializer.InitializeAsync(db, logger);
    }
    catch (Exception ex)
    {
        var logger = app.Services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "⚠️ Không thể kết nối hoặc khởi tạo Supabase PostgreSQL. Vui lòng kiểm tra lại mật khẩu Database trên Supabase.");
    }
}

app.Run();

static string FormatPostgresConnectionString(string input)
{
    if (string.IsNullOrWhiteSpace(input)) return input;
    if (input.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) ||
        input.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            var withoutScheme = input.Substring(input.IndexOf("://", StringComparison.Ordinal) + 3);
            var atIndex = withoutScheme.LastIndexOf('@');
            string userPart = "";
            string hostPart = withoutScheme;
            if (atIndex >= 0)
            {
                userPart = withoutScheme.Substring(0, atIndex);
                hostPart = withoutScheme.Substring(atIndex + 1);
            }

            var slashIndex = hostPart.IndexOf('/');
            string db = "postgres";
            if (slashIndex >= 0)
            {
                db = hostPart.Substring(slashIndex + 1);
                var qIndex = db.IndexOf('?');
                if (qIndex >= 0) db = db.Substring(0, qIndex);
                hostPart = hostPart.Substring(0, slashIndex);
            }

            var colonIndex = hostPart.IndexOf(':');
            string host = hostPart;
            int port = 5432;
            if (colonIndex >= 0)
            {
                host = hostPart.Substring(0, colonIndex);
                int.TryParse(hostPart.Substring(colonIndex + 1), out port);
            }

            string username = "postgres";
            string password = "";
            if (!string.IsNullOrEmpty(userPart))
            {
                var userColon = userPart.IndexOf(':');
                if (userColon >= 0)
                {
                    username = Uri.UnescapeDataString(userPart.Substring(0, userColon));
                    password = Uri.UnescapeDataString(userPart.Substring(userColon + 1));
                }
                else
                {
                    username = Uri.UnescapeDataString(userPart);
                }
            }

            return $"Host={host};Port={port};Database={db};Username={username};Password={password};SSL Mode=Require;Trust Server Certificate=true";
        }
        catch
        {
            return input;
        }
    }
    return input;
}
