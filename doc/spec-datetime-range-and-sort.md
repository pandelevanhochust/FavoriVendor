# Specification: Date-Time Range Filter & Sort Direction (Android App & Backend)

## Problem Statement

Hiện tại trên app Android Kiosk, người quản lý chỉ xem được cố định 200 giao dịch mới nhất từ SQLite nội bộ theo thứ tự giảm dần mà không thể xem dữ liệu cũ hơn, không thể tra cứu giao dịch theo ca làm việc (ví dụ từ 07:00 sáng đến 15:30 chiều), và không thể đảo ngược chiều hiển thị để theo dõi dòng thời gian phát sinh giao dịch từ cũ đến mới. 

Về phía Backend .NET, các API (`/vendor/transactions` và `/vendor/orders`) mới chỉ hỗ trợ lọc theo ngày thuần túy (`yyyy-MM-dd`) và mặc định cố định sắp xếp giảm dần (`OrderByDescending`). Hệ thống chưa hỗ trợ tham số sắp xếp tăng dần/giảm dần (`asc`/`desc`) cũng như chưa hỗ trợ lọc chi tiết đến từng mốc giờ:phút:giây (`fromDateTime` -> `toDateTime`).

## Solution

1. **Trên Backend .NET 10**:
   - Mở rộng API `/vendor/transactions` và `/vendor/orders` tiếp nhận thêm tham số lọc thời gian chi tiết có kèm giờ phút: `fromDateTime`, `toDateTime` (hỗ trợ cả định dạng ISO 8601 `yyyy-MM-ddTHH:mm:ss` hoặc timestamp) kèm xử lý timezone (`tz`).
   - Bổ sung tham số truy vấn `sortOrder` (hoặc `order`): hỗ trợ hai giá trị `desc` (mặc định - mới nhất trước) và `asc` (cũ nhất trước).
   - Tầng Repository (`TransactionRepository`, `OrderRepository`) và In-Memory Repository cập nhật truy vấn LINQ/EF Core sắp xếp linh hoạt theo `sortOrder`.

2. **Trên App Android (Kiosk Client)**:
   - Trong màn hình Lịch sử giao dịch (`TransactionsActivity` / `activity_transactions.xml`), bổ sung thanh bộ lọc trên đầu danh sách:
     - Bộ chọn khoảng thời gian chi tiết (Date-Time Picker Dialog): Cho phép chọn **[Từ: Ngày - Giờ:Phút]** và **[Đến: Ngày - Giờ:Phút]**. Có các chip chọn nhanh (Ca sáng, Ca chiều, Hôm nay, Hôm qua, 7 ngày qua, Tùy chỉnh).
     - Nút icon mũi tên Up/Down (`btnSortOrder`) cạnh thanh tìm kiếm/lọc: Nhấn vào để đảo chiều sắp xếp giữa `Mới nhất trước` (Mũi tên chỉ xuống ⬇️ - Descending) và `Cũ nhất trước` (Mũi tên chỉ lên ⬆️ - Ascending).
   - Cập nhật cả tầng lưu trữ SQLite nội bộ (`KioskDbHelper`) để hỗ trợ truy vấn lọc theo mốc thời gian giờ-phút và sắp xếp `ASC`/`DESC` khi app hoạt động offline hoặc xem dữ liệu local.

---

## User Stories

1. As a store manager, I want to filter transactions by a specific start date and start time (e.g., 08:00 AM on Nov 1st), so that I can audit sales starting precisely from my morning shift.
2. As a store manager, I want to filter transactions up to a specific end date and end time (e.g., 04:30 PM on Nov 1st), so that I do not include sales from the next employee's shift.
3. As a kiosk administrator, I want to filter transactions across multiple days with exact timestamps (e.g., from 22:00 Friday to 06:00 Saturday), so that I can review overnight kiosk activity.
4. As a store operator, I want to tap a sort button with an up/down arrow icon, so that I can immediately toggle between oldest-first and newest-first view without opening a complex menu.
5. As an operator, I want the sort icon to visually indicate the current order (arrow pointing up for Ascending, arrow pointing down for Descending), so that I instantly know how the list is ordered.
6. As a kiosk user reviewing history offline, I want the local SQLite database to execute date-time range queries, so that filter operations remain instantaneous even without an internet connection.
7. As an API client (Android or Web Dashboard), I want to pass `fromDateTime`, `toDateTime`, and `sortOrder=asc` to `GET /vendor/transactions`, so that I receive an ordered batch matching my audit window.
8. As an API client, I want `GET /vendor/orders` to support the same date-time range and sort direction, so that orders and bank transactions can be reconciled with identical criteria.
9. As a developer, I want the backend date-time parser to default gracefully when seconds or timezones are omitted, so that minor formatting differences do not trigger HTTP 400 Bad Request.
10. As a store owner, I want the summary totals (total orders, total revenue, cash vs bank breakdown) on Android to update dynamically according to the selected date-time range, so that I can see the exact shift revenue.

---

## Implementation Decisions

### 1. Backend Modules & API Contracts (.NET 10)

