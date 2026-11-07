using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

public class LocalStorageService : IStorageService
{
    private readonly StorageOptions _options;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<LocalStorageService> _logger;

    public string ProviderName => "Local";

    public LocalStorageService(
        IOptions<StorageOptions> options,
        IWebHostEnvironment env,
        ILogger<LocalStorageService> logger)
    {
        _options = options.Value;
        _env = env;
        _logger = logger;
    }

    public async Task<string> UploadFileAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        string folder = "frames",
        CancellationToken ct = default)
    {
        var cleanFileName = Path.GetFileName(fileName);
        var ext = Path.GetExtension(cleanFileName);
        var uniqueFileName = $"{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}{ext}";

        var baseDir = Path.IsPathRooted(_options.Local.BaseDirectory)
            ? _options.Local.BaseDirectory
            : Path.Combine(_env.ContentRootPath, _options.Local.BaseDirectory);

        var targetFolder = Path.Combine(baseDir, folder);
        Directory.CreateDirectory(targetFolder);

        var filePath = Path.Combine(targetFolder, uniqueFileName);

        using (var outputStream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await fileStream.CopyToAsync(outputStream, ct);
        }

        var publicBase = _options.Local.PublicBaseUrl.TrimEnd('/');
        var publicUrl = $"{publicBase}/{folder}/{uniqueFileName}";

        _logger.LogInformation("Saved local file: {FilePath} -> {PublicUrl}", filePath, publicUrl);
        return publicUrl;
    }

    public Task<bool> DeleteFileAsync(string fileUrl, CancellationToken ct = default)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(fileUrl)) return Task.FromResult(false);

            var publicBase = _options.Local.PublicBaseUrl.TrimEnd('/');
            if (!fileUrl.StartsWith(publicBase, StringComparison.OrdinalIgnoreCase))
            {
                // Not a local managed URL
                return Task.FromResult(false);
            }

            var relativePath = fileUrl.Substring(publicBase.Length).TrimStart('/', '\\');
            var baseDir = Path.IsPathRooted(_options.Local.BaseDirectory)
                ? _options.Local.BaseDirectory
                : Path.Combine(_env.ContentRootPath, _options.Local.BaseDirectory);

            var fullPath = Path.Combine(baseDir, relativePath);
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
                _logger.LogInformation("Deleted local file: {FullPath}", fullPath);
                return Task.FromResult(true);
            }

            return Task.FromResult(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete local file for url {FileUrl}", fileUrl);
            return Task.FromResult(false);
        }
    }
}
