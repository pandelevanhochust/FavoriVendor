using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace VietQrKiosk.Server.Controllers;

/// <summary>
/// - Thay token [callbackBasePath] trong route của VietQrCallbackController bằng Callback:BasePath từ cấu hình.
/// - Ẩn KioskDevController khi không ở môi trường Development.
/// </summary>
public sealed class ControllerRouteConvention(string callbackBasePath, bool isDevelopment)
    : IApplicationModelConvention
{
    private readonly string _basePath = callbackBasePath.Trim('/');

    public void Apply(ApplicationModel application)
    {
        if (!isDevelopment)
        {
            var devController = application.Controllers
                .FirstOrDefault(c => c.ControllerType.AsType() == typeof(KioskDevController));
            if (devController != null)
            {
                application.Controllers.Remove(devController);
            }
        }

        foreach (var controller in application.Controllers)
        {
            foreach (var selector in controller.Selectors)
            {
                if (selector.AttributeRouteModel?.Template is { } template
                    && template.Contains("[callbackBasePath]", StringComparison.OrdinalIgnoreCase))
                {
                    selector.AttributeRouteModel.Template = template.Replace(
                        "[callbackBasePath]", _basePath, StringComparison.OrdinalIgnoreCase);
                }
            }
        }
    }
}

