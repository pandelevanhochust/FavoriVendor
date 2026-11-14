using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Controllers;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;
using VietQrKiosk.Server.Infra.Repositories;
using VietQrKiosk.Server.Models;
using VietQrKiosk.Server.Services;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Tests;

public class FrameMetadataTests
{
    /// <summary>PNG signature + IHDR header đủ để đọc kích thước (không cần dữ liệu ảnh).</summary>
    private static byte[] PngHeader(int width, int height)
    {
        var bytes = new byte[33];
        new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }.CopyTo(bytes, 0);
        bytes[11] = 13; // độ dài chunk IHDR
        Encoding.ASCII.GetBytes("IHDR").CopyTo(bytes, 12);
        bytes[16] = (byte)(width >> 24); bytes[17] = (byte)(width >> 16); bytes[18] = (byte)(width >> 8); bytes[19] = (byte)width;
        bytes[20] = (byte)(height >> 24); bytes[21] = (byte)(height >> 16); bytes[22] = (byte)(height >> 8); bytes[23] = (byte)height;
        return bytes;
    }

    [Fact]
    public void ReadPngSize_ReadsIhdrAndRestoresPosition()
    {
        using var stream = new MemoryStream(PngHeader(1200, 3600));
        var size = FrameMetadata.ReadPngSize(stream);
        Assert.Equal((1200, 3600), size);
        Assert.Equal(0, stream.Position);
    }

    [Fact]
    public void ReadPngSize_ReturnsNullForNonPng()
    {
        using var stream = new MemoryStream(Encoding.ASCII.GetBytes("GIF89a................................"));
        Assert.Null(FrameMetadata.ReadPngSize(stream));
    }

    [Fact]
    public void ParseHoles_MetadataIsRescaledToPngSize()
    {
        // Toạ độ theo 1200x1800 nhưng PNG thật là 2400x3600
        const string json = "{\"holes\":[{\"x\":100,\"y\":50,\"w\":400,\"h\":300}],\"fw\":1200,\"fh\":1800}";
        var holes = FrameMetadata.ParseHoles(json, 2400, 3600);
        var hole = Assert.Single(holes);
        Assert.Equal(new HoleRectDto(200, 100, 800, 600, 0), hole);
    }

    [Fact]
    public void ParseHoles_ClampsToFrameAndDropsTinyHoles()
    {
        const string json = "[{\"x\":-20,\"y\":10,\"w\":200,\"h\":100},{\"x\":950,\"y\":0,\"w\":200,\"h\":100},{\"x\":5,\"y\":5,\"w\":3,\"h\":3}]";
        var holes = FrameMetadata.ParseHoles(json, 1000, 1000);
        Assert.Equal(2, holes.Count);
        Assert.Equal(new HoleRectDto(0, 10, 180, 100, 0), holes[0]);
        Assert.Equal(new HoleRectDto(950, 0, 50, 100, 0), holes[1]);
    }

    [Fact]
    public void ParseHoles_RejectsMalformedJson()
    {
        Assert.Throws<FormatException>(() => FrameMetadata.ParseHoles("{\"foo\":1}", 100, 100));
        Assert.Throws<FormatException>(() => FrameMetadata.ParseHoles("[{\"x\":1}]", 100, 100));
        Assert.Throws<FormatException>(() => FrameMetadata.ParseHoles("not json", 100, 100));
    }

    [Fact]
    public void Rescale_ScalesProportionally()
    {
        var holes = FrameMetadata.Rescale(new[] { new HoleRectDto(100, 200, 300, 400, 0) }, 1200, 1800, 2400, 3600);
        Assert.Equal(new HoleRectDto(200, 400, 600, 800, 0), Assert.Single(holes));
    }

    [Theory]
    [InlineData(null, null, null, true)]
    [InlineData(85d, 90d, 10d, true)]
    [InlineData(85d, null, 10d, false)]
    [InlineData(120d, 50d, 10d, false)]
    [InlineData(50d, 50d, 80d, false)]
    public void ValidateQr(double? x, double? y, double? size, bool valid)
    {
        Assert.Equal(valid, FrameMetadata.ValidateQr(x, y, size) == null);
    }

    [Fact]
    public void ParseTemplateXml_ScalesHolesAndConvertsQrToPercent()
    {
        const string xml = @"<Template Name=""Party"" Layout=""1x4"" Width=""1200"" Height=""3600"">
  <Photo Left=""100"" Top=""200"" Width=""1000"" Height=""700"" />
  <QrCode Left=""960"" Top=""3360"" Width=""120"" Height=""120"" />
  <Image Name=""frame"" ImagePath=""frame.png"" />
</Template>";
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(xml));

        // PNG thật gấp đôi kích thước template
        var template = FrameMetadata.ParseTemplateXml(stream, 2400, 7200);

        Assert.NotNull(template);
        Assert.Equal("Party", template!.Name);
        Assert.Equal("frame.png", template.ImagePath);
        Assert.Equal(new HoleRectDto(200, 400, 2000, 1400, 0), Assert.Single(template.Holes));
        Assert.Equal(85, template.QrX);
        Assert.Equal(95, template.QrY);
        Assert.Equal(10, template.QrSize);
    }

    // ------------------------------------------------------------------ Controller behaviour

    private static (FramesController Controller, AppDbContext Db) CreateController()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase("Test_FrameMeta_" + Guid.NewGuid())
            .Options;
        var db = new AppDbContext(options);
        db.PhotoLayouts.Add(new PhotoLayout { Id = "1x4", Name = "Strip", Slug = "1x4", WidthPx = 1200, HeightPx = 3600, HoleCount = 4 });
        db.PhotoCategories.Add(new PhotoCategory { Id = 7, Name = "Tết", Slug = "tet" });
        db.SaveChanges();

        var controller = new FramesController(
            new PhotoFrameRepository(db),
            new PhotoLayoutRepository(db),
            new NoopStorage(),
            new Microsoft.Extensions.Logging.Abstractions.NullLogger<FramesController>());
        return (controller, db);
    }

    private static IFormFile PngFile(int w, int h, string name = "frame.png")
    {
        var bytes = PngHeader(w, h);
        return new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", name);
    }

    [Fact]
    public async Task Create_StoresPngSizeRescaledHolesQrAndOverlay()
    {
        var (controller, db) = CreateController();
        using var _ = db;

        var result = await controller.Create(
            file: PngFile(2400, 7200),
            layoutId: "1x4",
            name: "Strip Party",
            categoryId: 7,
            holesJson: "{\"holes\":[{\"x\":60,\"y\":120,\"w\":1080,\"h\":760}],\"fw\":1200,\"fh\":3600}",
            qrX: 85, qrY: 92, qrSize: 12,
            enableOverlay: true);

        var dto = Assert.IsType<PhotoFrameDto>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
        Assert.Equal(2400, dto.FrameWidth);
        Assert.Equal(7200, dto.FrameHeight);
        Assert.Equal(new HoleRectDto(120, 240, 2160, 1520, 0), Assert.Single(dto.Holes));
        Assert.Equal(85, dto.QrX);
        Assert.Equal(12, dto.QrSize);
        Assert.True(dto.EnableOverlay);
    }

    [Fact]
    public async Task Create_RejectsNonPngContentAndPartialQr()
    {
        var (controller, db) = CreateController();
        using var _ = db;

        var fake = Encoding.ASCII.GetBytes("this is not a png file at all....");
        var notPng = new FormFile(new MemoryStream(fake), 0, fake.Length, "file", "frame.png");
        Assert.IsType<BadRequestObjectResult>((await controller.Create(file: notPng, layoutId: "1x4")).Result);

        var partialQr = await controller.Create(file: PngFile(1200, 3600), layoutId: "1x4", qrX: 50);
        Assert.IsType<BadRequestObjectResult>(partialQr.Result);
    }

    [Fact]
    public async Task Update_IsPartialAndRescalesHolesOnPngReplace()
    {
        var (controller, db) = CreateController();
        using var _ = db;

        var created = (PhotoFrameDto)((CreatedAtActionResult)(await controller.Create(
            file: PngFile(1200, 3600),
            layoutId: "1x4",
            name: "Original",
            categoryId: 7,
            holesJson: "[{\"x\":100,\"y\":100,\"w\":1000,\"h\":800}]",
            displayOrder: 3,
            qrX: 85, qrY: 92, qrSize: 12)).Result!).Value!;

        // Chỉ đổi trạng thái: các trường khác giữ nguyên
        var toggled = (PhotoFrameDto)((OkObjectResult)(await controller.Update(created.Id, isActive: false)).Result!).Value!;
        Assert.False(toggled.IsActive);
        Assert.Equal(7, toggled.CategoryId);
        Assert.Equal(3, toggled.DisplayOrder);
        Assert.Equal(85, toggled.QrX);

        // Thay PNG gấp đôi kích thước, không gửi holes: ô được co giãn
        var replaced = (PhotoFrameDto)((OkObjectResult)(await controller.Update(created.Id, file: PngFile(2400, 7200))).Result!).Value!;
        Assert.Equal(2400, replaced.FrameWidth);
        Assert.Equal(new HoleRectDto(200, 200, 2000, 1600, 0), Assert.Single(replaced.Holes));

        // Xoá danh mục và QR
        var cleared = (PhotoFrameDto)((OkObjectResult)(await controller.Update(created.Id, clearCategory: true, clearQr: true)).Result!).Value!;
        Assert.Null(cleared.CategoryId);
        Assert.Null(cleared.QrX);
    }

    [Fact]
    public async Task BulkVisibility_UpdatesOnlyRequestedFrames()
    {
        var (controller, db) = CreateController();
        using var _ = db;

        var ids = new List<int>();
        for (var i = 0; i < 3; i++)
        {
            var r = await controller.Create(file: PngFile(1200, 3600), layoutId: "1x4", name: $"F{i}");
            ids.Add(((PhotoFrameDto)((CreatedAtActionResult)r.Result!).Value!).Id);
        }

        var result = await controller.BulkVisibility(new BulkFrameVisibilityRequest(false, ids.Take(2).ToList()));
        Assert.Equal(2, ((BulkFrameVisibilityResult)((OkObjectResult)result.Result!).Value!).Updated);

        var active = db.PhotoFrames.AsNoTracking().ToDictionary(f => f.Id, f => f.IsActive);
        Assert.False(active[ids[0]]);
        Assert.False(active[ids[1]]);
        Assert.True(active[ids[2]]);
    }

    private sealed class NoopStorage : IStorageService
    {
        private int _counter;
        public string ProviderName => "Noop";
        public Task<string> UploadFileAsync(Stream fileStream, string fileName, string contentType, string folder = "frames", CancellationToken ct = default)
            => Task.FromResult($"https://cdn.test/{folder}/{++_counter}_{fileName}");
        public Task<bool> DeleteFileAsync(string fileUrl, CancellationToken ct = default) => Task.FromResult(true);
    }
}
