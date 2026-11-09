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

    public static (DateTime? FromUtc, DateTime? ToUtc) ParseDateRange(
        string? startDate, string? endDate, int tzOffsetHours = 7)
    {
        var tz = TimeSpan.FromHours(tzOffsetHours);

        // Trường hợp chỉ truyền startDate (ví dụ '2026-11-09') mà không truyền endDate
        if (!string.IsNullOrWhiteSpace(startDate) && string.IsNullOrWhiteSpace(endDate))
        {
            DateTime? from = ParseDateTimePoint(startDate, isEndOfDay: false, tz);
            DateTime? to = !startDate.Contains(':')
                ? ParseDateTimePoint(startDate, isEndOfDay: true, tz)
                : null;
            return (from, to);
        }

        DateTime? fromUtc = ParseDateTimePoint(startDate, isEndOfDay: false, tz);
        DateTime? toUtc = ParseDateTimePoint(endDate, isEndOfDay: true, tz);

        return (fromUtc, toUtc);
    }

    public static (DateTime? FromUtc, DateTime? ToUtc) ParseDateFilter(
        string? date, string? fromDate, string? toDate, int tzOffsetHours = 7)
    {
        if (!string.IsNullOrWhiteSpace(date))
        {
            return ParseDateRange(date, date, tzOffsetHours);
        }
        return ParseDateRange(fromDate, toDate, tzOffsetHours);
    }

    private static DateTime? ParseDateTimePoint(string? input, bool isEndOfDay, TimeSpan tz)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var trimmed = input.Trim();

        bool hasExplicitOffset = trimmed.EndsWith("Z", StringComparison.OrdinalIgnoreCase) ||
            (trimmed.Contains(':') && System.Text.RegularExpressions.Regex.IsMatch(trimmed, @"[+-]\d{2}(:?\d{2})?$"));

        if (hasExplicitOffset && DateTimeOffset.TryParse(trimmed, out var dto))
        {
            return dto.UtcDateTime;
        }

        if (DateTime.TryParse(trimmed, out var dt))
        {
            if (!trimmed.Contains(':'))
            {
                var local = isEndOfDay
                    ? new DateTime(dt.Year, dt.Month, dt.Day, 23, 59, 59, 999, DateTimeKind.Unspecified)
                    : new DateTime(dt.Year, dt.Month, dt.Day, 0, 0, 0, DateTimeKind.Unspecified);
                return DateTime.SpecifyKind(local - tz, DateTimeKind.Utc);
            }
            else
            {
                var local = new DateTime(dt.Year, dt.Month, dt.Day, dt.Hour, dt.Minute, dt.Second, dt.Millisecond, DateTimeKind.Unspecified);
                return DateTime.SpecifyKind(local - tz, DateTimeKind.Utc);
            }
        }

        return null;
    }

    public static void Require(bool ok, string message)
    {
        if (!ok) throw new InvalidOperationException("Cấu hình thiếu/sai: " + message);
    }
}
