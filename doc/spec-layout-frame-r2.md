# Specification: Quản Lý Layout & Frame, Lưu Trữ Đa Tầng (Local / Cloudflare R2), Docker Deployment

## Problem Statement

Hệ thống Kiosk Photobooth hiện tại cần chuyển đổi từ một công cụ thanh toán đơn lẻ thành một nền tảng quản lý chụp ảnh và in ấn toàn diện:
1. **Thiếu quản lý danh mục Layout & Khung ảnh**: Chưa có cơ sở dữ liệu và API để quản lý các khổ ảnh in (`1x4`, `2x2`, `2x3`), các mốc giá in (`pricing_tiers`), các file khung ảnh PNG và tọa độ các lỗ khoét ảnh (`holes_metadata`).
2. **Thiếu giải pháp lưu trữ mở rộng (Scalable Storage)**: Việc chỉ lưu file trên máy chủ VPS có thể gây đầy ổ cứng và không tối ưu khi mở rộng chuỗi cửa hàng. Hệ thống cần tích hợp chuẩn **Cloudflare R2 Object Storage (S3-compatible)** với cơ chế linh hoạt chuyển đổi giữa **Local Disk** (cho dev/local) và **Cloudflare R2** (cho production cloud) qua cấu hình biến môi trường.
3. **Thiếu tự động hóa triển khai Docker**: Cần bổ sung Dockerfile cho `fe-cms`, cập nhật `docker-compose.yml` (local) và `docker-compose.prod.yml` (Oracle Cloud / Production) để triển khai đồng bộ tất cả thành phần: PostgreSQL + Backend .NET + Frontend CMS (`fe-cms`).

## Solution

1. **Backend .NET 10 (Clean Architecture)**:
   - **Tầng Thực Thể (Entities)**: `PhotoLayout`, `PhotoCategory`, `PhotoFrame`.
   - **Tầng Lưu Trữ Trừu Tượng (`IStorageService`)**:
     - `LocalStorageService`: Lưu file tại `server/data/uploads/frames/`, phục vụ qua route `/uploads/` của ASP.NET Core.
     - `CloudflareR2StorageService`: Tích hợp thư viện `AWSSDK.S3` kết nối trực tiếp với Cloudflare R2 Bucket, hỗ trợ upload file và sinh Pre-signed URL.
     - Lựa chọn động qua cấu hình `Storage:Provider` (`Local` hoặc `CloudflareR2`).
   - **REST API Endpoints**:
     - `/vendor/layouts`: CRUD khổ ảnh & mốc giá.
     - `/vendor/frames`: Upload file ảnh PNG, lưu tọa độ holes, xóa file vật lý/R2.
     - `/vendor/categories`: CRUD danh mục khung.
   - **Khởi tạo dữ liệu tự động (`DbInitializer`)**: Tự động seed sẵn 3 Layout mẫu (`1x4`, `2x2`, `2x3`) và 2 danh mục khung mẫu khi chạy ứng dụng.

2. **Frontend CMS (`fe-cms` Next.js 14 + Ant Design 5)**:
   - Thêm `src/api/photoLayoutApi.ts` kết nối trực tiếp vào các API mới của Backend.
   - Hoàn thiện trang `/layouts`: Quản lý danh sách layout, modal thêm/sửa mốc giá in theo số lượng ảnh (`pricing_tiers`).
   - Hoàn thiện trang `/frames`: Tải lên file PNG khung trong suốt thật, giao diện xem và tinh chỉnh thông số tọa độ Holes `{x, y, w, h}`.

3. **Cấu Hình Môi Trường & Docker (Local & Prod Cloud)**:
   - `server/appsettings.json` & `server/appsettings.Development.json`: Thêm khối cấu hình `Storage` (Provider, Local, R2).
   - `.env.example`: Bổ sung biến môi trường `Storage__Provider`, `Storage__R2__*`.
   - `fe-cms/Dockerfile`: Multi-stage build cho Next.js 14 CMS.
   - `docker-compose.yml` (Local) & `docker-compose.prod.yml` (Prod): Khởi chạy đồng bộ Postgres, Backend .NET, và `fe-cms` trên port `3002`.

