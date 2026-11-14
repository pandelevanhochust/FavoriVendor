using System.Globalization;
using System.Text.Json;
using System.Xml.Linq;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services;

/// <summary>
/// Xử lý metadata của frame PNG: kích thước ảnh gốc, toạ độ ô lồng ảnh (holes) và vị trí QR.
/// Toạ độ holes luôn được lưu theo pixel của chính file PNG (FrameWidth x FrameHeight).
/// </summary>
public static class FrameMetadata
{
    /// <summary>Ô nhỏ hơn ngưỡng này (px) bị coi là nhiễu và bỏ đi.</summary>
    public const int MinHoleSize = 8;

    public const double MinQrSize = 2;
    public const double MaxQrSize = 50;

    private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    /// <summary>
    /// Đọc kích thước từ header IHDR của PNG. Trả về null nếu không phải PNG hợp lệ.
    /// Không đổi vị trí stream nếu stream hỗ trợ seek.
    /// </summary>
    public static (int Width, int Height)? ReadPngSize(Stream stream)
    {
        var start = stream.CanSeek ? stream.Position : 0;
        try
        {
            Span<byte> header = stackalloc byte[24];
            var read = 0;
            while (read < header.Length)
            {
                var n = stream.Read(header[read..]);
                if (n == 0) return null;
                read += n;
            }

            if (!header[..8].SequenceEqual(PngSignature)) return null;
            // Chunk đầu tiên phải là IHDR (byte 12..15)
            if (header[12] != 'I' || header[13] != 'H' || header[14] != 'D' || header[15] != 'R') return null;

            var width = (header[16] << 24) | (header[17] << 16) | (header[18] << 8) | header[19];
            var height = (header[20] << 24) | (header[21] << 16) | (header[22] << 8) | header[23];
            if (width <= 0 || height <= 0) return null;
            return (width, height);
        }
        finally
        {
            if (stream.CanSeek) stream.Position = start;
        }
    }

    /// <summary>
    /// Parse holes từ JSON. Chấp nhận 2 dạng:
    ///   - mảng: [{x,y,w,h,rotation?}]  (toạ độ theo pixel của PNG)
    ///   - metadata: {"holes":[...], "fw":2400, "fh":3600}  (toạ độ theo fw x fh, được quy đổi về PNG)
    /// Kết quả đã được làm tròn, kẹp trong khung và loại bỏ ô quá nhỏ.
    /// Ném <see cref="FormatException"/> nếu JSON không đúng định dạng.
    /// </summary>
    public static List<HoleRectDto> ParseHoles(string? json, int frameWidth, int frameHeight)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();

        JsonElement root;
        try
        {
            root = JsonSerializer.Deserialize<JsonElement>(json, JsonOpts);
        }
        catch (JsonException ex)
        {
            throw new FormatException("holesJson không phải JSON hợp lệ.", ex);
        }

        JsonElement holesEl;
        double sourceW = frameWidth, sourceH = frameHeight;
        if (root.ValueKind == JsonValueKind.Array)
        {
            holesEl = root;
        }
        else if (root.ValueKind == JsonValueKind.Object && TryGetProperty(root, "holes", out holesEl) && holesEl.ValueKind == JsonValueKind.Array)
        {
            if (TryGetNumber(root, "fw", out var fw) && fw > 0) sourceW = fw;
            if (TryGetNumber(root, "fh", out var fh) && fh > 0) sourceH = fh;
        }
        else
        {
            throw new FormatException("holesJson phải là mảng ô hoặc object {holes, fw, fh}.");
        }

