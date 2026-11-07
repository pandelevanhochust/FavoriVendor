namespace VietQrKiosk.Server.Entities;

public class PhotoFrame
{
    public int Id { get; set; }
    public string LayoutId { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FrameUrl { get; set; } = string.Empty; // PNG with transparency
    public string? ThumbnailUrl { get; set; }
    public string HolesJson { get; set; } = "[]"; // JSON array of [{x, y, w, h}]
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public PhotoLayout? Layout { get; set; }
    public PhotoCategory? Category { get; set; }
}
