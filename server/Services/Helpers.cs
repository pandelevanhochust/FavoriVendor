using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Data;
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

    public static OrderDto ToDto(Order o, DateTime nowUtc)
    {
        var remaining = (int)Math.Max(0, (o.ExpiresAt - nowUtc).TotalSeconds);
        return new OrderDto(
            o.OrderId,
            o.Status.ToString().ToUpperInvariant(),
            o.Amount,
            o.QrCode,
            o.QrContent,
            remaining,
            o.PaidAt);
    }

    public static void Require(bool ok, string message)
    {
        if (!ok) throw new InvalidOperationException("Cấu hình thiếu/sai: " + message);
    }
}