        var raw = new List<(double X, double Y, double W, double H, double Rotation)>();
        foreach (var item in holesEl.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) throw new FormatException("Mỗi ô phải là object {x, y, w, h}.");
            if (!TryGetNumber(item, "x", out var x) || !TryGetNumber(item, "y", out var y)) throw new FormatException("Ô thiếu toạ độ x/y.");
            var hasW = TryGetNumber(item, "w", out var w) || TryGetNumber(item, "width", out w);
            var hasH = TryGetNumber(item, "h", out var h) || TryGetNumber(item, "height", out h);
            if (!hasW || !hasH) throw new FormatException("Ô thiếu kích thước w/h.");
            TryGetNumber(item, "rotation", out var rotation);
            raw.Add((x, y, w, h, rotation));
        }

        if (frameWidth <= 0 || frameHeight <= 0)
        {
            // Không biết kích thước PNG: giữ nguyên toạ độ, chỉ làm sạch giá trị âm
            return Normalize(raw, 1, 1, int.MaxValue, int.MaxValue);
        }

        return Normalize(raw, frameWidth / sourceW, frameHeight / sourceH, frameWidth, frameHeight);
    }

    /// <summary>Quy đổi holes khi file PNG được thay bằng file có kích thước khác.</summary>
    public static List<HoleRectDto> Rescale(IEnumerable<HoleRectDto> holes, int fromW, int fromH, int toW, int toH)
    {
        if (fromW <= 0 || fromH <= 0 || toW <= 0 || toH <= 0) return holes.ToList();
        var raw = holes.Select(h => ((double)h.X, (double)h.Y, (double)h.W, (double)h.H, h.Rotation ?? 0)).ToList();
        return Normalize(raw, (double)toW / fromW, (double)toH / fromH, toW, toH);
    }

    public static string Serialize(IEnumerable<HoleRectDto> holes) => JsonSerializer.Serialize(holes);

    public static List<HoleRectDto> Deserialize(string? holesJson)
    {
        if (string.IsNullOrWhiteSpace(holesJson)) return new();
        try
        {
            return JsonSerializer.Deserialize<List<HoleRectDto>>(holesJson, JsonOpts) ?? new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    /// <summary>
    /// Kiểm tra bộ 3 tham số QR (tâm X %, tâm Y %, cạnh % theo chiều rộng).
    /// Cả 3 cùng null = không in QR. Trả về thông báo lỗi hoặc null nếu hợp lệ.
    /// </summary>
    public static string? ValidateQr(double? x, double? y, double? size)
    {
        var count = (x.HasValue ? 1 : 0) + (y.HasValue ? 1 : 0) + (size.HasValue ? 1 : 0);
        if (count == 0) return null;
        if (count != 3) return "Vị trí QR cần đủ qrX, qrY và qrSize (hoặc bỏ trống cả ba).";
        if (x < 0 || x > 100 || y < 0 || y > 100) return "qrX và qrY phải nằm trong khoảng 0 - 100 (%).";
        if (size < MinQrSize || size > MaxQrSize) return $"qrSize phải nằm trong khoảng {MinQrSize} - {MaxQrSize} (% chiều rộng).";
        return null;
    }

    /// <summary>Kết quả đọc template.xml (định dạng Tool_Create_Frame / kho D:\WORK\Frames).</summary>
    public sealed record ParsedTemplate(
        string? Name,
        string? Layout,
        int Width,
        int Height,
        List<HoleRectDto> Holes,
        double? QrX,
        double? QrY,
        double? QrSize,
        string? ImagePath);

    /// <summary>
    /// Đọc template.xml. Toạ độ ô theo Width x Height của template; nếu biết kích thước PNG
    /// (frameWidth/frameHeight &gt; 0) thì quy đổi về pixel PNG. QR được chuyển sang % (tâm + cạnh).
    /// Trả về null nếu XML không có thẻ Photo nào.
    /// </summary>
    public static ParsedTemplate? ParseTemplateXml(Stream xml, int frameWidth = 0, int frameHeight = 0)
    {
        var doc = XDocument.Load(xml);
        var root = doc.Root;
        if (root == null) return null;

        var photos = doc.Descendants().Where(e => NameIs(e, "Photo")).ToList();
        if (photos.Count == 0) return null;

        var templateW = (int)Math.Round(Attr(root, "Width") ?? 0);
        var templateH = (int)Math.Round(Attr(root, "Height") ?? 0);
        var refW = templateW > 0 ? templateW : frameWidth;
        var refH = templateH > 0 ? templateH : frameHeight;

        var raw = photos
            .Select(p => (Attr(p, "Left") ?? 0, Attr(p, "Top") ?? 0, Attr(p, "Width") ?? 0, Attr(p, "Height") ?? 0, Attr(p, "Rotation") ?? 0))
            .ToList();

        List<HoleRectDto> holes;
        int outW = refW, outH = refH;
        if (frameWidth > 0 && frameHeight > 0 && refW > 0 && refH > 0)
        {
            holes = Normalize(raw, (double)frameWidth / refW, (double)frameHeight / refH, frameWidth, frameHeight);
            outW = frameWidth;
            outH = frameHeight;
        }
        else
        {
            holes = Normalize(raw, 1, 1, refW > 0 ? refW : int.MaxValue, refH > 0 ? refH : int.MaxValue);
        }

        double? qrX = null, qrY = null, qrSize = null;
        var qr = doc.Descendants().FirstOrDefault(e => NameIs(e, "QrCode"));
        if (qr != null && refW > 0 && refH > 0)
        {
            var left = Attr(qr, "Left") ?? 0;
            var top = Attr(qr, "Top") ?? 0;
            var width = Attr(qr, "Width") ?? 0;
            var height = Attr(qr, "Height") ?? width;
            if (width > 0)
            {
                qrX = Math.Round(Math.Clamp((left + width / 2) / refW * 100, 0, 100), 2);
                qrY = Math.Round(Math.Clamp((top + height / 2) / refH * 100, 0, 100), 2);
                qrSize = Math.Round(Math.Clamp(width / refW * 100, MinQrSize, MaxQrSize), 2);
            }
        }

        var name = AttrString(root, "Name");
        if (name != null && name.Contains("Untitled", StringComparison.OrdinalIgnoreCase)) name = null;

        var image = doc.Descendants().FirstOrDefault(e => NameIs(e, "Image") && string.Equals(AttrString(e, "Name"), "frame", StringComparison.OrdinalIgnoreCase))
                    ?? doc.Descendants().FirstOrDefault(e => NameIs(e, "Image"));

        return new ParsedTemplate(
            name,
            AttrString(root, "Layout"),
            outW,
            outH,
            holes,
            qrX,
            qrY,
            qrSize,
            image == null ? null : AttrString(image, "ImagePath"));
    }

    /// <summary>Đoán mã layout theo bố cục ô khi không có thông tin layout rõ ràng.</summary>
    public static string GuessLayoutId(IReadOnlyList<HoleRectDto> holes)
    {
        return holes.Count switch
        {
            4 when holes.All(h => Math.Abs(h.X - holes[0].X) < 50) => "1x4",
            4 => "2x2",
            6 => "2x3",
            _ => "2x2"
        };
    }

    private static List<HoleRectDto> Normalize(
        IEnumerable<(double X, double Y, double W, double H, double Rotation)> raw,
        double scaleX,
        double scaleY,
        int maxW,
        int maxH)
    {
        var result = new List<HoleRectDto>();
        foreach (var (x, y, w, h, rotation) in raw)
        {
            if (!double.IsFinite(x) || !double.IsFinite(y) || !double.IsFinite(w) || !double.IsFinite(h)) continue;

            var left = Math.Max(0, (int)Math.Round(x * scaleX));
            var top = Math.Max(0, (int)Math.Round(y * scaleY));
            var right = (int)Math.Round((x + w) * scaleX);
            var bottom = (int)Math.Round((y + h) * scaleY);
            right = Math.Min(maxW, right);
            bottom = Math.Min(maxH, bottom);

            var width = right - left;
            var height = bottom - top;
            if (width < MinHoleSize || height < MinHoleSize) continue;

            var rot = double.IsFinite(rotation) ? Math.Round(rotation % 360, 2) : 0;
            result.Add(new HoleRectDto(left, top, width, height, rot));
        }
        return result;
    }

    private static bool TryGetProperty(JsonElement obj, string name, out JsonElement value)
    {
        foreach (var prop in obj.EnumerateObject())
        {
            if (string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    private static bool TryGetNumber(JsonElement obj, string name, out double value)
    {
        value = 0;
        if (!TryGetProperty(obj, name, out var el)) return false;
        if (el.ValueKind == JsonValueKind.Number) return el.TryGetDouble(out value);
        if (el.ValueKind == JsonValueKind.String)
        {
            return double.TryParse(el.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }
        return false;
    }

    private static bool NameIs(XElement e, string name) =>
        string.Equals(e.Name.LocalName, name, StringComparison.OrdinalIgnoreCase);

    private static string? AttrString(XElement e, string name)
    {
        var attr = e.Attributes().FirstOrDefault(a => string.Equals(a.Name.LocalName, name, StringComparison.OrdinalIgnoreCase));
        var value = attr?.Value?.Trim();
        return string.IsNullOrEmpty(value) ? null : value;
    }

    private static double? Attr(XElement e, string name)
    {
        var s = AttrString(e, name);
        return s != null && double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) && double.IsFinite(v)
            ? v
            : null;
    }
}
