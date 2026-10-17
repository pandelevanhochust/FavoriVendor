# Máy thanh toán tự động bằng VietQR (Tingo Pay)

Khách chọn số tiền trên máy → máy hiện mã QR → khách chuyển khoản → **máy tự xác nhận trong vài giây**,
không cần nhân viên kiểm tra bằng mắt.

```
┌──────────────────┐  1. POST /kiosk/orders      ┌─────────────────────┐  Generate QR  ┌─────────┐
│  App Android     │ ──────────────────────────► │  Server .NET (của   │ ────────────► │ VietQR  │
│  (máy tại quầy)  │ ◄── mã QR, orderId ──────── │  bạn, HTTPS public) │ ◄──────────── │         │
│                  │  2. GET /kiosk/orders/{id}  │                     │               │         │
│  hiện QR, chờ    │     ?wait=20 (long-poll)    │  - giữ mật khẩu     │  3. khách CK  │         │
│                  │ ◄── PAID ────────────────── │  - nhận callback    │ ◄──────────── │         │
│  → điều khiển    │                             │  - chống xử lý trùng│  Transaction  └─────────┘
│    máy           │                             │  - lưu SQLite       │  Sync (POST)
└──────────────────┘                             └─────────────────────┘
```

Vì sao cần server: VietQR báo "có tiền về" bằng cách **gọi vào một URL public của bạn** (API Transaction Sync).
Máy Android không có địa chỉ public cố định nên không nhận được. Server cũng giữ username/password VietQR,
nên mất máy không lộ tài khoản.

## Thư mục

| Thư mục | Nội dung |
|---|---|
| `server/` | C# .NET 10 Web API thiết kế Clean Architecture (Entity / Service / Controller / Infra) + PostgreSQL |
| `android/` | App Android (Java, View + ViewBinding), build bằng Android Studio |
| `tests/` | Bộ kiểm thử tự động xUnit cho Services, Discount, Idempotency & DB |

---

## 1. Chạy server

### Cấu hình

Server từ chối khởi động nếu thiếu cấu hình bí mật. Điền qua biến môi trường (xem `.env.example`)
hoặc `dotnet user-secrets` khi phát triển:

```bash
cd server
dotnet user-secrets init
dotnet user-secrets set "VietQr:Username"        "<VietQR cấp>"
dotnet user-secrets set "VietQr:Password"        "<VietQR cấp>"
dotnet user-secrets set "VietQr:BankAccount"     "<STK nhận tiền đã liên kết VietQR>"
dotnet user-secrets set "VietQr:AccountName"     "TEN CHU TAI KHOAN KHONG DAU"
dotnet user-secrets set "Callback:Username"      "<bạn tự đặt>"
dotnet user-secrets set "Callback:Password"      "<bạn tự đặt, mạnh>"
dotnet user-secrets set "Callback:JwtSecret"     "$(openssl rand -base64 48)"
dotnet user-secrets set "Kiosk:ApiKey"           "$(openssl rand -hex 24)"
dotnet run
```

Nhóm `VietQr:*` là thông tin **VietQR cấp cho bạn** (server gọi sang VietQR).
Nhóm `Callback:*` là thông tin **bạn tự đặt** rồi gửi cho VietQR (VietQR gọi ngược vào server của bạn).
Hai nhóm này khác nhau, đừng dùng chung.

### Triển khai

```bash
cp .env.example .env      # điền giá trị thật
# Khởi động PostgreSQL và Backend server bằng Docker Compose:
docker compose up -d --build
```

Container Backend chỉ lắng nghe `127.0.0.1:8080`, còn PostgreSQL mở cổng `5432` để dễ dàng kết nối kiểm tra dữ liệu local bằng DBeaver/pgAdmin hoặc chạy trực tiếp backend bằng `dotnet run`.
Kiểm tra sức khoẻ server & kết nối DB: `curl http://localhost:8080/healthz` → `{"ok":true,"database":"Connected",...}`.
Tài liệu tương tác API Scalar: truy cập `http://localhost:8080/scalar/v1` (hoặc `http://localhost:5000/scalar/v1` khi chạy `dotnet run`).
Lịch sử giao dịch lưu tự động trong PostgreSQL tại bảng `bank_transactions`. Có thể xem nhanh qua API: `GET /kiosk/transactions`.

---

## 2. Tính năng Mã Giảm Giá (Discount Codes)

Hệ thống hỗ trợ giảm giá theo % (`Percentage`) hoặc số tiền cố định (`FixedAmount`), có cấu hình đơn tối thiểu, số tiền giảm tối đa và giới hạn lượt sử dụng.

