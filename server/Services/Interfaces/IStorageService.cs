namespace VietQrKiosk.Server.Services.Interfaces;

public interface IStorageService
{
    string ProviderName { get; }

    /// <summary>
    /// Upload file lên bộ lưu trữ (Local hoặc Cloudflare R2) và trả về URL truy cập công khai
    /// </summary>
    Task<string> UploadFileAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        string folder = "frames",
        CancellationToken ct = default);

    /// <summary>
    /// Xoá file khỏi bộ lưu trữ dựa vào URL hoặc path
    /// </summary>
    Task<bool> DeleteFileAsync(string fileUrl, CancellationToken ct = default);
}
