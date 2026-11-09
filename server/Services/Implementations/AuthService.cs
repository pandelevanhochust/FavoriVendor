using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepo;
    private readonly IRefreshTokenRepository _refreshTokenRepo;
    private readonly IConfiguration _config;
    private readonly ILogger<AuthService> _logger;
    private readonly PasswordHasher<string> _hasher;

    public AuthService(
        IUserRepository userRepo,
        IRefreshTokenRepository refreshTokenRepo,
        IConfiguration config,
        ILogger<AuthService> logger)
    {
        _userRepo = userRepo;
        _refreshTokenRepo = refreshTokenRepo;
        _config = config;
        _logger = logger;
        _hasher = new PasswordHasher<string>();
    }

    public async Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return null;
        }

        var user = await _userRepo.GetByUsernameAsync(request.Username, ct);
        if (user == null || !user.IsActive)
        {
            _logger.LogWarning("Đăng nhập thất bại: Tài khoản '{Username}' không tồn tại hoặc bị khóa.", request.Username);
            return null;
        }

        var verifyResult = _hasher.VerifyHashedPassword(user.Username, user.PasswordHash, request.Password);
        if (verifyResult == PasswordVerificationResult.Failed)
        {
            _logger.LogWarning("Đăng nhập thất bại: Sai mật khẩu cho tài khoản '{Username}'.", request.Username);
            return null;
        }

        user.LastLoginAt = DateTime.UtcNow;
        await _userRepo.UpdateAsync(user, ct);

        var (token, expiresIn) = GenerateJwtToken(user);
        var userDto = new UserDto(user.Id, user.Username, user.FullName, user.Role, user.Email);

        // Generate Refresh Token (14 days validity)
        var refreshTokenString = GenerateSecureTokenString();
        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = refreshTokenString,
            ExpiresAt = DateTime.UtcNow.AddDays(14),
            CreatedAt = DateTime.UtcNow
        };
        await _refreshTokenRepo.AddAsync(refreshToken, ct);
        await _refreshTokenRepo.SaveChangesAsync(ct);

        _logger.LogInformation("✅ Đăng nhập thành công: User '{Username}' (Role: {Role}). Refresh token đã được khởi tạo.", user.Username, user.Role);
        return new LoginResponse(token, "Bearer", expiresIn, userDto, refreshTokenString);
    }

    public async Task<RefreshTokenResponse?> RefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return null;
        }

        var storedToken = await _refreshTokenRepo.GetByTokenAsync(refreshToken, ct);
        if (storedToken == null)
        {
            _logger.LogWarning("Refresh token không hợp lệ hoặc không tìm thấy.");
            return null;
        }

        // Replay Attack Detection: Token đã bị thu hồi nhưng vẫn cố refresh -> có thể bị đánh cắp!
        if (storedToken.RevokedAt != null)
        {
            _logger.LogWarning("🚨 CẢNH BÁO AN NINH: Phát hiện Refresh Token đã thu hồi được sử dụng lại! UserId: {UserId}. Thu hồi toàn bộ session đang kích hoạt.", storedToken.UserId);
            await _refreshTokenRepo.RevokeAllUserTokensAsync(storedToken.UserId, ct);
            await _refreshTokenRepo.SaveChangesAsync(ct);
            return null;
        }

        // Hết hạn
        if (DateTime.UtcNow >= storedToken.ExpiresAt)
        {
            _logger.LogInformation("Refresh token đã hết hạn cho UserId: {UserId}.", storedToken.UserId);
            return null;
        }

        // Lấy thông tin User
        var user = storedToken.User ?? await _userRepo.GetByIdAsync(storedToken.UserId, ct);
        if (user == null || !user.IsActive)
        {
            _logger.LogWarning("User gắn với refresh token không tồn tại hoặc đã bị khóa.");
            return null;
        }

        // Token Rotation: Thu hồi token cũ, sinh token mới
        var newRefreshTokenString = GenerateSecureTokenString();
        await _refreshTokenRepo.RevokeAsync(storedToken, newRefreshTokenString, ct);

        var newRefreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = newRefreshTokenString,
            ExpiresAt = DateTime.UtcNow.AddDays(14),
            CreatedAt = DateTime.UtcNow
        };
        await _refreshTokenRepo.AddAsync(newRefreshToken, ct);
        await _refreshTokenRepo.SaveChangesAsync(ct);

        var (accessToken, expiresIn) = GenerateJwtToken(user);
        var userDto = new UserDto(user.Id, user.Username, user.FullName, user.Role, user.Email);

        _logger.LogInformation("🔄 Đã rotate Refresh Token thành công cho User '{Username}'.", user.Username);
        return new RefreshTokenResponse(accessToken, "Bearer", expiresIn, userDto, newRefreshTokenString);
    }

    public async Task<bool> RevokeTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return false;

        var storedToken = await _refreshTokenRepo.GetByTokenAsync(refreshToken, ct);
        if (storedToken == null || storedToken.RevokedAt != null)
        {
            return false;
        }

        await _refreshTokenRepo.RevokeAsync(storedToken, null, ct);
        await _refreshTokenRepo.SaveChangesAsync(ct);
        _logger.LogInformation("Đã thu hồi Refresh Token cho UserId: {UserId}.", storedToken.UserId);
        return true;
    }

    public async Task<UserDto?> GetUserByIdAsync(int userId, CancellationToken ct = default)
    {
        var user = await _userRepo.GetByIdAsync(userId, ct);
        if (user == null) return null;
        return new UserDto(user.Id, user.Username, user.FullName, user.Role, user.Email);
    }

    public async Task<bool> ChangePasswordAsync(int userId, ChangePasswordRequest request, CancellationToken ct = default)
    {
        var user = await _userRepo.GetByIdAsync(userId, ct);
        if (user == null || !user.IsActive) return false;

        var verify = _hasher.VerifyHashedPassword(user.Username, user.PasswordHash, request.OldPassword);
        if (verify == PasswordVerificationResult.Failed) return false;

        user.PasswordHash = _hasher.HashPassword(user.Username, request.NewPassword);
        await _userRepo.UpdateAsync(user, ct);

        // Đổi mật khẩu thì nên thu hồi tất cả refresh token cũ để bảo vệ tài khoản
        await _refreshTokenRepo.RevokeAllUserTokensAsync(user.Id, ct);
        await _refreshTokenRepo.SaveChangesAsync(ct);

        _logger.LogInformation("User '{Username}' đã thay đổi mật khẩu thành công. Các session cũ đã được đăng xuất.", user.Username);
        return true;
    }

    private (string Token, int ExpiresIn) GenerateJwtToken(User user)
    {
        var secret = _config["Jwt:Secret"] 
                     ?? _config["Callback:JwtSecret"] 
                     ?? "gjonItyonb40ki5Z+7W/7WP0agQn8QhrSx+YKWgFpnBoyaeoHkT9hsRFcNLFYdUP";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        const int expiresIn = 3600; // 1 hour access token (refreshed automatically via refresh token)
        var expires = DateTime.UtcNow.AddSeconds(expiresIn);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, user.Role),
            new(ClaimTypes.GivenName, user.FullName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (!string.IsNullOrEmpty(user.Email))
        {
            claims.Add(new Claim(ClaimTypes.Email, user.Email));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires,
            SigningCredentials = creds
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return (tokenHandler.WriteToken(token), expiresIn);
    }

    private static string GenerateSecureTokenString()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
    }
}
