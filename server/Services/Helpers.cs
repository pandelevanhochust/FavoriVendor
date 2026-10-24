using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

public static class Helpers
{
    // Bỏ các ký tự dễ nhầm (0/O, 1/I). 32 ký tự -> 12 ký tự ~ 2^60 khả năng.
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    /// <summary>Mã đơn 12 ký tự (VietQR giới hạn tối đa 13, không ký tự đặc biệt).</summary>
    public static string NewOrderId(int length = 12)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    /// <summary>So sánh hằng thời gian (băm SHA-256 trước để độ dài không bị lộ).</summary>
    public static bool FixedEquals(string? a, string? b)
    {
        var ha = SHA256.HashData(Encoding.UTF8.GetBytes(a ?? ""));
        var hb = SHA256.HashData(Encoding.UTF8.GetBytes(b ?? ""));
        return CryptographicOperations.FixedTimeEquals(ha, hb);
    }

    public static bool TryParseBasic(string? header, out string user, out string pass)
    {
        user = pass = "";
        if (string.IsNullOrWhiteSpace(header) || !header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
            return false;
        try
        {
            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(header[6..].Trim()));
            var idx = raw.IndexOf(':');
            if (idx < 0) return false;
            user = raw[..idx];
            pass = raw[(idx + 1)..];
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public static string CreateJwt(CallbackOptions o)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(o.JwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            claims: new[] { new Claim(JwtRegisteredClaimNames.Sub, o.Username) },
            notBefore: now,
            expires: now.AddSeconds(o.TokenSeconds),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static OrderDto ToDto(Order o, DateTime nowUtc, BankTransactionDto? txn = null)
    {
        var remaining = (int)Math.Max(0, (o.ExpiresAt - nowUtc).TotalSeconds);
        return new OrderDto(
            OrderId: o.OrderId,
            Status: o.Status.ToString().ToUpperInvariant(),
            Amount: o.Amount,
            OriginalAmount: o.OriginalAmount,
            DiscountAmount: o.DiscountAmount,
            DiscountCode: o.DiscountCode,
            QrCode: o.QrCode,
            Content: o.QrContent,
            ExpiresInSeconds: remaining,
            PaidAt: o.PaidAt,
            Transaction: txn);
    }

    public static (DateTime? FromUtc, DateTime? ToUtc) ParseDateFilter(
        string? date, string? fromDate, string? toDate, int tzOffsetHours = 7)
    {
        var tz = TimeSpan.FromHours(tzOffsetHours);

        // 1. Nếu có param "date" -> lấy trọn vẹn từ 00:00:00 đến 23:59:59.999 của ngày đó theo múi giờ
        if (!string.IsNullOrWhiteSpace(date))
        {
            if (DateTime.TryParse(date.Trim(), out var parsedDate))
            {
                var dayStartLocal = new DateTime(parsedDate.Year, parsedDate.Month, parsedDate.Day, 0, 0, 0, DateTimeKind.Unspecified);
                var dayEndLocal = new DateTime(parsedDate.Year, parsedDate.Month, parsedDate.Day, 23, 59, 59, 999, DateTimeKind.Unspecified);

                var startUtc = DateTime.SpecifyKind(dayStartLocal - tz, DateTimeKind.Utc);
                var endUtc = DateTime.SpecifyKind(dayEndLocal - tz, DateTimeKind.Utc);
                return (startUtc, endUtc);
            }
        }

        DateTime? fromUtc = null;
        DateTime? toUtc = null;

        if (!string.IsNullOrWhiteSpace(fromDate))
        {
            var trimmedFrom = fromDate.Trim();
            if (DateTime.TryParse(trimmedFrom, out var dtFrom) && !trimmedFrom.Contains(':'))
            {
                var localFrom = new DateTime(dtFrom.Year, dtFrom.Month, dtFrom.Day, 0, 0, 0, DateTimeKind.Unspecified);
                fromUtc = DateTime.SpecifyKind(localFrom - tz, DateTimeKind.Utc);
            }
            else if (DateTimeOffset.TryParse(trimmedFrom, out var dtoFrom))
            {
                fromUtc = dtoFrom.UtcDateTime;
            }
            else if (DateTime.TryParse(trimmedFrom, out dtFrom))
            {
                var localFrom = new DateTime(dtFrom.Year, dtFrom.Month, dtFrom.Day, 0, 0, 0, DateTimeKind.Unspecified);
                fromUtc = DateTime.SpecifyKind(localFrom - tz, DateTimeKind.Utc);
            }
        }

        if (!string.IsNullOrWhiteSpace(toDate))
        {
            var trimmedTo = toDate.Trim();
            if (DateTime.TryParse(trimmedTo, out var dtTo) && !trimmedTo.Contains(':'))
            {
                var localTo = new DateTime(dtTo.Year, dtTo.Month, dtTo.Day, 23, 59, 59, 999, DateTimeKind.Unspecified);
                toUtc = DateTime.SpecifyKind(localTo - tz, DateTimeKind.Utc);
            }
            else if (DateTimeOffset.TryParse(trimmedTo, out var dtoTo))
            {
                toUtc = dtoTo.UtcDateTime;
            }
            else if (DateTime.TryParse(trimmedTo, out dtTo))
            {
                var localTo = new DateTime(dtTo.Year, dtTo.Month, dtTo.Day, 23, 59, 59, 999, DateTimeKind.Unspecified);
                toUtc = DateTime.SpecifyKind(localTo - tz, DateTimeKind.Utc);
            }
        }

        return (fromUtc, toUtc);
    }

    public static void Require(bool ok, string message)
    {
        if (!ok) throw new InvalidOperationException("Cấu hình thiếu/sai: " + message);
    }
}
