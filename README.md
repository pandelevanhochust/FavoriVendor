# Máy thanh toán tự động bằng VietQR (Tingo Pay) qua MQTT

Khách chọn số tiền trên máy, máy hiện mã QR hoặc nhận tiền mặt, và **máy tự xác nhận trong vài giây**,
không cần nhân viên kiểm tra bằng mắt.

```
┌──────────────┐ 1. POST /kiosk/orders  ┌──────────────────┐  vietqr/request/{terminal}   ┌──────────┐
│ App Android  │ ─────────────────────► │  Server .NET     │ ───────────────────────────► │  VietQR  │
│ (máy tại     │ ◄── mã QR, orderId ─── │  (của bạn)       │ ◄─── vietqr/response/… ───── │  MQTT    │
│  quầy)       │ 2. GET .../orders/{id} │                  │                              │  broker  │
│              │    ?wait=20            │ - giữ MQTT,      │   khách chuyển khoản         │          │
│ hiện QR,     │ ◄── PAID ───────────── │   mật khẩu       │ ◄─── vietqr/bdsd/… ───────── │          │
│ chờ          │                        │ - chống trùng    │ ──► vietqr/request-status ─► │          │
│              │                        │ - đối soát bù    │ ◄── vietqr/response-status ─ │          │
└──────────────┘                        └──────────────────┘                              └──────────┘
        server chủ động nối RA broker VietQR: KHÔNG cần địa chỉ public, tunnel hay đăng ký URL callback
```

**Khác với mô hình callback cũ:**
- Server **không còn nhận cuộc gọi từ VietQR**. Không cần tên miền public, HTTPS cho phía VietQR, tunnel, `token_generate`, `transaction-sync`, Basic Auth hay JWT.
- Mã QR được tạo bằng tin nhắn MQTT (bất đồng bộ), không còn gọi HTTP `generate-customer`.
- **VietQR không gửi lại tin biến động số dư bị lỡ.** Thay vào đó server dùng phiên MQTT bền vững và chủ động tra cứu trạng thái các đơn đáng ngờ (xem mục 5).
- App Android **không đổi**: vẫn chỉ gọi 3 API của server.

## Thư mục

| Thư mục | Nội dung |
|---|---|
| `server/` | ASP.NET Core 8 (minimal API) + MQTTnet 4.3 + EF Core SQLite |
| `android/` | App Android (Java, View + ViewBinding), build bằng Android Studio |

---

## 1. Chạy server

### Cấu hình

Server từ chối khởi động nếu thiếu cấu hình bí mật. Điền qua biến môi trường (xem `.env.example`)
hoặc `dotnet user-secrets` khi phát triển (user-secrets chỉ nạp ở chế độ `Development`):

```bash
cd server
dotnet user-secrets init
dotnet user-secrets set "Mqtt:Host"          "<VietQR cấp>"
dotnet user-secrets set "Mqtt:Port"          "<VietQR cấp, thường 8883 nếu dùng TLS>"
dotnet user-secrets set "Mqtt:Username"      "<VietQR cấp>"
dotnet user-secrets set "Mqtt:Password"      "<VietQR cấp>"
dotnet user-secrets set "Mqtt:TerminalCode"  "<terminalCode, nếu đã có>"
dotnet user-secrets set "Mqtt:BankAccount"   "<STK nhận tiền>"
dotnet user-secrets set "Mqtt:AccountName"   "TEN CHU TAI KHOAN"
dotnet user-secrets set "Kiosk:ApiKey"       "$(openssl rand -hex 24)"
ASPNETCORE_ENVIRONMENT=Development dotnet run
```

Thông tin kết nối broker (host, port, tài khoản) **do VietQR cấp**; tài liệu chỉ ghi định dạng topic chứ không nêu địa chỉ broker.

### Triển khai

```bash
cp .env.example .env      # điền giá trị thật
docker compose up -d --build
```

Container nghe `127.0.0.1:8080`. App Android phải gọi được server bằng **HTTPS** (Android 9+ chặn HTTP thường),
nên đặt reverse proxy phía trước, ví dụ Caddy:

