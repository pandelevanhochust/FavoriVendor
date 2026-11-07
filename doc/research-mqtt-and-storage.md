# Nghiên cứu Kiến trúc: Tích hợp MQTT cho Kiosk & Lựa chọn Hạ tầng Lưu trữ Ảnh (MinIO vs Google Drive vs Local Storage)

## 1. Nghiên cứu 1: Kiosk có nên nhận thông tin Frame & Layout qua MQTT không?

### 1.1. Bản chất dữ liệu của Frame & Layout
- **Đặc tính**: Dữ liệu danh mục tĩnh hoặc bán tĩnh (Catalog Data). Tần suất thay đổi rất thấp (thường là tuần/tháng một lần khi cửa hàng cập nhật bộ sưu tập theo mùa như Halloween, Giáng Sinh, hoặc điều chỉnh giá).
- **Kích thước**:
  - Thông tin cấu hình (Metadata): Rất nhẹ (vài KB JSON gồm tên, slug, giá, tọa độ holes).
  - Tệp ảnh khung viền (PNG Asset): Rất nặng (từ 1MB đến 8MB cho ảnh chất lượng cao 300 DPI để in ấn sắc nét).

### 1.2. Phân tích giao thức MQTT (Message Queuing Telemetry Transport)
- **Điểm mạnh của MQTT**: Sinh ra cho thiết bị IoT với băng thông hẹp, gửi các bản tin telemetry nhỏ (vài chục byte đến vài KB), độ trễ thấp, kết nối 2 chiều liên tục (Persistent TCP Connection qua QoS 0/1/2).
- **Nguy cơ khi gửi ảnh qua MQTT (Anti-pattern)**:
  - Nếu gửi tệp nhị phân (Binary Base64) nặng vài MB qua MQTT topic, Broker (Mosquitto/EMQX) sẽ bị quá tải bộ nhớ đệm (socket buffer bloat), nghẽn hàng đợi (packet queue) và dễ làm ngắt kết nối các máy Kiosk khác đang kết nối vào cùng broker.
  - MQTT không có cơ chế Resume download (tải tiếp khi rớt mạng), không có CDN edge caching, không có HTTP ETag cache.

### 1.3. Đánh giá các phương án triển khai

| Tiêu chí | Phương án A: Thuần HTTP REST API (Khuyên dùng ban đầu) | Phương án B: Hybrid (MQTT Báo hiệu + HTTP Tải ảnh) | Phương án C: Bắn toàn bộ qua MQTT |
| :--- | :--- | :--- | :--- |
| **Cách hoạt động** | Kiosk tự động gọi API `GET /vendor/layouts` & `/vendor/frames` khi khởi động app hoặc định kỳ kiểm tra. | CMS bắn tin nhắn nhẹ: `{"event": "SYNC_FRAMES"}` qua MQTT. Kiosk nhận tin và gọi HTTP tải ảnh. | Bắn toàn bộ file ảnh qua MQTT payload. |
| **Độ trễ cập nhật** | Cập nhật khi app mở hoặc theo chu kỳ 30-60 phút. | **Ngay lập tức (< 1 giây)** khi Admin vừa bấm lưu trên CMS. | Ngay lập tức nhưng tải chậm chạp, dễ lag. |
| **Độ phức tạp hạ tầng** | **Rất thấp (0 Broker)**, chỉ dùng API hiện có. | Trung bình: Cần 1 MQTT Broker (Mosquitto/EMQX). | Rất cao, dễ crash Broker. |
| **Độ ổn định** | 99.99% (HTTP Stateless, đứt mạng tự retry). | Cao (Kết nối socket giữ liên tục). | Kém (Nguy cơ nghẽn mạng). |

### 1.4. Kết luận & Đề xuất cho Kiosk:
1. **Ở giai đoạn hiện tại (1 - 5 máy Kiosk)**: **CHƯA CẦN DÙNG MQTT**.
   - Kiosk chỉ cần gọi API HTTP `GET /vendor/layouts` và `GET /vendor/frames` tại 2 thời điểm:
     - Khi vừa mở ứng dụng Kiosk (App Launch).
     - Trong menu Quản trị ẩn (Diagnostics) có thêm nút **"Đồng bộ Khung ảnh ngay"** để nhân viên bấm cập nhật tức thời khi vừa thêm khung mới trên Web.
   - Cách này **ổn định 100%, không tốn tài nguyên server, không cần cài thêm MQTT broker**.
2. **Khi mở rộng chuỗi lớn (Hàng chục Kiosk cần sync tức thời từ xa)**: Áp dụng **Mô hình Hybrid (Phương án B)**:
   - MQTT **chỉ truyền tín hiệu thông báo** (Signal Event) dung lượng vài byte: `topic: kiosk/{code}/events -> {"type": "REFRESH_FRAMES"}`.
   - Quá trình tải file ảnh PNG vẫn được thực hiện qua **HTTP GET** để đảm bảo tốc độ và có cache.

---

## 2. Nghiên cứu 2: Lựa chọn Lưu trữ Ảnh (Local Disk vs MinIO vs Google Drive API)

Hệ thống Photobooth xử lý 2 luồng ảnh khác nhau:
1. **Ảnh Khung (Frames)**: Tần suất đọc liên tục, cần tốc độ hiển thị cực nhanh.
2. **Ảnh Phiên Chụp của Khách (Customer Photos & Videos)**: Kiosk upload lên sau mỗi lượt chụp, khách hàng quét QR tải về điện thoại qua trang Landing Page `/s/:shareToken`.

