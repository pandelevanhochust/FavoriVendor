using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Implementations;
using Xunit;

namespace VietQrKiosk.Tests;

public class AuthTests
{
    private readonly AuthService _authService;
    private readonly InMemoryUserRepository _userRepo;
    private readonly InMemoryRefreshTokenRepository _refreshTokenRepo;

    public AuthTests()
    {
        _userRepo = new InMemoryUserRepository();
        _refreshTokenRepo = new InMemoryRefreshTokenRepository(_userRepo);
        var inMemConfig = new Dictionary<string, string?>
        {
            { "Jwt:Secret", "gjonItyonb40ki5Z+7W/7WP0agQn8QhrSx+YKWgFpnBoyaeoHkT9hsRFcNLFYdUP" }
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemConfig)
            .Build();

        _authService = new AuthService(
            _userRepo,
            _refreshTokenRepo,
            config,
            NullLogger<AuthService>.Instance);
    }

    [Fact]
    public async Task Login_WithDefaultAdminCredentials_ReturnsValidAccessTokenAndRefreshToken()
    {
        // Act: login with admin / admin
        var request = new LoginRequest("admin", "admin");
        var response = await _authService.LoginAsync(request);

        // Assert
        Assert.NotNull(response);
        Assert.NotEmpty(response.AccessToken);
        Assert.Equal("Bearer", response.TokenType);
        Assert.Equal("admin", response.User.Username);
        Assert.Equal("Admin", response.User.Role);
        Assert.NotNull(response.RefreshToken);
        Assert.NotEmpty(response.RefreshToken);

        // Validate JWT Claims
        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(response.AccessToken);
        Assert.NotNull(jwtToken);

        var nameClaim = jwtToken.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Name || c.Type == "unique_name" || c.Type == "name")?.Value;
        var roleClaim = jwtToken.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role || c.Type == "role")?.Value;
        Assert.Equal("admin", nameClaim);
        Assert.Equal("Admin", roleClaim);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsNull()
    {
        var request = new LoginRequest("admin", "wrong_password");
        var response = await _authService.LoginAsync(request);

        Assert.Null(response);
    }

    [Fact]
    public async Task Login_WithNonExistentUser_ReturnsNull()
    {
        var request = new LoginRequest("non_existent", "admin");
        var response = await _authService.LoginAsync(request);

        Assert.Null(response);
    }

    [Fact]
    public async Task RefreshToken_WithValidToken_RotatesTokenAndReturnsNewTokens()
    {
        // 1. Login
        var loginRes = await _authService.LoginAsync(new LoginRequest("admin", "admin"));
        Assert.NotNull(loginRes);
        var oldRefreshToken = loginRes.RefreshToken;
        Assert.NotNull(oldRefreshToken);

        // 2. Refresh Token
        var refreshRes = await _authService.RefreshTokenAsync(oldRefreshToken);
        Assert.NotNull(refreshRes);
        Assert.NotEmpty(refreshRes.AccessToken);
        Assert.NotNull(refreshRes.RefreshToken);
        Assert.NotEqual(oldRefreshToken, refreshRes.RefreshToken); // Token rotated!

        // 3. Old refresh token is now revoked
        var oldTokenEntity = await _refreshTokenRepo.GetByTokenAsync(oldRefreshToken);
        Assert.NotNull(oldTokenEntity);
        Assert.NotNull(oldTokenEntity.RevokedAt);
        Assert.Equal(refreshRes.RefreshToken, oldTokenEntity.ReplacedByToken);

        // 4. New refresh token is active
        var newTokenEntity = await _refreshTokenRepo.GetByTokenAsync(refreshRes.RefreshToken);
        Assert.NotNull(newTokenEntity);
        Assert.True(newTokenEntity.IsActive);
    }

    [Fact]
    public async Task RefreshToken_ReplayAttack_RevokesAllSessions()
    {
        // 1. Login
        var loginRes = await _authService.LoginAsync(new LoginRequest("admin", "admin"));
        Assert.NotNull(loginRes);
        var token1 = loginRes.RefreshToken!;

        // 2. Legitimate refresh
        var refreshRes1 = await _authService.RefreshTokenAsync(token1);
        Assert.NotNull(refreshRes1);
        var token2 = refreshRes1.RefreshToken!;

        // 3. Attacker replays revoked token1
        var replayRes = await _authService.RefreshTokenAsync(token1);
        Assert.Null(replayRes); // Replay rejected

        // 4. Legitimate user's token2 should now be revoked too as security defense
        var token2Entity = await _refreshTokenRepo.GetByTokenAsync(token2);
        Assert.NotNull(token2Entity);
        Assert.NotNull(token2Entity.RevokedAt); // All sessions terminated!
    }

    [Fact]
    public async Task RevokeToken_WithValidToken_RevokesSuccessfully()
    {
        var loginRes = await _authService.LoginAsync(new LoginRequest("admin", "admin"));
        Assert.NotNull(loginRes);

        var revokeSuccess = await _authService.RevokeTokenAsync(loginRes.RefreshToken!);
        Assert.True(revokeSuccess);

        // Cannot refresh with revoked token
        var refreshRes = await _authService.RefreshTokenAsync(loginRes.RefreshToken!);
        Assert.Null(refreshRes);
    }

    [Fact]
    public async Task ChangePassword_WithCorrectOldPassword_SucceedsAndRevokesSessions()
    {
        var user = await _userRepo.GetByUsernameAsync("admin");
        Assert.NotNull(user);

        var loginRes = await _authService.LoginAsync(new LoginRequest("admin", "admin"));
        Assert.NotNull(loginRes);

        var changeReq = new ChangePasswordRequest("admin", "new_admin_pass_2026");
        var result = await _authService.ChangePasswordAsync(user.Id, changeReq);
        Assert.True(result);

        // Verify old password no longer works
        var oldLogin = await _authService.LoginAsync(new LoginRequest("admin", "admin"));
        Assert.Null(oldLogin);

        // Verify existing refresh token was revoked
        var refreshRes = await _authService.RefreshTokenAsync(loginRes.RefreshToken!);
        Assert.Null(refreshRes);

        // Verify new password works
        var newLogin = await _authService.LoginAsync(new LoginRequest("admin", "new_admin_pass_2026"));
        Assert.NotNull(newLogin);
    }
}
