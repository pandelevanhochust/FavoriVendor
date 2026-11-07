namespace VietQrKiosk.Server.Entities;

public class PhotoLayout
{
    public string Id { get; set; } = string.Empty; // e.g. "1x4", "2x2", "2x3"
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public int WidthPx { get; set; } = 1200;
    public int HeightPx { get; set; } = 1800;
    public int HoleCount { get; set; } = 4;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; } = 0;
    public string? PricingTiersJson { get; set; } // JSON array: [{"quantity":2,"price":70000},{"quantity":4,"price":100000}]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<PhotoFrame> Frames { get; set; } = new List<PhotoFrame>();
}