```
kiosk.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Phía VietQR thì không cần mở gì cả: server chỉ cần **đi ra** được tới broker MQTT của VietQR.
Kiểm tra: `curl https://kiosk.example.com/healthz` → `{"ok":true,"mqttConnected":true,...}`.
Dữ liệu SQLite nằm ở `./data/kiosk.db` (cùng `terminal.json` nếu có đồng bộ điểm bán): hãy sao lưu thư mục này.

**Nâng cấp từ bản callback:** server tự thêm các cột mới vào `kiosk.db` cũ. Nếu gặp lỗi lạ, xoá `data/kiosk.db` khi đang thử nghiệm.

---

## 2. Điểm bán (terminalCode) và đồng bộ thiết bị

Mọi topic đều gắn với một `terminalCode`. Có hai cách có được nó:

**Cách A: VietQR đã cấp sẵn.** Điền `Mqtt:TerminalCode`, `BankCode`, `BankAccount`, `AccountName` rồi chạy.

**Cách B: đồng bộ thiết bị theo mục "Các bước đồng bộ MQTT" của VietQR** (chỉ làm một lần):
1. Đặt `Mqtt:SecretKey` (VietQR cấp), `Mqtt:MacAddr` (do bạn tự đặt, ổn định) và `Admin:ApiKey` (>= 16 ký tự).
2. Gọi `POST /admin/mqtt/provision` với header `X-Api-Key: <Admin:ApiKey>`. Kết quả có `qrCertificate` và `boxId`.
3. Tạo mã QR từ chuỗi `qrCertificate`, mở **app VietQR** bằng tài khoản chủ, quét mã, chọn tài khoản và xác nhận.
4. Server nhận `terminalCode`, tài khoản ngân hàng... qua topic `vietqr/boxId/{boxId}` và lưu vào `data/terminal.json`.
   Xem lại bằng `GET /admin/mqtt/status`.
5. Xong thì **xoá `Admin:ApiKey`** để tắt hẳn các API `/admin`.

Các API quản trị trả 404 nếu không đặt `Admin:ApiKey`. Giá trị trong cấu hình luôn thắng `terminal.json`.

---

## 3. Thử nghiệm

1. Chạy server ở chế độ Development, mở `GET /healthz`: `mqttConnected` phải là `true`. Nếu `false`, xem log (sai host/port/tài khoản, hoặc TLS).
2. Tạo đơn:

```bash
curl -s -X POST https://kiosk.example.com/kiosk/orders \
  -H "X-Api-Key: <Kiosk:ApiKey>" -H "Content-Type: application/json" \
  -d '{"amount":10000,"deviceId":"test"}'
```

   Server gửi yêu cầu lên `vietqr/request/{terminal}` và chờ `vietqr/response/{terminal}` tối đa `QrResponseTimeoutSeconds` (15 giây).
   Nếu trả 502: xem log, nguyên nhân thường là chưa nhận phản hồi (sai quyền topic, sai `terminalCode`...).
3. **Giả lập thanh toán:** trang "MQTT Giả Lập Thanh Toán" của VietQR hiện ghi *đang bảo trì, liên hệ VietQR để thực hiện bước này*.
   Vì vậy khi thử trên môi trường Test, nhờ VietQR kích hoạt giúp, hoặc chuyển khoản thật số tiền nhỏ.
4. Để thử riêng logic của mình mà không cần VietQR (chỉ chế độ Development):

```bash
curl -X POST https://localhost:5001/kiosk/dev/simulate-payment/<orderId> -H "X-Api-Key: <Kiosk:ApiKey>"
```

   Endpoint này **không tồn tại** ở Production.
5. Xem `GET /admin/mqtt/status` (cần `Admin:ApiKey`): các bộ đếm `qrRequests/qrResponses/bdsdReceived/statusRequests/statusResponses`
   cho biết ngay VietQR có đang trả lời hay không.

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

## 4b. Thanh toán TIỀN MẶT bằng đầu nhận tiền VND6 (giao thức ICT106 / RS232)