### 2.1. So sánh chi tiết 3 giải pháp lưu trữ

#### A. Google Drive API
- **Bản chất**: Dịch vụ lưu trữ tệp cá nhân/doanh nghiệp hướng văn phòng, không phải CDN hay Object Storage cho ứng dụng web.
- **Tại sao TUYỆT ĐỐI KHÔNG NÊN DÙNG cho hệ thống này?**
  1. **Giới hạn tần suất gắt gao (Rate Limiting & Quota Exceeded)**: Google Drive API có hạn mức request/phút rất thấp. Khi vào giờ cao điểm, hàng chục khách cùng quét QR tải ảnh cùng lúc, Google Drive sẽ lập tức trả về lỗi `HTTP 403 User Rate Limit Exceeded` làm khách không tải được ảnh.
  2. **Bảo trì Token phức tạp**: OAuth2 Refresh Token của Google Drive thường xuyên bị hết hạn hoặc bị thu hồi nếu không duy trì cấu hình Google Cloud App đã verify.
  3. **Tốc độ tải chậm (Không hỗ trợ CDN)**: Khách hàng quét mã QR trên điện thoại phải chờ redirect nhiều lần qua link `drive.google.com/uc?...`, trải nghiệm rất giật lag.
  4. **Vi phạm điều khoản dịch vụ (TOS)**: Google cấm dùng Drive làm backend lưu trữ phục vụ truy cập công cộng cho ứng dụng thương mại.

#### B. MinIO (Self-hosted S3 Object Storage)
- **Bản chất**: Phần mềm mã nguồn mở chuẩn S3 chạy bằng Docker container, biến ổ cứng server thành một dịch vụ S3 chuyên nghiệp.
- **Ưu điểm**:
  - Chuẩn kết nối AWS S3 SDK (trong C# .NET có package `AWSSDK.S3` hoặc `Minio` SDK chính thức).
  - Tốc độ siêu nhanh vì chạy trực tiếp trên cùng hạ tầng máy chủ hoặc mạng nội bộ.
  - Hỗ trợ **Pre-signed URL**: Kiosk có thể xin 1 URL upload tạm thời có thời hạn rồi đẩy thẳng file ảnh lên MinIO mà không cần trung chuyển qua Backend API, giúp giảm tải 100% CPU cho backend.
- **Nhược điểm**:
  - Cần thêm 1 container MinIO chạy nền (tốn thêm khoảng 150MB - 250MB RAM của VPS).

#### C. Local Disk Volume (Giải pháp Hiện tại)
- **Bản chất**: Lưu file trực tiếp vào thư mục `server/data/uploads/` trên máy chủ, mount qua Docker volume `server_data`.
- **Ưu điểm**:
  - Đơn giản nhất, hiệu năng cao nhất (Zero Network Overhead), không tốn thêm RAM cài dịch vụ ngoài.
  - Phục vụ file cực nhanh qua Nginx hoặc middleware ASP.NET Core `UseStaticFiles`.
  - Miễn phí 100% trong hạn mức 200GB ổ cứng của Oracle Cloud Always Free (200GB có thể chứa hơn 40.000 lượt chụp ảnh).

#### D. Lựa chọn Thay thế Đỉnh cao: Cloudflare R2
- Nếu muốn dùng S3 Object Storage nhưng không muốn tốn RAM cài MinIO trên VPS: **Cloudflare R2** là lựa chọn số 1 thế giới hiện nay:
  - Tương thích 100% chuẩn S3 API.
  - **Miễn phí 10 GB lưu trữ** mỗi tháng.
  - **MIỄN PHÍ 100% BĂNG THÔNG TẢI VỀ (0 Egress Fee)** — khách hàng quét QR tải ảnh bao nhiêu GB cũng không mất 1 đồng.
  - Có sẵn mạng lưới CDN toàn cầu của Cloudflare tải ảnh trong 0.2 giây.

---

## 3. Bảng Tổng Kết Lựa Chọn Kiến Trúc

| Hạng mục | Khuyến nghị Lựa chọn | Lý do then chốt |
| :--- | :--- | :--- |
| **Đồng bộ Frame/Layout Kiosk** | **HTTP REST API** (Startup + Nút Sync trong Diagnostics). Bổ sung tín hiệu **MQTT Event** khi quy mô > 10 kiosk. | Đơn giản, tin cậy, không làm nghẽn hạ tầng khi truyền file nặng. |
| **Lưu trữ Ảnh Khung (Frames)** | **Local Disk Volume** (`server/data/uploads/frames/`) | File tĩnh cố định, truy xuất nội bộ tức thời, bền vững qua Docker volume. |
| **Lưu trữ Ảnh Khách Hàng (Sessions)** | **Local Disk (giai đoạn 1)** kèm Cron xóa ảnh sau 15-30 ngày. Nâng cấp lên **Cloudflare R2 (giai đoạn 2)**. | An toàn, không lo đầy ổ cứng, tránh hoàn toàn rủi ro sập Quota của Google Drive. |
| **Google Drive API** | **LOẠI BỎ (KHÔNG NÊN DÙNG)** | Rate limit nghiêm ngặt, rủi ro lỗi 403 giờ cao điểm, tải chậm, token dễ chết. |