---

## User Stories

1. As a store owner, I want to create and update photo layouts with multiple pricing tiers from the CMS, so that kiosk customers can select 2, 4, or 6 prints with dynamic pricing.
2. As a designer, I want to upload a transparent PNG frame with predefined hole coordinates, so that kiosk camera pictures are seamlessly framed.
3. As a DevOps engineer, I want the backend to switch between Local Disk storage and Cloudflare R2 via environment variables, so that local development requires zero external cloud setup while production leverages Cloudflare R2's zero-egress CDN.
4. As a kiosk application, I want to fetch active layouts and frames via fast HTTP APIs, so that local kiosk storage caches the assets for instantaneous offline performance.
5. As an administrator, I want to run `docker compose up -d` on my local machine or Oracle Cloud instance, so that the entire system (Database, Backend API, Web CMS) spins up ready for production.

---

## Implementation Decisions

### 1. Storage Provider Architecture (C# .NET)

- Sử dụng Interface `IStorageService`:
  ```csharp
  public interface IStorageService
  {
      Task<string> SaveFileAsync(Stream fileStream, string fileName, string folder, string contentType, CancellationToken ct = default);
      Task DeleteFileAsync(string fileUrl, CancellationToken ct = default);
      string GetPublicUrl(string relativeOrStoragePath);
  }
  ```
- **Local Provider**: Ghi file vào thư mục `server/data/uploads/{folder}/{guid}.png` và trả về URL tương đối `/uploads/{folder}/{guid}.png`.
- **Cloudflare R2 Provider**:
  - Dùng `AmazonS3Client` với cấu hình:
    ```csharp
    new AmazonS3Config
    {
        ServiceURL = $"https://{cfg.AccountId}.r2.cloudflarestorage.com",
        AuthenticationRegion = "auto"
    }
    ```
  - Đẩy file trực tiếp vào Bucket với quyền đọc công khai qua Cloudflare Custom Domain / Public R2 URL.

### 2. Database Schema (PostgreSQL & EF Core)

- `photo_layouts`: `id` (serial), `name`, `slug` (unique), `layout_mode`, `price` (bigint), `pricing_tiers_json` (text), `max_photos`, `capture_count`, `is_split`, `use_holes_auto_capture`, `is_active`, `created_at`, `updated_at`.
- `photo_categories`: `id` (serial), `name` (unique), `created_at`.
- `photo_frames`: `id` (serial), `layout_id` (fk), `category_id` (fk nullable), `name`, `filename`, `image_path`, `width`, `height`, `holes_count`, `holes_metadata_json`, `is_active`, `created_at`, `updated_at`.

### 3. Docker Strategy

- `fe-cms/Dockerfile`: Multi-stage build (deps -> builder -> runner) dùng Node 20 alpine, phục vụ cổng `3002`.
- `docker-compose.prod.yml`:
  - `postgres`: Port 5432.
  - `server`: Port 8080, volume `server_data:/app/data`.
  - `fe-cms`: Port 3002.
  - Chuyển tiếp các biến môi trường Storage/R2.

---

## Testing Decisions

1. **Unit Tests (`VietQrKiosk.Tests`)**:
   - `StorageServiceTests`: Kiểm tra ghi/xóa file trên `LocalStorageService`.
   - `LayoutServiceTests`: Kiểm tra tính hợp lệ của mốc giá `pricing_tiers` và CRUD layout.
2. **Docker Build Verification**:
   - Chạy `docker compose config` kiểm tra cú pháp yaml.
   - Build thử `fe-cms/Dockerfile` và `server/Dockerfile`.
3. **End-to-End API Verification**:
   - Tạo Layout -> Upload file PNG -> Lấy danh sách kiểm tra URL ảnh truy cập được -> Xóa Layout & Frame.