Khi khởi động, hệ thống tự động khởi tạo sẵn các mã mẫu:
- `GIAM10`: Giảm 10% tối đa 50,000 VND (đơn tối thiểu 10,000 VND)
- `GIAM20K`: Giảm trực tiếp 20,000 VND (đơn tối thiểu 50,000 VND)
- `VIP50`: Giảm 50% tối đa 100,000 VND (đơn tối thiểu 20,000 VND)

### API kiểm tra mã giảm giá trước khi thanh toán:
```bash
curl -s -X POST http://localhost:8080/kiosk/discounts/validate \
  -H "X-Api-Key: <Kiosk:ApiKey>" -H "Content-Type: application/json" \
  -d '{"code":"GIAM10","amount":50000}'
# → {"isValid":true,"message":"Mã giảm giá hợp lệ.","code":"GIAM10","originalAmount":50000,"discountAmount":5000,"finalAmount":45000}
```

### Tạo đơn hàng kèm mã giảm giá:
```bash
curl -s -X POST http://localhost:8080/kiosk/orders \
  -H "X-Api-Key: <Kiosk:ApiKey>" -H "Content-Type: application/json" \
  -d '{"amount":50000,"deviceId":"kiosk-01","discountCode":"GIAM10"}'
# → Server tính số tiền thực tế (finalAmount = 45000) và sinh mã VietQR với đúng 45,000 VND.
# Khi VietQR gửi callback xác nhận 45,000 VND, đơn đổi thành PAID và tăng lượt sử dụng mã.
```

---

## 2. Đăng ký với VietQR (Merchant Portal)

Điền theo mẫu VietQR yêu cầu:

| Trường | Giá trị |
|---|---|
| Tên Merchant | tên hệ thống của bạn |
| URL Kết Nối | `https://kiosk.example.com` |
| URL Path (Suffix) | `vietqr` (đúng bằng `Callback:BasePath`) |
| Username / Password | đúng `Callback:Username` / `Callback:Password` |

VietQR sẽ gọi:

- `POST https://kiosk.example.com/vietqr/api/token_generate` (Basic Auth) → server trả JWT 300 giây
- `POST https://kiosk.example.com/vietqr/bank/api/transaction-sync` (Bearer JWT) → server xử lý giao dịch

---

## 3. Test với sandbox VietQR (làm đúng 3 bước của tài liệu)

Môi trường Test: `https://dev.vietqr.org/` (đã là mặc định của `VietQr:BaseUrl`).

**Bước 1 — Tạo đơn qua server của bạn** (server tự lấy token và gọi Generate QR):

```bash
curl -s -X POST https://kiosk.example.com/kiosk/orders \
  -H "X-Api-Key: <Kiosk:ApiKey>" -H "Content-Type: application/json" \
  -d '{"amount":10000,"deviceId":"test"}'
# → {"orderId":"K7M2...","status":"PENDING","amount":10000,"qrCode":"0002...","content":"VQRxxxx",...}
```

Ghi lại `orderId`, `amount`, `content` (sandbox trả `content` dạng `VQRxxxx`).

**Bước 2 — Lấy token sandbox của VietQR rồi giả lập thanh toán** (API này chỉ có ở Test):

```bash
TOKEN=$(curl -s -X POST https://dev.vietqr.org/vqr/api/token_generate \
  -H "Authorization: Basic $(printf '%s' '<VietQr:Username>:<VietQr:Password>' | base64)" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -s -X POST https://dev.vietqr.org/vqr/bank/api/test/transaction-callback \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"bankAccount":"<STK>","content":"<content ở bước 1>","amount":10000,"bankCode":"MB","transType":"C"}'
```

Phải truyền **đúng** `content` và `amount` của đơn, nếu không VietQR không đối soát được.

**Bước 3 — Xem kết quả:**

```bash
curl -s "https://kiosk.example.com/kiosk/orders/<orderId>" -H "X-Api-Key: <Kiosk:ApiKey>"
# → "status":"PAID"
```

Log server sẽ có dòng `Transaction ...: order=... -> PAID`.

### Thử nhanh không cần VietQR (chỉ chế độ Development)

```bash
ASPNETCORE_ENVIRONMENT=Development dotnet run
curl -X POST https://localhost:5001/kiosk/dev/simulate-payment/<orderId> -H "X-Api-Key: <Kiosk:ApiKey>"
```

Endpoint này **không tồn tại** ở Production.

---

## 4. Cài app Android

1. Mở thư mục `android/` bằng Android Studio (JDK 17 hoặc 21 đều được; Gradle 8.9 + AGP 8.5.2).
2. Thêm vào `android/local.properties` (file này không bị commit):

   ```properties
   kiosk.serverUrl=https://kiosk.example.com/
   kiosk.apiKey=<đúng Kiosk:ApiKey>
   kiosk.deviceId=kiosk-01
   ```
