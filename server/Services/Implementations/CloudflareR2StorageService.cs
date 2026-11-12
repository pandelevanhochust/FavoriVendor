using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using VietQrKiosk.Server.Config;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

public class CloudflareR2StorageService : IStorageService
{
    private readonly StorageOptions _options;
    private readonly ILogger<CloudflareR2StorageService> _logger;
    private readonly IAmazonS3? _s3Client;

    public string ProviderName => "CloudflareR2";

    public CloudflareR2StorageService(
        IOptions<StorageOptions> options,
        ILogger<CloudflareR2StorageService> logger)
    {
        _options = options.Value;
        _logger = logger;

        var r2 = _options.R2;
        if (!string.IsNullOrWhiteSpace(r2.AccountId) &&
            !string.IsNullOrWhiteSpace(r2.AccessKeyId) &&
            !string.IsNullOrWhiteSpace(r2.SecretAccessKey))
        {
            var credentials = new BasicAWSCredentials(r2.AccessKeyId, r2.SecretAccessKey);
            var config = new AmazonS3Config
            {
                ServiceURL = $"https://{r2.AccountId}.r2.cloudflarestorage.com",
                AuthenticationRegion = "auto",
                ForcePathStyle = true
            };
            _s3Client = new AmazonS3Client(credentials, config);
        }
        else
        {
            _logger.LogWarning("Cloudflare R2 is configured as provider, but AccountId/AccessKeyId/SecretAccessKey are missing.");
        }
    }

    public async Task<string> UploadFileAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        string folder = "frames",
        CancellationToken ct = default)
    {
        if (_s3Client == null)
        {
            throw new InvalidOperationException("Cloudflare R2 S3 Client is not initialized due to missing credentials.");
        }

        var ext = Path.GetExtension(fileName);
        var uniqueFileName = $"{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}{ext}";
        var key = $"{folder.Trim('/')}/{uniqueFileName}";

        var request = new PutObjectRequest
        {
            BucketName = _options.R2.BucketName,
            Key = key,
            InputStream = fileStream,
            ContentType = contentType,
            DisablePayloadSigning = true
        };

        _logger.LogInformation("Uploading file to Cloudflare R2: Bucket={Bucket}, Key={Key}", _options.R2.BucketName, key);
        var response = await _s3Client.PutObjectAsync(request, ct);

        if ((int)response.HttpStatusCode >= 200 && (int)response.HttpStatusCode < 300)
        {
            var domain = string.IsNullOrWhiteSpace(_options.R2.PublicDomain)
                ? $"https://{_options.R2.BucketName}.r2.cloudflarestorage.com"
                : _options.R2.PublicDomain.TrimEnd('/');

            var publicUrl = $"{domain}/{key}";
            _logger.LogInformation("Successfully uploaded to Cloudflare R2: {PublicUrl}", publicUrl);
            return publicUrl;
        }

        throw new HttpRequestException($"Failed to upload to Cloudflare R2. Http status: {response.HttpStatusCode}");
    }

    public async Task<bool> DeleteFileAsync(string fileUrl, CancellationToken ct = default)
    {
        if (_s3Client == null || string.IsNullOrWhiteSpace(fileUrl)) return false;

        try
        {
            // Extract key from URL
            string key = fileUrl;
            if (Uri.TryCreate(fileUrl, UriKind.Absolute, out var uri))
            {
                key = uri.AbsolutePath.TrimStart('/');
            }

            var request = new DeleteObjectRequest
            {
                BucketName = _options.R2.BucketName,
                Key = key
            };

            var res = await _s3Client.DeleteObjectAsync(request, ct);
            return (int)res.HttpStatusCode >= 200 && (int)res.HttpStatusCode < 300;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete file from Cloudflare R2: {Url}", fileUrl);
            return false;
        }
    }
}
