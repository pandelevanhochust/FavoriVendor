using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/auth")]
[Tags("Authentication")]
public class AuthController : ControllerBase
{
    private const string RefreshTokenCookieName = "refreshToken";
    private readonly IAuthService _authService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IAuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    /// <remarks>
    /// Authenticates a user with username and password, returning a JWT access token and setting HttpOnly RefreshToken cookie.
    /// </remarks>
    /// <param name="request">Login credentials (e.g. username 'admin', password 'admin').</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>JWT Bearer token and user profile information.</returns>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorBody), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct = default)
    {
        var result = await _authService.LoginAsync(request, ct);
        if (result == null)
        {
            return Unauthorized(new ErrorBody("Tên đăng nhập hoặc mật khẩu không chính xác."));
        }

        if (!string.IsNullOrEmpty(result.RefreshToken))
        {
            SetRefreshTokenCookie(result.RefreshToken);
        }

        return Ok(result);
    }

    /// <remarks>
    /// Refreshes JWT access token using the HttpOnly RefreshToken cookie or request payload.
    /// Implements Token Rotation.
    /// </remarks>
    /// <param name="request">Optional Refresh Token in body for non-browser clients.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>New JWT access token and updated profile.</returns>
    [HttpPost("refresh-token")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(RefreshTokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorBody), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> RefreshToken([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] RefreshTokenRequest? request, CancellationToken ct = default)
    {
        var token = Request.Cookies[RefreshTokenCookieName] ?? request?.RefreshToken;
        if (string.IsNullOrWhiteSpace(token))
        {
            return Unauthorized(new ErrorBody("Không tìm thấy Refresh Token. Vui lòng đăng nhập lại."));
        }

        var result = await _authService.RefreshTokenAsync(token, ct);
        if (result == null)
        {
            DeleteRefreshTokenCookie();
            return Unauthorized(new ErrorBody("Refresh Token không hợp lệ hoặc đã hết hạn."));
        }

        if (!string.IsNullOrEmpty(result.RefreshToken))
        {
            SetRefreshTokenCookie(result.RefreshToken);
        }

        return Ok(result);
    }

    /// <remarks>
    /// Logs out current user session by revoking the RefreshToken and clearing the HttpOnly cookie.
    /// </remarks>
    /// <param name="request">Optional Refresh Token in body.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpPost("logout")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LogoutResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Logout([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] RefreshTokenRequest? request, CancellationToken ct = default)
    {
        var token = Request.Cookies[RefreshTokenCookieName] ?? request?.RefreshToken;
        if (!string.IsNullOrWhiteSpace(token))
        {
            await _authService.RevokeTokenAsync(token, ct);
        }

        DeleteRefreshTokenCookie();
        return Ok(new LogoutResponse(true, "Đã đăng xuất thành công."));
    }

    /// <remarks>
    /// Retrieves current authenticated user profile from JWT Bearer token claims.
    /// </remarks>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>User profile of the currently logged-in account.</returns>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(UserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCurrentUser(CancellationToken ct = default)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdStr, out var userId))
        {
            return Unauthorized(new ErrorBody("Không tìm thấy định danh người dùng trong phiên làm việc."));
        }

        var user = await _authService.GetUserByIdAsync(userId, ct);
        if (user == null)
        {
            return NotFound(new ErrorBody("Tài khoản không tồn tại hoặc đã bị vô hiệu hóa."));
        }

        return Ok(user);
    }

    /// <remarks>
    /// Changes the password of the currently authenticated user.
    /// </remarks>
    /// <param name="request">Old password and new password.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Status indicating whether password was updated successfully.</returns>
    [HttpPost("change-password")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorBody), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct = default)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdStr, out var userId))
        {
            return Unauthorized(new ErrorBody("Phiên làm việc không hợp lệ."));
        }

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 4)
        {
            return BadRequest(new ErrorBody("Mật khẩu mới phải có ít nhất 4 ký tự."));
        }

        var success = await _authService.ChangePasswordAsync(userId, request, ct);
        if (!success)
        {
            return BadRequest(new ErrorBody("Mật khẩu cũ không chính xác."));
        }

        // Đổi mật khẩu xong thì clear cookie để buộc client refresh hoặc đăng nhập lại với credentials mới
        DeleteRefreshTokenCookie();
        return Ok(new { message = "Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được đăng xuất." });
    }

    private void SetRefreshTokenCookie(string token)
    {
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
            Expires = DateTime.UtcNow.AddDays(14),
            Path = "/api/auth"
        };
        Response.Cookies.Append(RefreshTokenCookieName, token, cookieOptions);
    }

    private void DeleteRefreshTokenCookie()
    {
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
            Expires = DateTime.UtcNow.AddDays(-1),
            Path = "/api/auth"
        };
        Response.Cookies.Append(RefreshTokenCookieName, "", cookieOptions);
    }
}