3. Sync Gradle → chạy.
4. **Gắn phần cứng:** sửa `machine/LogMachineController.java` (hoặc viết lớp mới implement `MachineController`)
   rồi đổi dòng khởi tạo trong `MainActivity`. Hàm `onPaymentConfirmed(orderId, amount)` được gọi **đúng một lần**
   cho mỗi đơn đã được server xác nhận.

Chạy máy ở chế độ kiosk: bật *Screen pinning* (Cài đặt → Bảo mật) hoặc dùng Device Owner/Lock Task Mode;
màn hình đã được giữ sáng (`keepScreenOn`) và khoá dọc.

> Android 9+ chặn HTTP thường. Server phải dùng **HTTPS** (khuyến nghị) — đừng bật `usesCleartextTraffic` cho bản chạy thật.

---

## 5. Cách hệ thống quyết định "đã trả tiền"

Server chỉ chuyển đơn sang `PAID` khi **tất cả** điều kiện sau đúng:

1. Request từ VietQR có JWT hợp lệ (do chính server cấp qua `token_generate`).
2. `transType = C` (tiền vào).
3. Tìm được đơn theo `orderId` (dự phòng: theo `content` chuyển khoản).
4. Đơn đang `PENDING` và `amount` **bằng đúng** số tiền đơn.
5. `transactionid` chưa từng được xử lý (chống trùng, có unique index).

Mọi trường hợp khác **không bị bỏ qua** mà được ghi vào bảng `BankTransactions` và (nếu có đơn) chuyển đơn sang `REVIEW`:

| `Result` | Ý nghĩa | Việc cần làm |
|---|---|---|
| `AMOUNT_MISMATCH` | Khách chuyển sai số tiền | Hoàn/thu bù |
| `LATE_PAYMENT_EXPIRED/CANCELLED` | Chuyển sau khi QR hết hạn/đã huỷ | Hoàn tiền hoặc xử lý thủ công |
| `DUPLICATE_PAYMENT` | Đơn đã trả mà còn tiền về nữa | Hoàn tiền |
| `NO_ORDER` | Có tiền nhưng không khớp đơn nào (vd khách sửa nội dung CK) | Đối soát tay |

Xem các giao dịch cần xử lý:

```bash
sqlite3 data/kiosk.db "SELECT OrderId,Amount,Result,Content,datetime(ReceivedAt) FROM BankTransactions WHERE Result NOT IN ('PAID','IGNORED_NOT_CREDIT') ORDER BY Id DESC;"
sqlite3 data/kiosk.db "SELECT * FROM Orders WHERE Status='Review';"
```

Khi bấm **Huỷ** hoặc QR hết giờ, app gọi `cancel` và **server quyết định kết quả cuối**:
nếu khách vừa chuyển tiền đúng lúc đó, kết quả trả về là `PAID` và máy vẫn giao hàng — không bị mất tiền oan.

---

## 6. Lưu ý và việc nên làm tiếp

**Chưa được build/chạy thử.** Mã được viết theo đúng định dạng trong tài liệu VietQR nhưng môi trường tạo ra nó không build
được .NET và Android. Hãy build, chạy 3 bước test sandbox ở trên và xem log trước khi dùng thật.

- `sign` (chữ ký trong callback): tài liệu liệt kê nhưng chưa mô tả cách kiểm tra; server hiện **chưa** kiểm tra.
  Nên hỏi VietQR cách xác thực chữ ký và/hoặc danh sách IP của họ để chặn ở reverse proxy.
- Hết hạn: mặc định đơn sống 300 giây (`Kiosk:OrderTtlSeconds`, tối đa 900 theo QR động của VietQR);
  app tự hết hạn sớm hơn server 10 giây để việc huỷ luôn xảy ra trước.
- Chống giao hàng hai lần khi app bị tắt giữa chừng: sự kiện giao hàng hiện nằm trong bộ nhớ app. Nếu phần cứng của bạn
  không chịu được lặp, hãy thêm cờ `Dispensed` ở server và gọi xác nhận sau khi giao.
- Dọn dữ liệu cũ (`Orders` đã `Expired/Cancelled`) định kỳ; chuyển từ `EnsureCreated` sang EF Migrations khi cần đổi schema.
- Thêm giới hạn tốc độ (rate limiting) cho `/kiosk/*` nếu server mở ra Internet; xoay vòng `Kiosk:ApiKey` khi mất máy.
- Chuyển sang môi trường thật: đổi `VietQr:BaseUrl` thành `https://api.vietqr.org/` và dùng tài khoản Golive.
- Tài liệu VietQR ghi `content` tối đa 23 ký tự và `orderId` tối đa 13 ký tự; code đang dùng 12 ký tự cho cả hai.
"# FavoriVendor" 
