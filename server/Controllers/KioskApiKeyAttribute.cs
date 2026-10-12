using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;

namespace VietQrKiosk.Server.Controllers;

/// <summary>Kiểm tra header X-Api-Key cho các API dành cho máy Kiosk (Android).</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class KioskApiKeyAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var opt = context.HttpContext.RequestServices.GetRequiredService<IOptions<KioskOptions>>().Value;
        var provided = context.HttpContext.Request.Headers["X-Api-Key"].ToString();
        if (!Helpers.FixedEquals(provided, opt.ApiKey))
        {
            context.Result = new ObjectResult(new ErrorBody("Unauthorized"))
            {
                StatusCode = StatusCodes.Status401Unauthorized
            };
            return;
        }

        await next();
    }
}

