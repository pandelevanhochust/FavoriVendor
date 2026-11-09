namespace VietQrKiosk.Server.Models;

public record LoginRequest(string Username, string Password);

public record LoginResponse(
    string AccessToken,
    string TokenType,
    int ExpiresIn,
    UserDto User,
    string? RefreshToken = null);

public record RefreshTokenRequest(string? RefreshToken = null);

public record RefreshTokenResponse(
    string AccessToken,
    string TokenType,
    int ExpiresIn,
    UserDto? User = null,
    string? RefreshToken = null);

public record UserDto(
    int Id,
    string Username,
    string FullName,
    string Role,
    string? Email);

public record ChangePasswordRequest(
    string OldPassword,
    string NewPassword);

public record LogoutResponse(bool Success, string Message);
