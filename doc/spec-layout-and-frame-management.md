# Specification: Quản Lý Khung Ảnh (Frames) & Khổ Ảnh (Layouts) Cho Hệ Thống Photobooth

## Problem Statement

Hệ thống hiện tại chỉ mới đóng vai trò là cổng thanh toán đơn hàng (Kiosk payment engine), chưa có chức năng quản lý các định dạng ảnh in (Layouts) và mẫu khung ảnh (Frames) được sử dụng tại máy Kiosk:
1. Quản trị viên không thể tạo hoặc tùy biến các khổ ảnh chụp phổ biến trong ngành Photobooth như dải ảnh đôi 2 Cut Strips (`1x4`), ảnh vuông (`2x2`), ảnh 6 tấm (`2x3`), hay cấu hình mốc giá in ấn lũy tiến theo số lượng ảnh (`pricing_tiers`).
2. Quản trị viên không thể tải lên các mẫu viền khung (Frame PNG trong suốt) và không có cách nào định vị tọa độ các lỗ khoét ảnh (**Holes Metadata `{x, y, w, h}`**) để phần mềm Kiosk tự động ghép các tấm ảnh chụp vào đúng vị trí của khung.
3. Toàn bộ thông tin Layout và Frame trên `fe-cms` hiện mới chỉ là dữ liệu tĩnh (Mock Data), chưa được lưu trữ vào cơ sở dữ liệu PostgreSQL và chưa có API đồng bộ xuống các máy Kiosk.

## Solution

1. **Phía Backend .NET 10 (`server/`)**:
   - Bổ sung cấu trúc dữ liệu và bảng PostgreSQL: `photo_layouts`, `photo_categories`, `photo_frames` với hỗ trợ lưu trữ JSON cho `pricing_tiers` và `holes_metadata`.
   - Cung cấp dịch vụ lưu trữ file tĩnh (`StaticFileMiddleware` tại `/uploads/frames/`) để lưu trữ an toàn các file ảnh khung PNG viền trong suốt tải lên từ Web CMS.
   - Xây dựng hệ thống REST API hoàn chỉnh:
     - Nhóm API Layout (`/vendor/layouts`): Hỗ trợ CRUD, quản lý số ảnh in (`max_photos`), số ảnh chụp (`capture_count`), tùy chọn cắt đôi (`is_split`), và các mốc giá (`pricing_tiers`).
     - Nhóm API Frame (`/vendor/frames`): Hỗ trợ upload file ảnh PNG (Multipart Form-Data), tự động tính toán kích thước ảnh, lưu trữ tọa độ các lỗ ảnh (`holes_metadata`).
     - Nhóm API Category (`/vendor/categories`): Phân loại khung theo chủ đề (Cute, Y2K, Vintage, Holiday...).
   - Đảm bảo tương thích với cả PostgreSQL Supabase và In-Memory Fallback.

2. **Phía Frontend Web CMS (`fe-cms/`)**:
   - Nâng cấp trang **Quản Lý Layout (`/layouts`)**: Kết nối trực tiếp vào API thật, hỗ trợ thêm/sửa/xóa layout, bảng cấu hình mốc giá linh hoạt theo số ảnh in.
   - Nâng cấp trang **Kho Khung Ảnh (`/frames`)**:
     - Tải lên file PNG khung trong suốt thật tới server.
     - Bộ công cụ **Visual Holes Inspector/Editor**: Hiển thị ảnh khung cùng các ô chữ nhật trực quan đại diện cho các lỗ ảnh `{x, y, w, h}`, cho phép nhập/chỉnh tọa độ pixel chính xác.
     - Lọc khung theo Layout và theo Danh mục chủ đề.

---

## User Stories

1. As a studio owner, I want to create a new layout with custom photo count and pricing tiers (e.g., 2 prints for 50,000 VND, 4 prints for 90,000 VND), so that I can upsell multiple print copies at the kiosk.
2. As a studio owner, I want to toggle a layout between active and inactive, so that deprecated or seasonal layouts are immediately hidden from kiosk customers without deleting them.
3. As a designer, I want to upload a transparent PNG frame designed in Photoshop/Canva to the CMS, so that customers can select it during their photo session.
4. As an operator, I want to define the exact coordinates (`x, y, width, height`) for each photo hole in a frame, so that the kiosk camera feed and final composite photo perfectly align within the frame cutouts.
5. As a kiosk application, I want to query `GET /vendor/layouts` and `GET /vendor/frames?layoutId={id}`, so that I can render the layout selection screen and download active frame assets directly to the local kiosk disk.
6. As a studio manager, I want to organize frames by categories (e.g., "Giáng Sinh", "Y2K Aesthetic", "Tối Giản"), so that customers at the kiosk can filter and find their desired style quickly.
7. As an administrator, I want uploaded frame files to be served via a fast, reliable URL (e.g., `/uploads/frames/{filename}`), so that both the web CMS preview and kiosk downloads operate with high performance.

---

## Implementation Decisions

### 1. Database Schema & Data Models (.NET 10 & PostgreSQL)

