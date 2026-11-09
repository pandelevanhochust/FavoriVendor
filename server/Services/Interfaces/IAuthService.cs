using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<RefreshTokenResponse?> RefreshTokenAsync(string refreshToken, CancellationToken ct = default);
    Task<bool> RevokeTokenAsync(string refreshToken, CancellationToken ct = default);
    Task<UserDto?> GetUserByIdAsync(int userId, CancellationToken ct = default);
    Task<bool> ChangePasswordAsync(int userId, ChangePasswordRequest request, CancellationToken ct = default);
}
