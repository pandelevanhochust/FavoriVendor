using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/frames")]
[Tags("Frames")]
public class FramesController : ControllerBase
{
    private const long MaxFrameBytes = 30 * 1024 * 1024;
    private const long MaxXmlBytes = 1 * 1024 * 1024;

    private readonly IPhotoFrameRepository _frameRepo;
    private readonly IPhotoLayoutRepository _layoutRepo;
    private readonly IStorageService _storageService;
    private readonly ILogger<FramesController> _logger;

    public FramesController(
        IPhotoFrameRepository frameRepo,
        IPhotoLayoutRepository layoutRepo,
        IStorageService storageService,
        ILogger<FramesController> logger)
    {
        _frameRepo = frameRepo;
        _layoutRepo = layoutRepo;
        _storageService = storageService;
        _logger = logger;
    }

    /// <remarks>
    /// Retrieves a list of photo frames with optional filtering by layout ID, category ID, and active status.
    /// </remarks>
    /// <param name="layoutId" example="1x4">Filter by layout format identifier.</param>
    /// <param name="categoryId" example="1">Filter by category integer identifier.</param>
    /// <param name="onlyActive" example="false">If true, returns only active frames enabled for customer selection.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>List of PhotoFrameDto items.</returns>
    [HttpGet]
    public async Task<ActionResult<List<PhotoFrameDto>>> GetAll(
        [FromQuery] string? layoutId = null,
        [FromQuery] int? categoryId = null,
        [FromQuery] bool onlyActive = false,
        CancellationToken ct = default)
    {
        var frames = await _frameRepo.GetAllAsync(layoutId, categoryId, onlyActive, ct);
        return Ok(frames.Select(MapToDto).ToList());
    }