### Luồng màn hình
`Chọn mức giá` → `Chọn Tiền mặt / Chuyển khoản`
- **Chuyển khoản**: như các mục trên (server tạo QR, app chờ server báo `PAID`).
- **Tiền mặt**: app nói chuyện trực tiếp với đầu nhận tiền qua USB, **không qua server**.
  Hiện chưa có API báo doanh thu tiền mặt về server; nếu cần đối soát tập trung, hãy thêm sau.

### Máy VND6 chỉ nhận tờ từ 10.000 VND
Theo bảng DIP của máy: 10.000, 20.000, 50.000, 100.000, 200.000, 500.000. **Không có tờ 1.000 hay 2.000**, nên mức giá demo mặc định là
**10.000 và 20.000**. Đổi bằng `kiosk.amounts=10000,20000` trong `android/local.properties`
(đặt 1000,2000 vẫn dùng được cho chuyển khoản, nhưng tiền mặt sẽ trả lại mọi tờ tiền vì không tờ nào ≤ số tiền còn thiếu).

### Cấu hình phần cứng (theo ảnh DIP của máy)
1. **DIP SW SETTING 2, SW2 = OFF** để chọn *ICT Protocol* (mặc định ON là *Pulse*). Các công tắc còn lại giữ mặc định.
2. Các công tắc nhận/từ chối mệnh giá (DIP SW SETTING 1, SW6...SW10): để ON (Accept) cho các tờ muốn nhận.
3. **Tắt/bật nguồn máy sau khi đổi DIP** (tài liệu ghi rõ phải reset).
4. Nối bằng cáp USB-serial vào tablet qua OTG; chip USB-serial phổ biến (CDC-ACM, CP210x, CH34x, FTDI, PL2303) thì thư viện nhận được.
   Trên Android không có "COM port" hay Electron: thiết bị được `usb-serial-for-android` mở trực tiếp.
5. Kiểm tra mức tín hiệu của máy (TTL hay RS232 ±12V) trong tài liệu phần cứng trước khi nối, vì nối sai mức điện áp có thể hỏng cổng.

### Giao thức (theo tài liệu "ICT106 General Protocol For RS232" V0.2)
9600 baud, 8 data bit, **parity chẵn**, 1 stop bit, mỗi lệnh là một byte, không khung, không checksum.

| Việc | Byte |
|---|---|
| Máy khởi động (lặp mỗi 2 giây tới khi được xác nhận) | máy → `80 8F`; app → `02` trong 2 giây |
| Hỏi trạng thái (poll 200 ms) | app → `0C`; máy → `3E` (đang bật) / `5E` (đang cấm) / `71` bận / mã lỗi `20..2A` |
| Bật / tắt nhận tiền | app → `3E` / `5E` |
| Reset | app → `30` |
| Có tờ tiền | máy → `81 8F 4X` (`4X` = thứ tự loại tờ, chưa phải mệnh giá) |
| Quyết định | app → `02` (nhận) hoặc `0F` (trả lại) |
| Kết quả | máy → `10` (đã vào két, **lúc này mới cộng tiền**) hoặc `11` (đã trả lại) |
| Vào két sau kẹt giấy | máy → `83` + loại tờ (`40..4F`, `3F` = không rõ) |

Mô tả "lock-step" trước đó (app gửi `8F` để ACK; nhận = `01`, trả = `00`) **không khớp tài liệu chính thức** (`8F` do máy gửi; nhận = `02`,
trả = `0F`) nên đã bị bỏ. Có một công tắc tương thích *"Gửi 0x8F sau 0x81"* trong Chẩn đoán, **tắt mặc định**, chỉ bật nếu quan sát thấy
máy dừng sau `RX 81` mà không gửi loại tờ.

### An toàn tiền bạc (đã cài sẵn)
- **Chỉ cộng tiền khi máy báo `10`** (hoặc `83` + loại tờ sau kẹt giấy). Loại tờ `4X` chỉ là biến tạm.
- **Máy không thối tiền**: chỉ nhận tờ có mệnh giá ≤ số tiền còn thiếu (giá 10.000 sẽ trả lại tờ 20.000).
- Đã bỏ tiền vào thì **không cho Huỷ** (máy không hoàn tiền). Tiền đã nhận được lưu lại; mở lại app giữa chừng sẽ khôi phục.
- Mọi trường hợp tiền vào mà không giải thích được (báo `10` khi không duyệt tờ nào, máy khởi động lại lúc đang nhận, không báo kết quả...)
  hiện **"Cần kiểm tra"** và **chặn tiền mặt** cho tới khi nhân viên đối soát với két và bấm *Xoá bản ghi* trong Chẩn đoán.