- **Table `photo_layouts`**:
  - `id` (int, Primary Key, Identity)
  - `name` (varchar 100, Not Null) - Ví dụ: "Layout 2 Cut Strips"
  - `slug` (varchar 50, Not Null, Unique) - Ví dụ: "1x4", "2x2"
  - `layout_mode` (varchar 50, Not Null) - Mã mode phục vụ app kiosk
  - `price` (bigint, Not Null) - Giá bán gốc (VND)
  - `pricing_tiers_json` (text, Nullable) - Lưu mảng JSON `[{"quantity": 2, "price": 50000}, ...]`
  - `max_photos` (int, Not Null) - Số lượng ảnh in trên layout
  - `capture_count` (int, Not Null) - Số lần chụp camera
  - `is_split` (bool, Not Null, Default false) - Cắt đôi tấm in hay không
  - `use_holes_auto_capture` (bool, Not Null, Default true)
  - `is_active` (bool, Not Null, Default true)
  - `created_at`, `updated_at` (timestamptz)

- **Table `photo_categories`**:
  - `id` (int, Primary Key, Identity)
  - `name` (varchar 100, Not Null, Unique)
  - `created_at` (timestamptz)

- **Table `photo_frames`**:
  - `id` (int, Primary Key, Identity)
  - `layout_id` (int, Foreign Key references `photo_layouts.id` ON DELETE CASCADE)
  - `category_id` (int, Nullable, Foreign Key references `photo_categories.id` ON DELETE SET NULL)
  - `name` (varchar 100, Not Null)
  - `filename` (varchar 255, Not Null)
  - `image_path` (varchar 500, Not Null) - Đường dẫn tĩnh phục vụ file
  - `width` (int, Not Null, Default 1200) - Độ phân giải chiều rộng khung
  - `height` (int, Not Null, Default 1800) - Độ phân giải chiều cao khung
  - `holes_count` (int, Not Null, Default 1)
  - `holes_metadata_json` (text, Nullable) - Lưu mảng JSON `[{"x": 56, "y": 66, "w": 769, "h": 560}, ...]`
  - `is_active` (bool, Not Null, Default true)
  - `created_at`, `updated_at` (timestamptz)

### 2. REST API Specifications

- **Layouts API**:
  - `GET /vendor/layouts`: Trả về danh sách layout kèm số lượng frame đang hoạt động (`frame_count`).
  - `GET /vendor/layouts/{id}`: Chi tiết 1 layout.
  - `POST /vendor/layouts`: Tạo mới layout (xác thực dữ liệu mốc giá hợp lệ).
  - `PUT /vendor/layouts/{id}`: Cập nhật thông tin layout.
  - `DELETE /vendor/layouts/{id}`: Xóa layout (kèm ràng buộc xóa các frame liên quan).

- **Frames API**:
  - `GET /vendor/frames`: Hỗ trợ query `?layoutId={id}&categoryId={id}&activeOnly=true`.
  - `POST /vendor/frames`: Nhận `multipart/form-data`:
    - `file`: File ảnh PNG trong suốt.
    - `name`, `layoutId`, `categoryId`, `holesMetadataJson`.
  - `PUT /vendor/frames/{id}`: Cập nhật tên, danh mục, trạng thái, hoặc tọa độ Holes.
  - `DELETE /vendor/frames/{id}`: Xóa bản ghi và xóa file vật lý tương ứng trên đĩa.

- **Categories API**:
  - `GET /vendor/categories`, `POST /vendor/categories`, `DELETE /vendor/categories/{id}`.

### 3. File Storage & Static File Hosting

- Lưu trữ file tải lên vào thư mục: `server/data/uploads/frames/`.
- Cấu hình ASP.NET Core `UseStaticFiles` trỏ tới thư mục `data/uploads/` với route `/uploads/`.
- Hạn chế kích thước file tối đa 20MB, chỉ chấp nhận định dạng ảnh hợp lệ (`.png`, `.jpg`, `.webp`).

---

## Testing Decisions

1. **Backend Automated Unit Tests (`tests/VietQrKiosk.Tests/`)**:
   - `LayoutServiceTests.cs`: Kiểm thử tạo layout, tính toán mốc giá (`pricing_tiers`), kiểm tra logic xác thực mốc giá (số lượng phải tăng dần, giá phải hợp lệ).
   - `FrameServiceTests.cs`: Kiểm thử lưu trữ tọa độ Holes metadata, kiểm tra ràng buộc khóa ngoại với Layout.
2. **End-to-End API Tests**:
   - Gọi API tạo Category -> Tạo Layout -> Upload file Frame PNG -> Query lại danh sách kiểm tra `holes_metadata` và đường dẫn file ảnh truy cập được qua HTTP GET trả về 200 OK.
3. **Frontend UI Verification**:
   - Thao tác thêm/sửa Layout và cập nhật mốc giá trên giao diện `/layouts`.
   - Upload file PNG thật trên giao diện `/frames` và kiểm tra preview tọa độ holes.

---

## Out of Scope

- Trình vẽ trực tiếp trên canvas (Drawing canvas editor) phức tạp: Chỉ cần công cụ trực quan xem và chỉnh sửa thông số tọa độ `{x, y, w, h}`.
- Không can thiệp vào logic xác nhận thanh toán VietQR hiện có.