    /// <remarks>
    /// Retrieves a specific photo frame by its unique integer identifier.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the photo frame.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Matching PhotoFrameDto details including hole coordinates.</returns>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<PhotoFrameDto>> GetById(int id, CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Photo frame with id={id} not found."));
        return Ok(MapToDto(frame));
    }

    /// <remarks>
    /// Uploads a new transparent PNG photo frame and configures its hole coordinates.
    /// Hole coordinates are stored in pixels of the uploaded PNG. holesJson may be a plain array
    /// or HiHiBooth-style metadata {"holes":[...],"fw":W,"fh":H}; coordinates are rescaled when fw/fh
    /// differ from the PNG size. A template.xml file, when provided, takes priority for holes and QR.
    /// </remarks>
    /// <param name="file">Transparent PNG frame image file with alpha channel.</param>
    /// <param name="layoutId" example="1x4">Target layout format identifier.</param>
    /// <param name="name" example="Summer Vintage 2026">Display name for the frame.</param>
    /// <param name="categoryId" example="1">Associated category ID.</param>
    /// <param name="holesJson" example="{&quot;holes&quot;:[{&quot;x&quot;:50,&quot;y&quot;:80,&quot;w&quot;:500,&quot;h&quot;:350}],&quot;fw&quot;:1200,&quot;fh&quot;:3600}">Photo holes as an array or {holes, fw, fh} metadata.</param>
    /// <param name="xmlFile">Optional template.xml file exported from photobooth frame tools.</param>
    /// <param name="displayOrder" example="0">Sorting order on kiosk display.</param>
    /// <param name="isActive" example="true">Whether the frame is active and visible.</param>
    /// <param name="qrX" example="85">QR centre X as % of frame width (0-100). Omit all three QR fields for no QR.</param>
    /// <param name="qrY" example="90">QR centre Y as % of frame height (0-100).</param>
    /// <param name="qrSize" example="10">QR side length as % of frame width (2-50).</param>
    /// <param name="enableOverlay" example="false">Show the frame over the live camera view while shooting.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Created PhotoFrameDto.</returns>
    [HttpPost]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoFrameDto>> Create(
        [FromForm] IFormFile file,
        [FromForm] string? layoutId = null,
        [FromForm] string? name = null,
        [FromForm] int? categoryId = null,
        [FromForm] string? holesJson = null,
        [FromForm] IFormFile? xmlFile = null,
        [FromForm] int displayOrder = 0,
        [FromForm] bool isActive = true,
        [FromForm] double? qrX = null,
        [FromForm] double? qrY = null,
        [FromForm] double? qrSize = null,
        [FromForm] bool enableOverlay = false,
        CancellationToken ct = default)
    {
        var fileError = ValidatePngUpload(file, required: true);
        if (fileError != null) return BadRequest(new ErrorBody(fileError));

        int frameW, frameH;
        await using (var probe = file.OpenReadStream())
        {
            (frameW, frameH) = FrameMetadata.ReadPngSize(probe) ?? (0, 0);
        }

        var template = TryParseTemplate(xmlFile, frameW, frameH, out var xmlError);
        if (xmlError != null) return BadRequest(new ErrorBody(xmlError));

        if (frameW == 0 && template != null)
        {
            frameW = template.Width;
            frameH = template.Height;
        }

        if (string.IsNullOrWhiteSpace(layoutId) && template != null)
        {
            if (!string.IsNullOrWhiteSpace(template.Layout) && await _layoutRepo.GetByIdAsync(template.Layout, ct) != null)
            {
                layoutId = template.Layout;
            }
            else
            {
                layoutId = FrameMetadata.GuessLayoutId(template.Holes);
            }
        }
        if (string.IsNullOrWhiteSpace(layoutId)) layoutId = "2x2";

        var layout = await _layoutRepo.GetByIdAsync(layoutId.Trim(), ct);
        if (layout == null)
        {
            return BadRequest(new ErrorBody($"Layout '{layoutId}' does not exist in the system."));
        }

        if (frameW == 0)
        {
            // PNG không đọc được kích thước và không có template: dùng khổ in của layout
            frameW = layout.WidthPx;
            frameH = layout.HeightPx;
        }

        List<HoleRectDto> holes;
        if (template != null)
        {
            holes = template.Holes;
            if (!qrX.HasValue && !qrY.HasValue && !qrSize.HasValue)
            {
                (qrX, qrY, qrSize) = (template.QrX, template.QrY, template.QrSize);
            }
        }
        else
        {
            try
            {
                holes = FrameMetadata.ParseHoles(holesJson, frameW, frameH);
            }
            catch (FormatException ex)
            {
                return BadRequest(new ErrorBody(ex.Message));
            }
        }

        var qrError = FrameMetadata.ValidateQr(qrX, qrY, qrSize);
        if (qrError != null) return BadRequest(new ErrorBody(qrError));

        if (string.IsNullOrWhiteSpace(name)) name = template?.Name;
        if (string.IsNullOrWhiteSpace(name))
        {
            name = Path.GetFileNameWithoutExtension(file.FileName).Replace('_', ' ').Replace('-', ' ').Trim();
        }

        string fileUrl;
        await using (var stream = file.OpenReadStream())
        {
            fileUrl = await _storageService.UploadFileAsync(stream, file.FileName, "image/png", "frames", ct);
        }

        var frame = new PhotoFrame
        {
            LayoutId = layout.Id,
            CategoryId = categoryId,
            Name = name.Trim(),
            FrameUrl = fileUrl,
            ThumbnailUrl = fileUrl,
            HolesJson = FrameMetadata.Serialize(holes),
            FrameWidth = frameW,
            FrameHeight = frameH,
            QrX = qrX,
            QrY = qrY,
            QrSize = qrSize,
            EnableOverlay = enableOverlay,
            DisplayOrder = displayOrder,
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _frameRepo.AddAsync(frame, ct);
        await _frameRepo.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Created new frame: {FrameId} - {FrameName} ({Width}x{Height}, {HoleCount} holes, {StorageProvider})",
            frame.Id, frame.Name, frameW, frameH, holes.Count, _storageService.ProviderName);
        return CreatedAtAction(nameof(GetById), new { id = frame.Id }, MapToDto(frame));
    }

    /// <remarks>
    /// Partially updates a photo frame. Every field is optional: omitted fields keep their current value.
    /// Use clearCategory=true to remove the category and clearQr=true to remove the QR position.
    /// When a replacement PNG has a different size and no new holes are sent, the existing holes are rescaled.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the photo frame.</param>
    /// <param name="file">Optional replacement PNG frame image file.</param>
    /// <param name="layoutId" example="1x4">Layout format identifier.</param>
    /// <param name="name" example="Summer Vintage 2026 Updated">Updated frame name.</param>
    /// <param name="categoryId" example="1">Updated category ID.</param>
    /// <param name="clearCategory" example="false">Remove the category from this frame.</param>
    /// <param name="holesJson" example="[]">Updated holes, as an array or {holes, fw, fh} metadata.</param>
    /// <param name="xmlFile">Optional replacement template.xml to update hole coordinates.</param>
    /// <param name="displayOrder" example="1">Updated display order.</param>
    /// <param name="isActive" example="true">Updated visibility status.</param>
    /// <param name="qrX" example="85">QR centre X (%).</param>
    /// <param name="qrY" example="90">QR centre Y (%).</param>
    /// <param name="qrSize" example="10">QR side length (% of width).</param>
    /// <param name="clearQr" example="false">Remove the QR position.</param>
    /// <param name="enableOverlay" example="false">Show the frame over the live camera view.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Updated PhotoFrameDto.</returns>
    [HttpPut("{id:int}")]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoFrameDto>> Update(
        int id,
        [FromForm] IFormFile? file = null,
        [FromForm] string? layoutId = null,
        [FromForm] string? name = null,
        [FromForm] int? categoryId = null,
        [FromForm] bool clearCategory = false,
        [FromForm] string? holesJson = null,
        [FromForm] IFormFile? xmlFile = null,
        [FromForm] int? displayOrder = null,
        [FromForm] bool? isActive = null,
        [FromForm] double? qrX = null,
        [FromForm] double? qrY = null,
        [FromForm] double? qrSize = null,
        [FromForm] bool clearQr = false,
        [FromForm] bool? enableOverlay = null,
        CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Photo frame with id={id} not found."));

        var fileError = ValidatePngUpload(file, required: false);
        if (fileError != null) return BadRequest(new ErrorBody(fileError));

        if (!string.IsNullOrWhiteSpace(layoutId) && layoutId != frame.LayoutId)
        {
            var layout = await _layoutRepo.GetByIdAsync(layoutId, ct);
            if (layout == null) return BadRequest(new ErrorBody($"Layout '{layoutId}' does not exist."));
            frame.LayoutId = layout.Id;
        }

        if (!string.IsNullOrWhiteSpace(name)) frame.Name = name.Trim();
        if (clearCategory) frame.CategoryId = null;
        else if (categoryId.HasValue) frame.CategoryId = categoryId;
        if (displayOrder.HasValue) frame.DisplayOrder = displayOrder.Value;
        if (isActive.HasValue) frame.IsActive = isActive.Value;
        if (enableOverlay.HasValue) frame.EnableOverlay = enableOverlay.Value;

        // Kích thước mới nếu thay file PNG
        var oldW = frame.FrameWidth;
        var oldH = frame.FrameHeight;
        var newW = oldW;
        var newH = oldH;
        if (file != null)
        {
            await using var probe = file.OpenReadStream();
            var size = FrameMetadata.ReadPngSize(probe);
            if (size.HasValue) (newW, newH) = size.Value;
        }
        if (newW == 0 || newH == 0)
        {
            var layout = frame.Layout ?? await _layoutRepo.GetByIdAsync(frame.LayoutId, ct);
            newW = layout?.WidthPx ?? 0;
            newH = layout?.HeightPx ?? 0;
        }

        var template = TryParseTemplate(xmlFile, newW, newH, out var xmlError);
        if (xmlError != null) return BadRequest(new ErrorBody(xmlError));

        if (template != null)
        {
            frame.HolesJson = FrameMetadata.Serialize(template.Holes);
            if (!clearQr && !qrX.HasValue && !qrY.HasValue && !qrSize.HasValue && template.QrX.HasValue)
            {
                (qrX, qrY, qrSize) = (template.QrX, template.QrY, template.QrSize);
            }
        }
        else if (!string.IsNullOrWhiteSpace(holesJson))
        {
            try
            {
                frame.HolesJson = FrameMetadata.Serialize(FrameMetadata.ParseHoles(holesJson, newW, newH));
            }
            catch (FormatException ex)
            {
                return BadRequest(new ErrorBody(ex.Message));
            }
        }
        else if (file != null && oldW > 0 && oldH > 0 && (oldW != newW || oldH != newH))
        {
            // Thay PNG khác kích thước mà không gửi toạ độ mới: co giãn ô theo tỉ lệ
            var rescaled = FrameMetadata.Rescale(FrameMetadata.Deserialize(frame.HolesJson), oldW, oldH, newW, newH);
            frame.HolesJson = FrameMetadata.Serialize(rescaled);
        }

        if (clearQr)
        {
            frame.QrX = frame.QrY = frame.QrSize = null;
        }
        else if (qrX.HasValue || qrY.HasValue || qrSize.HasValue)
        {
            var qrError = FrameMetadata.ValidateQr(qrX, qrY, qrSize);
            if (qrError != null) return BadRequest(new ErrorBody(qrError));
            frame.QrX = qrX;
            frame.QrY = qrY;
            frame.QrSize = qrSize;
        }

        string? replacedUrl = null;
        if (file != null)
        {
            replacedUrl = frame.FrameUrl;
            await using (var stream = file.OpenReadStream())
            {
                frame.FrameUrl = await _storageService.UploadFileAsync(stream, file.FileName, "image/png", "frames", ct);
            }
            frame.ThumbnailUrl = frame.FrameUrl;
        }
        frame.FrameWidth = newW;
        frame.FrameHeight = newH;

        await _frameRepo.UpdateAsync(frame, ct);
        await _frameRepo.SaveChangesAsync(ct);

        if (!string.IsNullOrWhiteSpace(replacedUrl) && replacedUrl != frame.FrameUrl)
        {
            _ = _storageService.DeleteFileAsync(replacedUrl, ct);
        }

        _logger.LogInformation("Updated frame: {FrameId}", frame.Id);
        return Ok(MapToDto(frame));
    }

    /// <remarks>
    /// Shows or hides many frames at once. When ids is omitted or empty, every frame is affected.
    /// </remarks>
    /// <param name="request">Target visibility and optional frame ids.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Number of frames whose visibility changed.</returns>
    [HttpPut("bulk-visibility")]
    [Authorize]
    public async Task<ActionResult<BulkFrameVisibilityResult>> BulkVisibility(
        [FromBody] BulkFrameVisibilityRequest request,
        CancellationToken ct = default)
    {
        var frames = await _frameRepo.GetAllAsync(null, null, false, ct);
        var targetIds = request.Ids is { Count: > 0 } ? request.Ids.ToHashSet() : null;

        var updated = 0;
        foreach (var frame in frames)
        {
            if (targetIds != null && !targetIds.Contains(frame.Id)) continue;
            if (frame.IsActive == request.IsActive) continue;
            frame.IsActive = request.IsActive;
            await _frameRepo.UpdateAsync(frame, ct);
            updated++;
        }

        if (updated > 0) await _frameRepo.SaveChangesAsync(ct);
        _logger.LogInformation("Bulk visibility: {Count} frames set to {IsActive}", updated, request.IsActive);
        return Ok(new BulkFrameVisibilityResult(updated));
    }

    /// <remarks>
    /// Deletes a photo frame and removes its associated storage assets.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the photo frame.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<IActionResult> Delete(int id, CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Photo frame with id={id} not found."));

        var fileUrl = frame.FrameUrl;
        var success = await _frameRepo.DeleteAsync(id, ct);
        if (success)
        {
            await _frameRepo.SaveChangesAsync(ct);
            if (!string.IsNullOrWhiteSpace(fileUrl))
            {
                _ = _storageService.DeleteFileAsync(fileUrl, ct);
            }
        }

        _logger.LogInformation("Deleted frame: {FrameId}", id);
        return NoContent();
    }

    /// <remarks>
    /// Automatically imports or synchronizes photo frames from local disk (e.g. D:\WORK\Frames) into Cloudflare R2 and Database.
    /// </remarks>
    /// <param name="customPath">Optional directory path. Defaults to D:\WORK\Frames.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>List of imported or updated photo frames.</returns>
    [HttpPost("auto-import")]
    [Authorize]
    public async Task<ActionResult<List<PhotoFrameDto>>> AutoImport(
        [FromQuery] string? customPath = null,
        CancellationToken ct = default)
    {
        var targetDir = string.IsNullOrWhiteSpace(customPath) ? @"D:\WORK\Frames" : customPath.Trim();
        if (!Directory.Exists(targetDir))
        {
            return BadRequest(new ErrorBody($"Thư mục '{targetDir}' không tồn tại trên máy chủ."));
        }

        var dirInfo = new DirectoryInfo(targetDir);
        var results = new List<PhotoFrame>();

        foreach (var sub in dirInfo.GetDirectories())
        {
            var xmlPath = Path.Combine(sub.FullName, "template.xml");
            if (!System.IO.File.Exists(xmlPath)) continue;

            try
            {
                // Đọc template lần đầu để lấy tên ảnh viền
                FrameMetadata.ParsedTemplate? probeTemplate;
                await using (var xs = System.IO.File.OpenRead(xmlPath))
                {
                    probeTemplate = FrameMetadata.ParseTemplateXml(xs);
                }
                if (probeTemplate == null) continue;

                string? frameFilePath = null;
                if (!string.IsNullOrWhiteSpace(probeTemplate.ImagePath))
                {
                    var potential = Path.Combine(sub.FullName, probeTemplate.ImagePath);
                    if (System.IO.File.Exists(potential)) frameFilePath = potential;
                }
                if (frameFilePath == null)
                {
                    var pngs = sub.GetFiles("*.png").Where(f => !f.Name.Equals("preview.png", StringComparison.OrdinalIgnoreCase)).ToList();
                    if (pngs.Count > 0) frameFilePath = pngs[0].FullName;
                }
                if (frameFilePath == null) continue;

                int frameW, frameH;
                await using (var probe = System.IO.File.OpenRead(frameFilePath))
                {
                    (frameW, frameH) = FrameMetadata.ReadPngSize(probe) ?? (probeTemplate.Width, probeTemplate.Height);
                }

                // Đọc lại để quy đổi toạ độ về đúng kích thước PNG
                FrameMetadata.ParsedTemplate template;
                await using (var xs = System.IO.File.OpenRead(xmlPath))
                {
                    template = FrameMetadata.ParseTemplateXml(xs, frameW, frameH) ?? probeTemplate;
                }

                var layoutId = FrameMetadata.GuessLayoutId(template.Holes);

                string frameUrl;
                await using (var fs = System.IO.File.OpenRead(frameFilePath))
                {
                    frameUrl = await _storageService.UploadFileAsync(fs, $"{sub.Name}_{Path.GetFileName(frameFilePath)}", "image/png", "frames", ct);
                }

                string? previewUrl = null;
                var previewFile = Path.Combine(sub.FullName, "preview.png");
                if (System.IO.File.Exists(previewFile))
                {
                    await using var fs = System.IO.File.OpenRead(previewFile);
                    previewUrl = await _storageService.UploadFileAsync(fs, $"{sub.Name}_preview.png", "image/png", "frames", ct);
                }

                var frameName = !string.IsNullOrWhiteSpace(template.Name)
                    ? $"{template.Name} ({layoutId})"
                    : $"{sub.Name} ({layoutId})";
                var holesJson = FrameMetadata.Serialize(template.Holes);

                var existing = (await _frameRepo.GetAllAsync(null, null, false, ct))
                    .FirstOrDefault(f => f.Name == frameName);

                if (existing != null)
                {
                    existing.LayoutId = layoutId;
                    existing.FrameUrl = frameUrl;
                    existing.ThumbnailUrl = previewUrl ?? frameUrl;
                    existing.HolesJson = holesJson;
                    existing.FrameWidth = frameW;
                    existing.FrameHeight = frameH;
                    existing.QrX = template.QrX;
                    existing.QrY = template.QrY;
                    existing.QrSize = template.QrSize;
                    await _frameRepo.UpdateAsync(existing, ct);
                    results.Add(existing);
                }
                else
                {
                    var newFrame = new PhotoFrame
                    {
                        Name = frameName,
                        LayoutId = layoutId,
                        CategoryId = 1,
                        FrameUrl = frameUrl,
                        ThumbnailUrl = previewUrl ?? frameUrl,
                        HolesJson = holesJson,
                        FrameWidth = frameW,
                        FrameHeight = frameH,
                        QrX = template.QrX,
                        QrY = template.QrY,
                        QrSize = template.QrSize,
                        DisplayOrder = results.Count + 1,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _frameRepo.AddAsync(newFrame, ct);
                    results.Add(newFrame);
                }

                if (results.Count >= 5) break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Lỗi khi xử lý thư mục {Folder}", sub.FullName);
            }
        }

        await _frameRepo.SaveChangesAsync(ct);
        _logger.LogInformation("Tự động đồng bộ {Count} frames từ {Directory} thành công.", results.Count, targetDir);
        return Ok(results.Select(MapToDto).ToList());
    }

    private static string? ValidatePngUpload(IFormFile? file, bool required)
    {
        if (file == null || file.Length == 0)
        {
            return required ? "Photo frame PNG file upload is required." : null;
        }
        if (file.Length > MaxFrameBytes)
        {
            return "Photo frame PNG must be 30 MB or smaller.";
        }
        if (!string.Equals(Path.GetExtension(file.FileName), ".png", StringComparison.OrdinalIgnoreCase))
        {
            return "Photo frames must be in transparent .PNG format with alpha channel.";
        }

        Span<byte> signature = stackalloc byte[8];
        using var stream = file.OpenReadStream();
        var read = 0;
        while (read < signature.Length)
        {
            var n = stream.Read(signature[read..]);
            if (n == 0) break;
            read += n;
        }
        ReadOnlySpan<byte> png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        return read == 8 && signature.SequenceEqual(png) ? null : "File tải lên không phải ảnh PNG hợp lệ.";
    }

    private FrameMetadata.ParsedTemplate? TryParseTemplate(IFormFile? xmlFile, int frameW, int frameH, out string? error)
    {
        error = null;
        if (xmlFile == null || xmlFile.Length == 0) return null;
        if (xmlFile.Length > MaxXmlBytes)
        {
            error = "template.xml must be 1 MB or smaller.";
            return null;
        }

        try
        {
            using var stream = xmlFile.OpenReadStream();
            var template = FrameMetadata.ParseTemplateXml(stream, frameW, frameH);
            if (template == null) error = "template.xml không chứa ô ảnh (thẻ <Photo>) nào.";
            return template;
        }
        catch (Exception ex) when (ex is System.Xml.XmlException or FormatException)
        {
            _logger.LogWarning(ex, "Failed to parse uploaded template.xml");
            error = "template.xml không đúng định dạng.";
            return null;
        }
    }

    private static PhotoFrameDto MapToDto(PhotoFrame entity)
    {
        // Dữ liệu cũ chưa có kích thước PNG: toạ độ được tạo theo khổ in của layout
        var width = entity.FrameWidth > 0 ? entity.FrameWidth : entity.Layout?.WidthPx ?? 0;
        var height = entity.FrameHeight > 0 ? entity.FrameHeight : entity.Layout?.HeightPx ?? 0;

        return new PhotoFrameDto(
            Id: entity.Id,
            LayoutId: entity.LayoutId,
            LayoutName: entity.Layout?.Name,
            CategoryId: entity.CategoryId,
            CategoryName: entity.Category?.Name,
            Name: entity.Name,
            FrameUrl: entity.FrameUrl,
            ThumbnailUrl: entity.ThumbnailUrl ?? entity.FrameUrl,
            Holes: FrameMetadata.Deserialize(entity.HolesJson),
            IsActive: entity.IsActive,
            DisplayOrder: entity.DisplayOrder,
            CreatedAt: entity.CreatedAt,
            FrameWidth: width,
            FrameHeight: height,
            QrX: entity.QrX,
            QrY: entity.QrY,
            QrSize: entity.QrSize,
            EnableOverlay: entity.EnableOverlay
        );
    }
}