- Máy báo lỗi phần cứng (kẹt tiền, mở két, két đầy...) thì app tạm không cho chọn tiền mặt và trả lại tờ tiền nếu có.
- Loại tờ chưa gán mệnh giá luôn bị trả lại.

### Thiết lập lần đầu (làm đúng thứ tự)
1. Cắm module, cấp quyền USB khi Android hỏi.
2. Nhấn giữ thanh tiêu đề ở màn chính, nhập PIN (mặc định `246810`, **đổi** bằng `kiosk.adminPin` trong `local.properties`).
3. **Kiểm chứng kết nối**: mục "Thiết bị USB" phải liệt kê module. Log đúng sẽ có `TX 0C` → `RX 3E` hoặc `RX 5E` rồi trạng thái `READY`
   (máy đã chạy sẵn), hoặc `TX 30` → `RX 80 8F` → `TX 02` rồi `READY`. Không thấy gì: kiểm tra DIP SW2, baud/parity 9600 8E1, cáp.
4. **Hiệu chuẩn mệnh giá**: bật *Chế độ hiệu chuẩn*, nhét lần lượt từng loại tiền; log hiện `RX 81 8F 4X`, màn hình hiện loại tờ vừa nhận diện;
   nhập mệnh giá VND tương ứng rồi *Lưu*. Máy sẽ trả tờ tiền lại (đúng mong đợi). Có nút điền gợi ý theo thứ tự trong bảng DIP
   (`40`=10.000 ... `45`=500.000) nhưng **thứ tự thật phụ thuộc firmware nên phải kiểm tra bằng tiền thật**.
5. Tắt chế độ hiệu chuẩn rồi thử một giao dịch 10.000 VND bằng tiền mặt.

### Điều chưa chắc chắn
- Chưa chạy thử với module thật.
- Tài liệu liệt kê loại tờ `40..44` (5 loại) ở bước escrow nhưng máy VND6 có 6 loại; app chấp nhận `40..4F` nhưng bạn cần xác nhận loại thứ sáu bằng tờ 500.000 thật.
- Mã lỗi `0x20..0x2A` lấy từ bảng trạng thái của tài liệu; ý nghĩa chi tiết (ví dụ két đầy hiện ở mã nào) nên xác nhận với ICT.

---

## 5. Cách hệ thống quyết định "đã trả tiền" (chuyển khoản)

Tin biến động số dư (`vietqr/bdsd/{terminal}`) và phản hồi tra cứu (`vietqr/response-status/{terminal}`) đều đi qua **cùng một bộ xử lý**.
Server chỉ chuyển đơn sang `PAID` khi **tất cả** điều kiện sau đúng:

1. Giao dịch là tiền vào (`transType = C`) và `status = 1`.
2. Tìm được đơn theo thứ tự: `orderId` → token `VQRxxxxxxxxxx` trong nội dung → nội dung đầy đủ.
   (Ví dụ trong tài liệu cho thấy tin biến động số dư của QR động có thể **không có `orderId`**, nên token `VQR...` là khoá đối soát chính.)
3. Đơn đang `PENDING` và số tiền **bằng đúng** số tiền đơn.
4. `referenceNumber` chưa từng được xử lý (có unique index): cùng một giao dịch đến hai đường vẫn chỉ tính một lần.

Mọi trường hợp khác **không bị bỏ qua** mà được ghi vào bảng `BankTransactions` và (nếu có đơn) chuyển đơn sang `REVIEW`:

