namespace VietQrKiosk.Server.Entities;

public class PhotoFrame
{
    public int Id { get; set; }
    public string LayoutId { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FrameUrl { get; set; } = string.Empty; // PNG with transparency
    public string? ThumbnailUrl { get; set; }
    public string HolesJson { get; set; } = "[]"; // JSON array of [{x, y, w, h}] theo pixel của PNG
    public int FrameWidth { get; set; } // Kích thước PNG gốc (px). 0 = chưa biết (dữ liệu cũ)
    public int FrameHeight { get; set; }
    public double? QrX { get; set; } // Tâm QR theo % chiều rộng (0-100). null = không in QR
    public double? QrY { get; set; } // Tâm QR theo % chiều cao (0-100)
    public double? QrSize { get; set; } // Cạnh QR theo % chiều rộng frame
    public bool EnableOverlay { get; set; } // Hiện frame đè lên Live View khi chụp
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public PhotoLayout? Layout { get; set; }
    public PhotoCategory? Category { get; set; }
}
