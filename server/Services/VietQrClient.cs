using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

public class VietQrException : Exception
{
    public VietQrException(string message) : base(message) { }
}

/// <summary>Gọi API của VietQR: Get Token (cache ~5 phút) và Generate QR.</summary>
public class VietQrClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _factory;
    private readonly VietQrOptions _opt;
    private readonly ILogger<VietQrClient> _log;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _token;
    private DateTime _tokenExpiresUtc = DateTime.MinValue;

    public VietQrClient(IHttpClientFactory factory, IOptions<VietQrOptions> opt, ILogger<VietQrClient> log)
    {
        _factory = factory;
        _opt = opt.Value;
        _log = log;
    }

    private async Task<string> GetTokenAsync(bool forceRefresh, CancellationToken ct)
    {
        if (!forceRefresh && _token != null && DateTime.UtcNow < _tokenExpiresUtc) return _token;

        await _tokenLock.WaitAsync(ct);
        try
        {
            if (!forceRefresh && _token != null && DateTime.UtcNow < _tokenExpiresUtc) return _token;

            var http = _factory.CreateClient("vietqr");
            using var req = new HttpRequestMessage(HttpMethod.Post, "vqr/api/token_generate");
            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_opt.Username}:{_opt.Password}"));
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

            using var res = await http.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                throw new VietQrException($"Get token thất bại ({(int)res.StatusCode}): {body}");

            var dto = JsonSerializer.Deserialize<VietQrTokenDto>(body, Json);
            if (dto == null || string.IsNullOrEmpty(dto.AccessToken))
                throw new VietQrException("Get token: không có access_token");

            _token = dto.AccessToken;
            var ttl = dto.ExpiresIn > 0 ? dto.ExpiresIn : 300;
            _tokenExpiresUtc = DateTime.UtcNow.AddSeconds(Math.Max(10, ttl - 30)); // trừ hao 30s
            return _token;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    /// <summary>Tạo VietQR động (qrType=0). content tối đa 23 ký tự, orderId tối đa 13 ký tự.</summary>
    public async Task<VietQrGenerateDto> GenerateQrAsync(string orderId, long amount, string content, CancellationToken ct)
    {
        var payload = new
        {
            bankCode = _opt.BankCode,
            bankAccount = _opt.BankAccount,
            userBankName = _opt.AccountName,
            content,
            qrType = 0,
            amount,
            orderId,
            transType = "C"
        };

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var token = await GetTokenAsync(forceRefresh: attempt == 1, ct);
            var http = _factory.CreateClient("vietqr");

            using var req = new HttpRequestMessage(HttpMethod.Post, "vqr/api/qr/generate-customer")
            {
                Content = JsonContent.Create(payload)
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var res = await http.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);

            if (res.StatusCode == HttpStatusCode.Unauthorized && attempt == 0)
            {
                _log.LogWarning("VietQR trả 401, làm mới token và thử lại");
                continue;
            }

            VietQrGenerateDto? dto = null;
            try { dto = JsonSerializer.Deserialize<VietQrGenerateDto>(body, Json); }
            catch (JsonException) { /* xử lý bên dưới */ }

            if (!res.IsSuccessStatusCode || dto == null || dto.Status == "FAILED" || string.IsNullOrEmpty(dto.QrCode))
                throw new VietQrException($"Generate QR thất bại ({(int)res.StatusCode}): {body}");

            return dto;
        }

        throw new VietQrException("Generate QR thất bại sau khi làm mới token");
    }
}