| `Result` | Ý nghĩa | Việc cần làm |
|---|---|---|
| `AMOUNT_MISMATCH` | Khách chuyển sai số tiền | Hoàn/thu bù |
| `LATE_PAYMENT_EXPIRED/CANCELLED` | Chuyển sau khi QR hết hạn/đã huỷ | Hoàn tiền hoặc xử lý thủ công |
| `DUPLICATE_PAYMENT` | Đơn đã trả mà còn tiền về nữa | Hoàn tiền |
| `NO_ORDER` | Có tiền nhưng không khớp đơn nào | Đối soát tay |

```bash
sqlite3 data/kiosk.db "SELECT OrderId,Amount,Result,Content,datetime(ReceivedAt) FROM BankTransactions WHERE Result NOT IN ('PAID','IGNORED_NOT_CREDIT') ORDER BY Id DESC;"
sqlite3 data/kiosk.db "SELECT * FROM Orders WHERE Status='Review';"
```

### Vì sao cần đối soát bù

Với callback, VietQR tự gửi lại khi server lỗi. Với MQTT thì **tin biến động số dư bị lỡ sẽ không ai gửi lại**
(server mất mạng đúng lúc, tin bị rớt, lỗi ghi CSDL...). Hệ thống phòng bằng hai lớp:

1. **Phiên bền vững**: `CleanSession=false`, `ClientId` cố định, QoS 1. Broker giữ lại tin gửi trong lúc server offline và giao lại khi nối lại
   (phụ thuộc cấu hình broker của VietQR, chưa được tài liệu bảo đảm).
2. **`OrderReconcileService`**: mỗi 5 giây hỏi VietQR trạng thái các đơn cần kiểm tra qua `vietqr/request-status/{terminal}`:
   đơn `PENDING` (sau 12 giây, lặp mỗi 15 giây) và đơn `EXPIRED/CANCELLED` trong 15 phút gần đây (mỗi 60 giây, để bắt khách trả muộn → `REVIEW`).

Khi huỷ hoặc QR hết giờ, app gọi `cancel` và **server quyết định kết quả cuối**:
nếu khách vừa chuyển tiền đúng lúc đó, kết quả trả về là `PAID` và máy vẫn giao hàng.

---

## 6. Lưu ý và việc nên làm tiếp

**Chưa được chạy thử với broker và module thật.** Code server biên dịch sạch khi thay EF Core và MQTTnet bằng bản mô phỏng,
và phần logic thuần (đọc JSON mẫu của VietQR, tên trường gửi đi, khớp token, giờ UTC+7) đã chạy thử bằng .NET thật.
Lời gọi API thật của MQTTnet 4.3 và EF Core 8 chưa được biên dịch trong môi trường tạo ra mã, nên lần build đầu có thể cần chỉnh nhỏ.

- **`checkSum` của tra cứu giao dịch chưa kiểm chứng.** Tài liệu ghi `MD5(bankAccount + userBankName)`, nhưng ví dụ của họ **không tái lập được**
  (đã thử nhiều biến thể). Công thức của `handle-box` thì khớp ví dụ. Nếu `statusResponses` luôn bằng 0, server sẽ cảnh báo trong log;
  khi đó hỏi VietQR công thức chính xác (chữ hoa/thường của `userBankName`...).
- **Chưa thấy tài liệu nói rõ**: định dạng lỗi khi yêu cầu tạo QR sai (hiện chỉ biết qua việc quá thời gian chờ → 502),
  mức QoS và cấu hình phiên của broker, và quyền topic của từng tài khoản.
- `Mqtt:TerminalCode` dùng chung cho mọi máy; nếu cần mỗi máy một điểm bán, phải mở rộng `TerminalStore`.
- Chưa có hoàn tiền tự động (tài liệu có topic `vietqr/refund-request/#` nhưng không mô tả nội dung).
- Doanh thu **tiền mặt** chưa gửi về server.
- Dọn dữ liệu cũ (`Orders` đã `Expired/Cancelled`) định kỳ; chuyển từ `EnsureCreated` sang EF Migrations khi cần đổi schema.
- Thêm giới hạn tốc độ cho `/kiosk/*` nếu mở ra Internet; xoay vòng `Kiosk:ApiKey` khi mất máy.
- Chuyển sang môi trường thật: dùng thông tin broker và tài khoản Golive do VietQR cấp (xem trang "Nghiệm thu và yêu cầu GoLive").
