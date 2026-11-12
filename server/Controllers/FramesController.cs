using Microsoft.AspNetCore.Authorization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Controllers;

[ApiController]
[Route("api/frames")]
[Tags("Frames")]
public class FramesController : ControllerBase
{
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
    /// <param name="layoutId" example="strips_2x6">Filter by layout format identifier (e.g. 'strips_2x6', 'grid_4x6', 'postcard_4x6').</param>
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
    /// Optionally accepts a template.xml file to automatically parse photo holes and layout dimensions.
    /// </remarks>
    /// <param name="file">Transparent PNG frame image file with alpha channel.</param>
    /// <param name="layoutId" example="strips_2x6">Target layout format identifier.</param>
    /// <param name="name" example="Summer Vintage 2026">Display name for the frame.</param>
    /// <param name="categoryId" example="1">Associated category ID.</param>
    /// <param name="holesJson" example="[{&quot;x&quot;:50,&quot;y&quot;:80,&quot;width&quot;:500,&quot;height&quot;:350}]">JSON array of photo hole rectangles in pixels.</param>
    /// <param name="xmlFile">Optional template.xml file exported from photobooth frame tools.</param>
    /// <param name="displayOrder" example="0">Sorting order on kiosk display.</param>
    /// <param name="isActive" example="true">Whether the frame is active and visible.</param>
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
        CancellationToken ct = default)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new ErrorBody("Photo frame PNG file upload is required."));
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".png")
        {
            return BadRequest(new ErrorBody("Photo frames must be in transparent .PNG format with alpha channel."));
        }

        // Nếu có file XML tải lên kèm, ưu tiên parse tọa độ từ template.xml
        if (xmlFile != null && xmlFile.Length > 0)
        {
            try
            {
                using var xmlStream = xmlFile.OpenReadStream();
                var doc = System.Xml.Linq.XDocument.Load(xmlStream);
                var root = doc.Root;
                if (root != null)
                {
                    var photos = doc.Descendants().Where(e => string.Equals(e.Name.LocalName, "Photo", StringComparison.OrdinalIgnoreCase)).ToList();
                    if (photos.Count > 0)
                    {
                        var parsedHoles = photos.Select(p => new
                        {
                            x = int.Parse((string?)p.Attribute("Left") ?? (string?)p.Attribute("left") ?? "0"),
                            y = int.Parse((string?)p.Attribute("Top") ?? (string?)p.Attribute("top") ?? "0"),
                            w = int.Parse((string?)p.Attribute("Width") ?? (string?)p.Attribute("width") ?? "0"),
                            h = int.Parse((string?)p.Attribute("Height") ?? (string?)p.Attribute("height") ?? "0"),
                            rotation = 0
                        }).ToList();

                        holesJson = JsonSerializer.Serialize(parsedHoles);

                        if (string.IsNullOrWhiteSpace(layoutId))
                        {
                            var layoutAttr = (string?)root.Attribute("Layout") ?? (string?)root.Attribute("layout");
                            if (!string.IsNullOrWhiteSpace(layoutAttr) && (await _layoutRepo.GetByIdAsync(layoutAttr, ct)) != null)
                            {
                                layoutId = layoutAttr;
                            }
                            else
                            {
                                layoutId = parsedHoles.Count switch
                                {
                                    4 when parsedHoles.All(h => Math.Abs(h.x - parsedHoles[0].x) < 50) => "1x4",
                                    4 => "2x2",
                                    6 => "2x3",
                                    _ => "2x2"
                                };
                            }
                        }

                        if (string.IsNullOrWhiteSpace(name))
                        {
                            var nameAttr = (string?)root.Attribute("Name") ?? (string?)root.Attribute("name");
                            if (!string.IsNullOrWhiteSpace(nameAttr) && !nameAttr.Contains("Untitled", StringComparison.OrdinalIgnoreCase))
                            {
                                name = nameAttr;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse uploaded xmlFile for photo frame.");
            }
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            name = Path.GetFileNameWithoutExtension(file.FileName).Replace('_', ' ').Replace('-', ' ').Trim();
        }

        if (string.IsNullOrWhiteSpace(layoutId))
        {
            layoutId = "2x2";
        }

        var layout = await _layoutRepo.GetByIdAsync(layoutId, ct);
        if (layout == null)
        {
            return BadRequest(new ErrorBody($"Layout '{layoutId}' does not exist in the system."));
        }

        string fileUrl;
        using (var stream = file.OpenReadStream())
        {
            fileUrl = await _storageService.UploadFileAsync(stream, file.FileName, "image/png", "frames", ct);
        }

        var sanitizedHoles = string.IsNullOrWhiteSpace(holesJson) ? "[]" : holesJson.Trim();

        var frame = new PhotoFrame
        {
            LayoutId = layoutId.Trim(),
            CategoryId = categoryId,
            Name = name.Trim(),
            FrameUrl = fileUrl,
            ThumbnailUrl = fileUrl,
            HolesJson = sanitizedHoles,
            DisplayOrder = displayOrder,
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _frameRepo.AddAsync(frame, ct);
        await _frameRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Created new frame: {FrameId} - {FrameName} ({StorageProvider})", frame.Id, frame.Name, _storageService.ProviderName);
        return CreatedAtAction(nameof(GetById), new { id = frame.Id }, MapToDto(frame));
    }

    /// <remarks>
    /// Updates an existing photo frame configuration or replaces its image asset.
    /// </remarks>
    /// <param name="id" example="1">Unique integer identifier of the photo frame.</param>
    /// <param name="file">Optional replacement PNG frame image file.</param>
    /// <param name="layoutId" example="strips_2x6">Layout format identifier.</param>
    /// <param name="name" example="Summer Vintage 2026 Updated">Updated frame name.</param>
    /// <param name="categoryId" example="1">Updated category ID.</param>
    /// <param name="holesJson" example="[]">Updated photo hole coordinates JSON array.</param>
    /// <param name="xmlFile">Optional replacement template.xml to update hole coordinates.</param>
    /// <param name="displayOrder" example="1">Updated display order.</param>
    /// <param name="isActive" example="true">Updated visibility status.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Updated PhotoFrameDto.</returns>
    [HttpPut("{id:int}")]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<PhotoFrameDto>> Update(
        int id,
        [FromForm] IFormFile? file,
        [FromForm] string layoutId,
        [FromForm] string name,
        [FromForm] int? categoryId = null,
        [FromForm] string? holesJson = null,
        [FromForm] IFormFile? xmlFile = null,
        [FromForm] int displayOrder = 0,
        [FromForm] bool isActive = true,
        CancellationToken ct = default)
    {
        var frame = await _frameRepo.GetByIdAsync(id, ct);
        if (frame == null) return NotFound(new ErrorBody($"Photo frame with id={id} not found."));

        if (!string.IsNullOrWhiteSpace(layoutId) && layoutId != frame.LayoutId)
        {
            var layout = await _layoutRepo.GetByIdAsync(layoutId, ct);
            if (layout == null) return BadRequest(new ErrorBody($"Layout '{layoutId}' does not exist."));
            frame.LayoutId = layoutId;
        }

        if (!string.IsNullOrWhiteSpace(name))
        {
            frame.Name = name.Trim();
        }
        frame.CategoryId = categoryId;
        frame.DisplayOrder = displayOrder;
        frame.IsActive = isActive;

        // Nếu có xmlFile tải lên, parse cập nhật holes
        if (xmlFile != null && xmlFile.Length > 0)
        {
            try
            {
                using var xmlStream = xmlFile.OpenReadStream();
                var doc = System.Xml.Linq.XDocument.Load(xmlStream);
                var photos = doc.Descendants().Where(e => string.Equals(e.Name.LocalName, "Photo", StringComparison.OrdinalIgnoreCase)).ToList();
                if (photos.Count > 0)
                {
                    var parsedHoles = photos.Select(p => new
                    {
                        x = int.Parse((string?)p.Attribute("Left") ?? (string?)p.Attribute("left") ?? "0"),
                        y = int.Parse((string?)p.Attribute("Top") ?? (string?)p.Attribute("top") ?? "0"),
                        w = int.Parse((string?)p.Attribute("Width") ?? (string?)p.Attribute("width") ?? "0"),
                        h = int.Parse((string?)p.Attribute("Height") ?? (string?)p.Attribute("height") ?? "0"),
                        rotation = 0
                    }).ToList();
                    holesJson = JsonSerializer.Serialize(parsedHoles);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse updated xmlFile for frame {FrameId}", id);
            }
        }

        if (!string.IsNullOrWhiteSpace(holesJson)) frame.HolesJson = holesJson.Trim();

        if (file != null && file.Length > 0)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext != ".png")
            {
                return BadRequest(new ErrorBody("Photo frames must be in transparent .PNG format."));
            }

            var oldUrl = frame.FrameUrl;
            using (var stream = file.OpenReadStream())
            {
                frame.FrameUrl = await _storageService.UploadFileAsync(stream, file.FileName, "image/png", "frames", ct);
                frame.ThumbnailUrl = frame.FrameUrl;
            }

            if (!string.IsNullOrWhiteSpace(oldUrl) && oldUrl != frame.FrameUrl)
            {
                _ = _storageService.DeleteFileAsync(oldUrl, ct);
            }
        }

        await _frameRepo.UpdateAsync(frame, ct);
        await _frameRepo.SaveChangesAsync(ct);

        _logger.LogInformation("Updated frame: {FrameId}", frame.Id);
        return Ok(MapToDto(frame));
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
        var subDirs = dirInfo.GetDirectories();
        var results = new List<PhotoFrame>();

        foreach (var sub in subDirs)
        {
            var xmlFile = Path.Combine(sub.FullName, "template.xml");
            if (!System.IO.File.Exists(xmlFile)) continue;

            try
            {
                var doc = System.Xml.Linq.XDocument.Load(xmlFile);
                var root = doc.Root;
                if (root == null) continue;

                var imgEl = doc.Descendants("Image").FirstOrDefault(i => (string?)i.Attribute("Name") == "frame")
                            ?? doc.Descendants("Image").FirstOrDefault();
                var imageFileName = (string?)imgEl?.Attribute("ImagePath");

                string? frameFilePath = null;
                if (!string.IsNullOrWhiteSpace(imageFileName))
                {
                    var potential = Path.Combine(sub.FullName, imageFileName);
                    if (System.IO.File.Exists(potential)) frameFilePath = potential;
                }

                if (frameFilePath == null)
                {
                    var pngs = sub.GetFiles("*.png").Where(f => !f.Name.Equals("preview.png", StringComparison.OrdinalIgnoreCase)).ToList();
                    if (pngs.Count > 0) frameFilePath = pngs[0].FullName;
                }

                if (frameFilePath == null) continue;

                var photos = doc.Descendants("Photo").ToList();
                var holes = photos.Select(p => new
                {
                    x = int.Parse((string?)p.Attribute("Left") ?? "0"),
                    y = int.Parse((string?)p.Attribute("Top") ?? "0"),
                    w = int.Parse((string?)p.Attribute("Width") ?? "0"),
                    h = int.Parse((string?)p.Attribute("Height") ?? "0"),
                    rotation = 0
                }).ToList();

                var holeCount = holes.Count;
                var layoutId = holeCount switch
                {
                    4 when holes.All(h => Math.Abs(h.x - holes[0].x) < 50) => "1x4",
                    4 => "2x2",
                    6 => "2x3",
                    _ => "2x2"
                };

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

                var nameAttr = (string?)root.Attribute("Name");
                var frameName = (!string.IsNullOrWhiteSpace(nameAttr) && !nameAttr.Contains("Untitled", StringComparison.OrdinalIgnoreCase))
                    ? $"{nameAttr} ({layoutId})"
                    : $"{sub.Name} ({layoutId})";

                var holesJson = JsonSerializer.Serialize(holes);

                var existing = (await _frameRepo.GetAllAsync(null, null, false, ct))
                    .FirstOrDefault(f => f.Name == frameName);

                if (existing != null)
                {
                    existing.LayoutId = layoutId;
                    existing.FrameUrl = frameUrl;
                    existing.ThumbnailUrl = previewUrl ?? frameUrl;
                    existing.HolesJson = holesJson;
                    existing.UpdatedAt = DateTime.UtcNow;
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

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private static PhotoFrameDto MapToDto(PhotoFrame entity)
    {
        var holes = new List<HoleRectDto>();
        if (!string.IsNullOrWhiteSpace(entity.HolesJson))
        {
            try
            {
                holes = JsonSerializer.Deserialize<List<HoleRectDto>>(entity.HolesJson, JsonOpts) ?? new();
            }
            catch
            {
                // Fallback empty
            }
        }

        return new PhotoFrameDto(
            Id: entity.Id,
            LayoutId: entity.LayoutId,
            LayoutName: entity.Layout?.Name,
            CategoryId: entity.CategoryId,
            CategoryName: entity.Category?.Name,
            Name: entity.Name,
            FrameUrl: entity.FrameUrl,
            ThumbnailUrl: entity.ThumbnailUrl ?? entity.FrameUrl,
            Holes: holes,
            IsActive: entity.IsActive,
            DisplayOrder: entity.DisplayOrder,
            CreatedAt: entity.CreatedAt
        );
    }
}