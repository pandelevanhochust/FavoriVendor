namespace VietQrKiosk.Server.Entities;

public class PhotoFilter
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty; // e.g. "classic_bw", "fuji_film", "korean_glow"
    public string Name { get; set; } = string.Empty; // e.g. "Đen Trắng Cổ Điển"
    public string Category { get; set; } = "General"; // "Film", "Black & White", "Vintage", "Natural"
    public string Type { get; set; } = "LUT"; // "LUT" or "Preset"
    public string? LutUrl { get; set; } // URL to LUT PNG file on R2 or Local
    public string? ThumbnailUrl { get; set; } // Preview image/icon URL
    public float IntensityDefault { get; set; } = 1.0f; // 0.0f to 1.0f
    public string? ConfigJson { get; set; } // For Preset parameters e.g. { brightness: 0.1, contrast: 1.2 }
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
