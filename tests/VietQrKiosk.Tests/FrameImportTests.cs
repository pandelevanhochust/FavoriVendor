using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;
using VietQrKiosk.Server.Infra.Repositories;
using Xunit;
using Xunit.Abstractions;

namespace VietQrKiosk.Tests;

public class FrameImportTests
{
    private readonly ITestOutputHelper _output;

    public FrameImportTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public async Task CanQueryFramesFromSupabase()
    {
        var connStr = "Host=aws-0-ap-southeast-2.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.vwzimfgkwvpvnracuvgq;Password=Ilovevuhuongsomuch@2026;SSL Mode=Require;Trust Server Certificate=true";
        var dbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connStr)
            .Options;

        using var db = new AppDbContext(dbOptions);
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;
        await DbInitializer.InitializeAsync(db, logger);
        var frames = await db.PhotoFrames.Include(f => f.Category).Include(f => f.Layout).OrderBy(f => f.DisplayOrder).ToListAsync();
        _output.WriteLine($"===== DANH SÁCH {frames.Count} KHUNG ẢNH TRONG SUPABASE BACKEND =====");
        var jsonOpts = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        foreach (var f in frames)
        {
            var parsed = System.Text.Json.JsonSerializer.Deserialize<List<VietQrKiosk.Server.Models.HoleRectDto>>(f.HolesJson, jsonOpts);
            _output.WriteLine($"• ID: {f.Id} | Tên: {f.Name} | Parsed Holes Count: {parsed?.Count}");
            _output.WriteLine($"  Holes JSON: {f.HolesJson}");
            _output.WriteLine($"  First hole: X={parsed?[0].X}, Y={parsed?[0].Y}, W={parsed?[0].W}, H={parsed?[0].H}");
        }

        Assert.True(frames.Count >= 1);
    }

    [Fact]
    public async Task CreateFrame_WithXmlFile_ParsesHolesAutomatically()
    {
        var dbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: "Test_Frames_" + Guid.NewGuid())
            .Options;

        using var db = new AppDbContext(dbOptions);
        await db.PhotoLayouts.AddAsync(new PhotoLayout
        {
            Id = "4x6",
            Name = "Khổ 4x6",
            Slug = "4x6",
            WidthPx = 2400,
            HeightPx = 3600,
            HoleCount = 4,
            IsActive = true
        });
        await db.SaveChangesAsync();

        var frameRepo = new PhotoFrameRepository(db);
        var layoutRepo = new PhotoLayoutRepository(db);

        // Mock Storage Service
        var mockStorage = new MockStorageService();
        var logger = new Microsoft.Extensions.Logging.Abstractions.NullLogger<VietQrKiosk.Server.Controllers.FramesController>();

        var controller = new VietQrKiosk.Server.Controllers.FramesController(frameRepo, layoutRepo, mockStorage, logger);

        // Create dummy PNG file
        var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        var pngStream = new MemoryStream(pngBytes);
        var formFile = new Microsoft.AspNetCore.Http.FormFile(pngStream, 0, pngBytes.Length, "file", "test_frame.png");

        // Create dummy template.xml file
        var xmlContent = @"<?xml version=""1.0"" encoding=""utf-8""?>
<Template Name=""Summer Fest"" Layout=""4x6"" Width=""2400"" Height=""3600"">
  <Elements>
    <Photo Name=""Photo 1"" Width=""1000"" Height=""800"" Top=""200"" Left=""150"" />
    <Photo Name=""Photo 2"" Width=""1000"" Height=""800"" Top=""1200"" Left=""150"" />
  </Elements>
</Template>";
        var xmlBytes = System.Text.Encoding.UTF8.GetBytes(xmlContent);
        var xmlStream = new MemoryStream(xmlBytes);
        var xmlFormFile = new Microsoft.AspNetCore.Http.FormFile(xmlStream, 0, xmlBytes.Length, "xmlFile", "template.xml");

        var result = await controller.Create(
            file: formFile,
            layoutId: "4x6",
            name: "Summer Fest",
            xmlFile: xmlFormFile);

        var created = Assert.IsType<Microsoft.AspNetCore.Mvc.CreatedAtActionResult>(result.Result);
        var dto = Assert.IsType<VietQrKiosk.Server.Models.PhotoFrameDto>(created.Value);

        Assert.Equal("Summer Fest", dto.Name);
        Assert.Equal(2, dto.Holes.Count);
        Assert.Equal(150, dto.Holes[0].X);
        Assert.Equal(200, dto.Holes[0].Y);
        Assert.Equal(1000, dto.Holes[0].W);
        Assert.Equal(800, dto.Holes[0].H);
    }

    private class MockStorageService : VietQrKiosk.Server.Services.Interfaces.IStorageService
    {
        public string ProviderName => "MockStorage";
        public Task<string> UploadFileAsync(Stream fileStream, string fileName, string contentType, string folder, CancellationToken ct = default)
            => Task.FromResult($"https://mock.cdn/frames/{fileName}");
        public Task<bool> DeleteFileAsync(string fileUrl, CancellationToken ct = default)
            => Task.FromResult(true);
        public Task<bool> FileExistsAsync(string fileUrl, CancellationToken ct = default)
            => Task.FromResult(true);
        public string GetPublicUrl(string relativePath)
            => $"https://mock.cdn/{relativePath}";
    }
}
