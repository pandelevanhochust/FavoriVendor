namespace VietQrKiosk.Server.Config;

public class StorageOptions
{
    public const string SectionName = "Storage";

    public string Provider { get; set; } = "Local"; // "Local" or "CloudflareR2"
    public LocalStorageOptions Local { get; set; } = new();
    public CloudflareR2Options R2 { get; set; } = new();
}

public class LocalStorageOptions
{
    public string BaseDirectory { get; set; } = "data/uploads";
    public string PublicBaseUrl { get; set; } = "/uploads";
}

public class CloudflareR2Options
{
    public string AccountId { get; set; } = string.Empty;
    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string BucketName { get; set; } = string.Empty;
    public string PublicDomain { get; set; } = string.Empty; // e.g. "https://file.hihibooth.app" or "https://pub-xxx.r2.dev"
}