- **API Endpoint Updates**:
  - `GET /vendor/transactions`:
    - `fromDateTime` (string, optional): ISO string ví dụ `2026-11-01T08:00:00`.
    - `toDateTime` (string, optional): ISO string ví dụ `2026-11-01T17:30:00`.
    - `sortOrder` (string, optional): `asc` hoặc `desc` (mặc định: `desc`).
    - Giữ tương thích ngược với các param cũ: `date`, `fromDate`, `toDate`.
  - `GET /vendor/orders`:
    - Thêm tương tự: `fromDateTime`, `toDateTime`, `sortOrder`.

- **Timezone & Date Parsing Decision**:
  - Module `Helpers.ParseDateFilter` được nâng cấp thành `Helpers.ParseDateTimeFilter` hỗ trợ parse cả Date-only (`yyyy-MM-dd`) và Date-Time (`yyyy-MM-ddTHH:mm:ss` hoặc `yyyy-MM-dd HH:mm`).
  - Toàn bộ thời gian được chuẩn hóa về UTC trước khi chuyển cho Repository truy vấn PostgreSQL để tránh lệch múi giờ.

- **Repository & EF Core Query Decision**:
  - Phương thức `GetTransactionsFilteredAsync` và `GetOrdersFilteredAsync` nhận thêm tham số `string sortOrder = "desc"`.
  - Câu truy vấn áp dụng điều kiện:
    - Nếu `sortOrder.Equals("asc", StringComparison.OrdinalIgnoreCase)`: dùng `query.OrderBy(t => t.ReceivedAt)`
    - Ngược lại: dùng `query.OrderByDescending(t => t.ReceivedAt)`

---

### 2. Android App Client Modules (Java / Material UI)

- **UI Layout Updates (`activity_transactions.xml`)**:
  - Thêm một `LinearLayout` (Filter & Sort Bar) ngay dưới Thẻ Thống Kê và trên `RecyclerView`:
    - **Nút/Thẻ Date-Time Range**: Hiển thị text tóm tắt khoảng thời gian đang chọn (ví dụ: `01/11 08:00 → 01/11 17:30`). Nhấp vào sẽ mở Dialog chọn ngày và giờ (`DatePickerDialog` kết hợp `TimePickerDialog`).
    - **Nút Sort Toggle (`MaterialButton` hoặc `ImageButton`)**: Biểu tượng mũi tên đảo chiều (`ic_sort_asc_desc`).
      - Khi `DESC`: Icon mũi tên hướng xuống (Mới nhất trước).
      - Khi `ASC`: Icon mũi tên hướng lên (Cũ nhất trước).
    - **Nút Clear / Reset Filter**: Khôi phục về mặc định (Tất cả / Mới nhất).

- **SQLite Database Helper (`KioskDbHelper.java`)**:
  - Bổ sung phương thức:
    ```
    getFilteredTransactions(long fromMillis, long toMillis, String type, boolean isAsc, int limit)
    ```
  - Xây dựng câu truy vấn SQL động:
    - Điều kiện `WHERE created_at >= ? AND created_at <= ?` (kèm lọc `type` nếu có).
    - Mệnh đề `ORDER BY created_at ASC` hoặc `ORDER BY created_at DESC`.

- **Sync & Retrofit Contract (`KioskApiService.java`)**:
  - Mở rộng interface `getTransactions` với `@Query("fromDateTime")`, `@Query("toDateTime")`, `@Query("sortOrder")`.

---

## Testing Decisions

1. **Backend Automated Unit Tests (`tests/VietQrKiosk.Tests/FilterTests.cs`)**:
   - Test ca sắp xếp: Tạo 3 giao dịch tại các mốc thời gian $T_1 < T_2 < T_3$. Truy vấn với `sortOrder=asc` phải trả về thứ tự $[T_1, T_2, T_3]$; với `sortOrder=desc` phải trả về $[T_3, T_2, T_1]$.
   - Test ca lọc khoảng thời gian: Truy vấn với `fromDateTime = T_1 + 30m` và `toDateTime = T_3 - 30m`, chỉ bản ghi $T_2$ được trả về.
   - Test tương thích ngược: Bỏ trống `fromDateTime`/`toDateTime`/`sortOrder` phải trả về kết quả tương thích với phiên bản trước.

2. **Android Local Database Tests & UI Verification**:
   - Kiểm tra `KioskDbHelper` chèn dữ liệu mẫu ở các mốc giờ khác nhau trong ngày và truy vấn theo mốc giờ:phút.
   - Kiểm tra tương tác UI: Bấm nút Sort đảo chiều danh sách mượt mà không bị giật/crash; chọn khoảng thời gian cập nhật lại đúng số đơn và tổng doanh thu tương ứng.

---

## Out of Scope

- Không can thiệp vào quy trình thanh toán Kiosk (`layout_page1` đến `layout_page5`).
- Không thay đổi bảng biểu hoặc cơ chế webhook của VietQR.
- Không thay đổi phân quyền / bảo mật API key giữa Kiosk và Server.

---

## Further Notes

- Thời gian trên máy Kiosk Android được lấy theo giờ hệ thống (Zone ID địa phương VN +07:00). Khi gửi lên backend cần kèm múi giờ hoặc chuyển đổi thành chuẩn ISO 8601 rõ ràng để đồng bộ dữ liệu chính xác.
