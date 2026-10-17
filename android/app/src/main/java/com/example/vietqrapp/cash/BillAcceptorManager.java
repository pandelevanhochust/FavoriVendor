package com.example.vietqrapp.cash;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.hoho.android.usbserial.driver.CdcAcmSerialDriver;
import com.hoho.android.usbserial.driver.Ch34xSerialDriver;
import com.hoho.android.usbserial.driver.Cp21xxSerialDriver;
import com.hoho.android.usbserial.driver.FtdiSerialDriver;
import com.hoho.android.usbserial.driver.ProbeTable;
import com.hoho.android.usbserial.driver.ProlificSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Điều khiển đầu nhận tiền (VND6 / TP74) qua cổng USB-serial của tablet, theo "ICT106 General Protocol For RS232".
 *
 * Nguyên tắc an toàn tiền bạc:
 *  - Chỉ cộng tiền khi nhận "đã vào két" (0x10), hoặc "đã vào két sau kẹt giấy" (0x83 + loại tờ).
 *    KHÔNG cộng ở bước giữ tờ (escrow 0x81 + 0x4X).
 *  - Mỗi tờ tiền do chính sách (EscrowPolicy) quyết định nhận hay trả lại.
 *  - Mọi trường hợp tiền vào mà không giải thích được đều được báo qua onUnresolvedBill, không bị bỏ qua.
 *  - Mọi hàm public gọi từ luồng chính; mọi callback cũng chạy trên luồng chính.
 */
public class BillAcceptorManager {

    public enum Link {DISCONNECTED, NO_PERMISSION, CONNECTING, HANDSHAKING, READY, NO_RESPONSE, ERROR}

    /** Quyết định có nhận tờ tiền mệnh giá vnd hay không. */
    public interface EscrowPolicy {
        boolean shouldAccept(int vnd);
    }

    public interface Listener {
        void onLinkChanged(Link link, String detail);

        /** Vừa nhận diện một tờ (trước khi quyết định). vnd = 0 nếu loại này chưa được gán mệnh giá. */
        void onBillSeen(int billType, int vnd);

        /** Tờ tiền đã vào két: được phép cộng vào số tiền đã nhận. */
        void onBillStacked(int vnd);

        /** Tờ tiền bị trả lại (do chính sách, do chưa gán mệnh giá, hoặc do máy tự từ chối). */
        void onBillRefused(int billType, int vnd, String reason);

        /** Lỗi phần cứng (kẹt tiền, mở két...). */
        void onDeviceError(String message);

        /** Có thể đã có tiền vào máy nhưng không xác định được số tiền/giao dịch: cần nhân viên đối soát. */
        void onUnresolvedBill(String message);

        void onLog(String line);
    }

    private static final String ACTION_PERMISSION = "com.example.vietqrapp.USB_PERMISSION";

    private static final long PROBE_TIMEOUT_MS = 700;        // chờ phản hồi poll trước khi Reset
    private static final long HANDSHAKE_TIMEOUT_MS = 4500;   // máy gửi 80 8F mỗi 2 giây sau Reset
    private static final long RETRY_MS = 5000;
    private static final long TYPE_BYTE_TIMEOUT_MS = 1000;
    private static final long POLL_INTERVAL_MS = 200;        // tài liệu: 100~200 ms
    private static final int POLL_SILENCE_LIMIT = 15;        // ~3 giây không trả lời poll -> mất liên lạc
    private static final long ESCROW_GUARD_MS = 15_000;      // sau mốc này tiếp tục poll để thấy lỗi (kẹt tiền...)
    private static final long PENDING_GUARD_MS = 120_000;    // quá lâu vẫn chưa rõ tờ đã duyệt -> báo nhân viên
    private static final long ACK_WINDOW_MS = 1000;
    private static final int MAX_LOG_LINES = 400;

    private static final int PARSE_IDLE = 0;
    private static final int PARSE_WAIT_TYPE = 1;       // sau 0x81 (bỏ qua 0x8F), chờ 0x4X
    private static final int PARSE_WAIT_JAM_TYPE = 2;   // sau 0x83, chờ loại tờ đã vào két

    private final Context app;
    private final UsbManager usb;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private final List<Listener> listeners = new ArrayList<>();
    private final ArrayDeque<String> logLines = new ArrayDeque<>();

    private Link link = Link.DISCONNECTED;
    private String linkDetail = "Chưa kết nối";
    private String fault;                 // null = máy không báo lỗi
    private UsbSerialPort port;
    private SerialInputOutputManager io;

    private EscrowPolicy policy;
    private boolean wantEnabled;          // giao dịch tiền mặt có đang cần nhận tiền không
    private boolean statusKnown;
    private boolean deviceEnabled;        // theo báo cáo gần nhất của máy (0x3E / 0x5E)
    private int lastStatusByte = -1;
    private int pendingVnd;               // đã đồng ý nhận, chờ 0x10
    private int lastBillType = -1;
    private int parseState = PARSE_IDLE;
    private long typeDeadlineMs;
    private boolean inEscrow;
    private int pollsSinceRx;
    private int resetAttempts;
    private long lastPowerOnMs;
    private long lastSyncMs;
    private long lastRejectNotifyMs;
    private final boolean autoReconnect = true;
    private boolean retryScheduled;

    private final Runnable probeTimeout = this::onProbeTimeout;
    private final Runnable handshakeWatchdog = this::onHandshakeTimeout;
    private final Runnable afterAck = this::afterPowerUpAck;
    private final Runnable pollRunnable = this::onPollTick;
    private final Runnable escrowGuard = this::onEscrowGuard;
    private final Runnable pendingGuard = this::onPendingGuard;
    private boolean permissionPending;
    private final Runnable retryRunnable = () -> {
        retryScheduled = false;
        connect();
    };

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_PERMISSION.equals(action)) {
                permissionPending = false;
                UsbDevice dev = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (granted || (dev != null && usb.hasPermission(dev))) {
                    log("Đã được cấp quyền USB");
                    connect();
                } else {
                    setLink(Link.NO_PERMISSION, "Bạn chưa cấp quyền truy cập thiết bị USB");
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                log("USB bị rút ra");
                closePort();
                setLink(Link.DISCONNECTED, "Đã rút cáp USB");
                scheduleRetry();
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                log("Phát hiện thiết bị USB mới cắm vào");
                connect();
            }
        }
    };

    private final SerialInputOutputManager.Listener ioListener = new SerialInputOutputManager.Listener() {
        @Override
        public void onNewData(byte[] data) {
            final byte[] copy = data.clone();
            main.post(() -> onData(copy));
        }

        @Override
        public void onRunError(Exception e) {
            main.post(() -> onIoError(e));
        }
    };

    public BillAcceptorManager(Context context) {
        this.app = context.getApplicationContext();
        this.usb = (UsbManager) app.getSystemService(Context.USB_SERVICE);
        this.prefs = app.getSharedPreferences("bill_acceptor", Context.MODE_PRIVATE);

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.registerReceiver(app, receiver, filter, ContextCompat.RECEIVER_EXPORTED);
        } else {
            app.registerReceiver(receiver, filter);
        }
    }

    // ------------------------------------------------------------------ truy vấn / cấu hình

    public Link getLink() {
        return link;
    }

    /** Nếu máy đang báo lỗi thì trả về nội dung lỗi (ưu tiên hiển thị). */
    public String getLinkDetail() {
        return fault != null ? fault : linkDetail;
    }

    /** Sẵn sàng nhận tiền: đã liên lạc được với máy và máy không báo lỗi. */
    public boolean isReady() {
        return link == Link.READY && fault == null;
    }

    public int getLastBillType() {
        return lastBillType;
    }

    /** true nếu đã đồng ý nhận một tờ nhưng chưa nhận xác nhận "đã vào két". */
    public boolean hasPendingBill() {
        return pendingVnd > 0;
    }

    public SharedPreferences getPrefs() {
        return prefs;
    }

    public int getBaud() {
        return prefs.getInt("baud", IctProtocol.DEFAULT_BAUD);
    }

    /** 0 = None, 1 = Even (theo ICT106), 2 = Odd. */
    public int getParityIndex() {
        return prefs.getInt("parity", 1);
    }

    public String getPreferredVidPid() {
        return prefs.getString("vidpid", "");
    }

    public void saveSerialSettings(int baud, int parityIndex, String vidPid) {
        prefs.edit().putInt("baud", baud).putInt("parity", parityIndex)
                .putString("vidpid", vidPid == null ? "" : vidPid.trim().toLowerCase(Locale.US)).apply();
    }

    /** Poll trạng thái 0x0C mỗi 200 ms (khuyến nghị của tài liệu): phát hiện kẹt tiền, mất liên lạc... */
    public boolean isPollEnabled() {
        return prefs.getBoolean("poll", true);
    }

    public void setPollEnabled(boolean on) {
        prefs.edit().putBoolean("poll", on).apply();
    }

    /**
     * Tương thích: gửi thêm 0x8F sau khi nhận 0x81. KHÔNG có trong tài liệu ICT106 (0x8F do máy gửi).
     * Chỉ bật nếu quan sát thấy máy dừng sau "RX 81" mà không gửi loại tờ.
     */
    public boolean isEscrowAckCompat() {
        return prefs.getBoolean("escrow_ack_compat", false);
    }

    public void setEscrowAckCompat(boolean on) {
        prefs.edit().putBoolean("escrow_ack_compat", on).apply();
    }

    public void addListener(Listener l) {
        if (!listeners.contains(l)) listeners.add(l);
    }

    public void removeListener(Listener l) {
        listeners.remove(l);
    }

    public String getLogText() {
        StringBuilder sb = new StringBuilder();
        for (String s : logLines) sb.append(s).append('\n');
        return sb.toString();
    }

    public void clearLog() {
        logLines.clear();
    }

    /** Liệt kê các thiết bị USB-serial mà thư viện nhận diện được (để biết VID:PID). */
    public String describeUsbDevices() {
        UsbSerialProber prober = getProber();
        List<UsbSerialDriver> drivers = prober.findAllDrivers(usb);
        StringBuilder sb = new StringBuilder();
        for (UsbSerialDriver d : drivers) {
            UsbDevice dev = d.getDevice();
            sb.append(String.format(Locale.US, "%04x:%04x  %s  (%d cổng)%n",
                    dev.getVendorId(), dev.getProductId(), d.getClass().getSimpleName(), d.getPorts().size()));
        }
        if (sb.length() == 0) {
            int all = usb.getDeviceList().size();
            sb.append("Không có thiết bị USB-serial được nhận diện.");
            if (all > 0) {
                sb.append("\nCó ").append(all).append(" thiết bị USB khác đang cắm vào máy:");
                for (UsbDevice dev : usb.getDeviceList().values()) {
                    String name = "";
                    try {
                        name = dev.getProductName() != null ? dev.getProductName() : "";
                    } catch (Exception ignored) {
                        // Tránh SecurityException trên Android < 10 khi chưa cấp quyền
                    }
                    sb.append(String.format(Locale.US, "%n%04x:%04x  %s (class %d)",
                            dev.getVendorId(), dev.getProductId(), name, dev.getDeviceClass()));
                }
            }
        }
        return sb.toString().trim();
    }

    // ------------------------------------------------------------------ điều khiển

    /** Đặt chính sách nhận tiền. null = trả lại mọi tờ tiền. */
    public void setEscrowPolicy(EscrowPolicy p) {
        this.policy = p;
    }

    /** Bật/tắt nhận tiền (lệnh 0x3E / 0x5E). Được áp dụng ngay nếu đã sẵn sàng, hoặc ngay sau khi bắt tay xong. */
    public void setEnabled(boolean enable) {
        wantEnabled = enable;
        if (link == Link.READY) syncDeviceState(true);
    }

    public void sendRaw(byte[] data) {
        if (port == null) {
            log("Không gửi được: cổng chưa mở");
            return;
        }
        send(data);
    }

    /** Gửi Reset 0x30; máy sẽ gửi 80 8F và app xác nhận bằng 0x02. */
    public void resetDevice() {
        if (port == null) {
            log("Không gửi được: cổng chưa mở");
            return;
        }
        main.removeCallbacks(pollRunnable);
        setLink(Link.HANDSHAKING, "Đang reset máy nhận tiền...");
        resetAttempts = 0;
        sendReset();
    }

    /** Gửi 0x02 thủ công (xác nhận khởi động) rồi coi là sẵn sàng. Dùng khi chẩn đoán. */
    public void manualHandshake() {
        if (port == null) {
            log("Không gửi được: cổng chưa mở");
            return;
        }
        log("Bắt tay thủ công: gửi 0x02");
        cancelTimers();
        send(IctProtocol.CMD_ACK_POWER_UP);
        main.postDelayed(afterAck, 250);
    }

    public void reconnect() {
        main.removeCallbacks(retryRunnable);
        retryScheduled = false;
        permissionPending = false;
        closePort();
        setLink(Link.DISCONNECTED, "Đang kết nối lại...");
        connect();
    }

    /** Idempotent: gọi nhiều lần không sao. */
    public void connect() {
        if (link == Link.CONNECTING || link == Link.HANDSHAKING || link == Link.READY) return;
        if (link == Link.NO_PERMISSION && permissionPending) return; // đang chờ người dùng bấm cho phép

        if (port != null && link == Link.NO_RESPONSE) {
            // Cổng vẫn đang mở, máy chỉ chưa trả lời: kiểm tra lại thay vì mở cổng lần nữa.
            setLink(Link.HANDSHAKING, "Kiểm tra lại máy nhận tiền...");
            beginProbe();
            return;
        }

        setLink(Link.CONNECTING, "Đang tìm thiết bị USB...");

        UsbSerialDriver driver = pickDriver();
        if (driver == null) {
            setLink(Link.DISCONNECTED, "Không thấy thiết bị USB-serial. Kiểm tra cáp/OTG, hoặc thiết bị chưa được thư viện hỗ trợ.");
            scheduleRetry();
            return;
        }

        UsbDevice device = driver.getDevice();
        if (!usb.hasPermission(device)) {
            permissionPending = true;
            requestPermission(device);
            setLink(Link.NO_PERMISSION, "Cần cấp quyền USB cho ứng dụng");
            return;
        }
        permissionPending = false;

        UsbDeviceConnection connection = usb.openDevice(device);
        if (connection == null) {
            setLink(Link.ERROR, "Không mở được thiết bị USB");
            scheduleRetry();
            return;
        }

        try {
            port = driver.getPorts().get(0);
            port.open(connection);
            port.setParameters(getBaud(), 8, UsbSerialPort.STOPBITS_1, parityConstant(getParityIndex()));
            io = new SerialInputOutputManager(port, ioListener);
            io.start();
        } catch (IOException | RuntimeException e) {
            closePort();
            setLink(Link.ERROR, "Lỗi mở cổng: " + e.getMessage());
            scheduleRetry();
            return;
        }

        log(String.format(Locale.US, "Mở cổng %04x:%04x @ %d baud, parity=%s",
                device.getVendorId(), device.getProductId(), getBaud(), parityName(getParityIndex())));
        setLink(Link.HANDSHAKING, "Đang kiểm tra máy nhận tiền...");
        beginProbe();
    }

    // ------------------------------------------------------------------ kết nối / bắt tay

    /**
     * Trước hết hỏi trạng thái (0x0C): nếu máy đã chạy sẵn sẽ trả 0x3E/0x5E và vào READY ngay,
     * không cần Reset (tránh làm gián đoạn máy đang hoạt động). Chỉ khi im lặng mới Reset 0x30.
     */
    private void beginProbe() {
        cancelTimers();
        resetAttempts = 0;
        pollsSinceRx = 0;
        inEscrow = false;
        parseState = PARSE_IDLE;
        statusKnown = false;
        setFault(null);
        sendQuiet(IctProtocol.CMD_POLL);
        main.postDelayed(probeTimeout, PROBE_TIMEOUT_MS);
    }

    private void onProbeTimeout() {
        if (link != Link.HANDSHAKING) return;
        log("Máy không trả lời poll 0x0C -> gửi Reset 0x30");
        sendReset();
    }

    private void sendReset() {
        main.removeCallbacks(handshakeWatchdog);
        dropPending("Reset máy nhận tiền khi đang nhận tiền");
        send(IctProtocol.CMD_RESET);
        main.postDelayed(handshakeWatchdog, HANDSHAKE_TIMEOUT_MS);
    }

    private void onHandshakeTimeout() {
        if (link != Link.HANDSHAKING) return;
        resetAttempts++;
        if (resetAttempts < 3) {
            log("Chưa thấy 80 8F, thử Reset lại (" + resetAttempts + "/3)");
            sendReset();
        } else {
            setLink(Link.NO_RESPONSE, "Máy nhận tiền không trả lời. Kiểm tra: DIP SW SETTING 2 -> SW2 = OFF (ICT Protocol) "
                    + "rồi tắt/bật nguồn máy; baud/parity 9600 8E1; cáp TX/RX và mức điện áp (TTL hay RS232).");
            scheduleRetry();
        }
    }

    /** Máy gửi 80 8F (mỗi 2 giây tới khi nhận 0x02): phải xác nhận bằng 0x02 trong vòng 2 giây. */
    private void onPowerUpMark() {
        cancelTimers();
        inEscrow = false;
        parseState = PARSE_IDLE;
        log("Máy báo khởi động (80 8F) -> gửi 0x02 xác nhận");
        send(IctProtocol.CMD_ACK_POWER_UP);
        main.postDelayed(afterAck, 250);
    }

    private void afterPowerUpAck() {
        if (port == null) return;
        statusKnown = false;
        setFault(null);
        setLink(Link.READY, "Sẵn sàng");
        syncDeviceState(true);
        startPolling();
    }

    private void scheduleRetry() {
        if (!autoReconnect || retryScheduled) return;
        retryScheduled = true;
        main.postDelayed(retryRunnable, RETRY_MS);
    }

    private void cancelTimers() {
        main.removeCallbacks(probeTimeout);
        main.removeCallbacks(handshakeWatchdog);
        main.removeCallbacks(afterAck);
    }

    // ------------------------------------------------------------------ poll trạng thái

    private void startPolling() {
        main.removeCallbacks(pollRunnable);
        if (!isPollEnabled()) return;
        pollsSinceRx = 0;
        main.postDelayed(pollRunnable, POLL_INTERVAL_MS);
    }

    private void onPollTick() {
        if (port == null || link != Link.READY) return;
        if (pollsSinceRx >= POLL_SILENCE_LIMIT) {
            setLink(Link.NO_RESPONSE, "Mất liên lạc với máy nhận tiền (không trả lời poll)");
            scheduleRetry();
            return;
        }
        // Không poll khi đang xử lý một tờ tiền (escrow) để không chen vào hội thoại nhận/trả.
        if (!inEscrow && parseState == PARSE_IDLE) {
            pollsSinceRx++;
            sendQuiet(IctProtocol.CMD_POLL);
        }
        main.postDelayed(pollRunnable, POLL_INTERVAL_MS);
    }

    /** Đưa trạng thái bật/tắt của máy về đúng ý muốn (wantEnabled). */
    private void syncDeviceState(boolean force) {
        if (link != Link.READY || inEscrow) return;
        if (!force) {
            if (!statusKnown || deviceEnabled == wantEnabled) return;
            long now = System.currentTimeMillis();
            if (now - lastSyncMs < 1000) return; // tránh gửi dồn nếu máy không đổi trạng thái
            lastSyncMs = now;
        }
        send(wantEnabled ? IctProtocol.CMD_ENABLE : IctProtocol.CMD_DISABLE);
    }

    // ------------------------------------------------------------------ USB nội bộ

    public UsbSerialProber getProber() {
        ProbeTable table = UsbSerialProber.getDefaultProbeTable();

        // Bổ sung các chip clone/đời mới thường gặp (CH340, CH341, CH343, CH9102, PL2303G...)
        table.addProduct(0x1a86, 0x55d4, Ch34xSerialDriver.class); // CH9102 / CH343
        table.addProduct(0x1a86, 0x55d3, Ch34xSerialDriver.class);
        table.addProduct(0x1a86, 0x55d2, Ch34xSerialDriver.class);
        table.addProduct(0x1a86, 0x7522, Ch34xSerialDriver.class); // CH340K
        table.addProduct(0x1a86, 0x7523, Ch34xSerialDriver.class); // CH340G / CH340C
        table.addProduct(0x1a86, 0x5523, Ch34xSerialDriver.class); // CH341A

        table.addProduct(0x067b, 0x23a3, ProlificSerialDriver.class); // PL2303G / PL2303RA
        table.addProduct(0x067b, 0x23c3, ProlificSerialDriver.class);
        table.addProduct(0x067b, 0x23d3, ProlificSerialDriver.class);
        table.addProduct(0x067b, 0x2303, ProlificSerialDriver.class); // PL2303HXD / TA

        // VID:PID ưu tiên từ màn hình Chẩn đoán nếu người dùng đã chỉ định
        String wanted = getPreferredVidPid();
        if (!wanted.isEmpty() && wanted.contains(":")) {
            try {
                String[] parts = wanted.split(":");
                int v = Integer.parseInt(parts[0].trim(), 16);
                int p = Integer.parseInt(parts[1].trim(), 16);
                table.addProduct(v, p, Ch34xSerialDriver.class);
                table.addProduct(v, p, Cp21xxSerialDriver.class);
                table.addProduct(v, p, ProlificSerialDriver.class);
                table.addProduct(v, p, FtdiSerialDriver.class);
                table.addProduct(v, p, CdcAcmSerialDriver.class);
            } catch (Exception ignored) {}
        }

        return new UsbSerialProber(table);
    }

    private UsbSerialDriver pickDriver() {
        UsbSerialProber prober = getProber();
        List<UsbSerialDriver> drivers = prober.findAllDrivers(usb);

        String wanted = getPreferredVidPid();
        if (!wanted.isEmpty()) {
            for (UsbSerialDriver d : drivers) {
                String id = String.format(Locale.US, "%04x:%04x", d.getDevice().getVendorId(), d.getDevice().getProductId());
                if (id.equalsIgnoreCase(wanted)) return d;
            }
            log("Không thấy thiết bị " + wanted + ", dùng thiết bị đầu tiên");
        }

        if (!drivers.isEmpty()) {
            return drivers.get(0);
        }

        // Tự động nhận diện thiết bị (Fallback khi có USB cắm vào nhưng chưa khớp bảng prober)
        if (!usb.getDeviceList().isEmpty()) {
            for (UsbDevice dev : usb.getDeviceList().values()) {
                UsbSerialDriver d = prober.probeDevice(dev);
                if (d != null) return d;

                int vid = dev.getVendorId();
                Class<? extends UsbSerialDriver> driverClass = null;
                if (vid == 0x1a86) driverClass = Ch34xSerialDriver.class;
                else if (vid == 0x10c4) driverClass = Cp21xxSerialDriver.class;
                else if (vid == 0x067b) driverClass = ProlificSerialDriver.class;
                else if (vid == 0x0403) driverClass = FtdiSerialDriver.class;
                else if (dev.getDeviceClass() == 2 || (dev.getInterfaceCount() > 0 && dev.getInterface(0).getInterfaceClass() == 2)) {
                    driverClass = CdcAcmSerialDriver.class;
                }

                if (driverClass != null) {
                    ProbeTable fallbackTable = new ProbeTable();
                    fallbackTable.addProduct(dev.getVendorId(), dev.getProductId(), driverClass);
                    UsbSerialProber fallbackProber = new UsbSerialProber(fallbackTable);
                    UsbSerialDriver fallbackDriver = fallbackProber.probeDevice(dev);
                    if (fallbackDriver != null) {
                        log(String.format(Locale.US, "Nhận diện driver %s cho thiết bị %04x:%04x",
                                driverClass.getSimpleName(), dev.getVendorId(), dev.getProductId()));
                        return fallbackDriver;
                    }
                }
            }
        }

        return null;
    }

    private void requestPermission(UsbDevice device) {
        Intent intent = new Intent(ACTION_PERMISSION);
        // Không gọi setPackage() vì PendingIntent được chuyển cho UsbService hệ thống phát lại.
        // Trên Android 12+ (SDK >= 31) bắt buộc FLAG_MUTABLE, còn Android < 12 dùng 0.
        int flags = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(app, 0, intent, flags);
        usb.requestPermission(device, pi);
    }

    private static int parityConstant(int index) {
        switch (index) {
            case 1:
                return UsbSerialPort.PARITY_EVEN;
            case 2:
                return UsbSerialPort.PARITY_ODD;
            default:
                return UsbSerialPort.PARITY_NONE;
        }
    }

    public static String parityName(int index) {
        return index == 1 ? "Even" : index == 2 ? "Odd" : "None";
    }

    private void closePort() {
        dropPending("Mất kết nối USB khi đang nhận tiền");
        cancelTimers();
        main.removeCallbacks(pollRunnable);
        main.removeCallbacks(escrowGuard);
        main.removeCallbacks(pendingGuard);
        if (io != null) {
            io.stop();
            io = null;
        }
        try {
            if (port != null) port.close();
        } catch (IOException ignored) {
            // đóng cổng không báo lỗi
        }
        port = null;
        parseState = PARSE_IDLE;
        inEscrow = false;
        statusKnown = false;
    }

    private void onIoError(Exception e) {
        log("Lỗi I/O USB: " + e.getMessage());
        closePort();
        setLink(Link.ERROR, "Mất kết nối USB: " + e.getMessage());
        scheduleRetry();
    }

    private void send(byte b) {
        send(new byte[]{b});
    }

    private void send(final byte[] data) {
        log("TX " + IctProtocol.hex(data));
        write(data);
    }

    /** Gửi không ghi log (poll lặp mỗi 200 ms sẽ làm ngập nhật ký). */
    private void sendQuiet(byte b) {
        write(new byte[]{b});
    }

    private void write(final byte[] data) {
        final UsbSerialPort p = port;
        if (p == null) return;
        writer.execute(() -> {
            try {
                p.write(data, 300);
            } catch (IOException e) {
                main.post(() -> onIoError(e));
            }
        });
    }

    // ------------------------------------------------------------------ phân tích dữ liệu nhận

    private void onData(byte[] data) {
        boolean routine = data.length == 1 && (data[0] & 0xFF) == lastStatusByte
                && (lastStatusByte == IctProtocol.STATUS_ENABLED || lastStatusByte == IctProtocol.STATUS_INHIBIT
                || lastStatusByte == IctProtocol.STATUS_BUSY);
        if (!routine) log("RX " + IctProtocol.hex(data));
        for (byte b : data) onByte(b & 0xFF);
    }

    private void onByte(int b) {
        long now = System.currentTimeMillis();
        pollsSinceRx = 0;

        if (parseState == PARSE_WAIT_TYPE) {
            if (now > typeDeadlineMs) {
                parseState = PARSE_IDLE;
                inEscrow = false;
                log("Quá hạn chờ loại tờ tiền sau 0x81");
            } else if (b == IctProtocol.EVT_MARK || isInterleavedStatus(b)) {
                return; // 81 8F: bỏ qua 8F; trả lời của một lần poll có thể chen vào: không được huỷ sự kiện
            } else if (IctProtocol.isBillType(b)) {
                parseState = PARSE_IDLE;
                onEscrow(b);
                return;
            } else {
                parseState = PARSE_IDLE;
                inEscrow = false;
                log(String.format(Locale.US, "Sau 0x81 không phải loại tờ hợp lệ (0x%02X)", b));
            }
        } else if (parseState == PARSE_WAIT_JAM_TYPE) {
            if (now <= typeDeadlineMs && isInterleavedStatus(b)) return;
            parseState = PARSE_IDLE;
            if (now <= typeDeadlineMs && (b == IctProtocol.BILL_UNKNOWN || IctProtocol.isBillType(b))) {
                onJamStacked(b);
                return;
            }
            log(String.format(Locale.US, "Sau 0x83 không phải loại tờ hợp lệ (0x%02X)", b));
            onUnresolved("Máy báo đã nhận tiền sau kẹt giấy (0x83) nhưng không rõ loại tờ");
        }

        switch (b) {
            case IctProtocol.EVT_POWER_ON:
                lastPowerOnMs = now;
                dropPending("Máy nhận tiền khởi động lại khi đang nhận tiền");
                break;
            case IctProtocol.EVT_MARK:
                if (now - lastPowerOnMs <= ACK_WINDOW_MS || link != Link.READY) {
                    onPowerUpMark();
                } else {
                    log("Nhận 0x8F lạc (không sau 0x80), bỏ qua");
                }
                break;
            case IctProtocol.EVT_BILL_VALID:
                inEscrow = true;
                parseState = PARSE_WAIT_TYPE;
                typeDeadlineMs = now + TYPE_BYTE_TIMEOUT_MS;
                armEscrowGuard();
                if (isEscrowAckCompat()) send(IctProtocol.CMD_ESCROW_ACK_COMPAT);
                break;
            case IctProtocol.EVT_STACKED:
                onStacked();
                break;
            case IctProtocol.EVT_RETURNED:
                onReturned();
                break;
            case IctProtocol.EVT_JAM_STACKED:
                parseState = PARSE_WAIT_JAM_TYPE;
                typeDeadlineMs = now + TYPE_BYTE_TIMEOUT_MS;
                break;
            case IctProtocol.STATUS_ENABLED:
                onStatus(b, true);
                break;
            case IctProtocol.STATUS_INHIBIT:
                onStatus(b, false);
                break;
            case IctProtocol.STATUS_BUSY:
                noteStatus(b, "Máy đang bận (0x71)");
                break;
            case IctProtocol.STATUS_POWER_COMM:
                noteStatus(b, "Máy báo 0xA1 (power supply on communication)");
                break;
            case IctProtocol.STATUS_NO_ERROR:
                setFault(null);
                noteStatus(b, "Máy báo hết lỗi (0x2F)");
                break;
            case IctProtocol.STATUS_BILL_REJECT:
                if (now - lastRejectNotifyMs > 1500) {
                    lastRejectNotifyMs = now;
                    log("Máy báo Bill Reject (0x29)");
                    for (Listener l : snapshot()) l.onBillRefused(-1, 0, "Máy nhận tiền từ chối tờ tiền (không hợp lệ)");
                }
                break;
            default:
                if (IctProtocol.isFaultCode(b)) {
                    onFault(b);
                } else {
                    log(String.format(Locale.US, "Byte không rõ: 0x%02X", b));
                }
        }
    }

    /** Phản hồi trạng thái (3E/5E/71) có thể là câu trả lời của một lần poll gửi ngay trước khi sự kiện bắt đầu. */
    private static boolean isInterleavedStatus(int b) {
        return b == IctProtocol.STATUS_ENABLED || b == IctProtocol.STATUS_INHIBIT || b == IctProtocol.STATUS_BUSY;
    }

    private void noteStatus(int b, String text) {
        if (b != lastStatusByte) log(text);
        lastStatusByte = b;
    }

    private void onStatus(int b, boolean enabled) {
        boolean changed = !statusKnown || deviceEnabled != enabled;
        statusKnown = true;
        deviceEnabled = enabled;
        lastStatusByte = b;
        if (changed) log(enabled ? "Trạng thái máy: đang cho phép nhận tiền (0x3E)" : "Trạng thái máy: đang cấm nhận tiền (0x5E)");
        if (fault != null) setFault(null);

        if (link == Link.HANDSHAKING) {
            // Máy trả lời poll => còn sống và đã khởi tạo, không cần Reset.
            cancelTimers();
            setLink(Link.READY, "Sẵn sàng");
            syncDeviceState(true);
            startPolling();
        } else {
            syncDeviceState(false);
        }
    }

    // ------------------------------------------------------------------ tờ tiền

    private void onEscrow(int type) {
        lastBillType = type;
        int vnd = BillMap.getVnd(prefs, type);
        for (Listener l : snapshot()) l.onBillSeen(type, vnd);

        String reason = null;
        if (fault != null) {
            reason = "Máy nhận tiền đang báo lỗi";
        } else if (!wantEnabled) {
            reason = "Đang không nhận tiền";
        } else if (pendingVnd > 0) {
            reason = "Đang xử lý tờ tiền trước đó";
        } else if (vnd <= 0) {
            reason = String.format(Locale.US, "Loại tờ tiền 0x%02X chưa được gán mệnh giá", type);
        } else if (policy == null || !policy.shouldAccept(vnd)) {
            reason = "Tờ " + vnd + " VND không được nhận cho giao dịch hiện tại";
        }

        if (reason != null) {
            log(String.format(Locale.US, "Trả lại tờ 0x%02X: %s", type, reason));
            send(IctProtocol.CMD_REJECT);
            for (Listener l : snapshot()) l.onBillRefused(type, vnd, reason);
            return;
        }

        pendingVnd = vnd;
        log("Nhận tờ " + vnd + " VND (chờ xác nhận vào két)");
        main.removeCallbacks(pendingGuard);
        main.postDelayed(pendingGuard, PENDING_GUARD_MS);
        send(IctProtocol.CMD_ACCEPT);
    }

    private void onStacked() {
        endEscrow();
        if (pendingVnd > 0) {
            int vnd = pendingVnd;
            pendingVnd = 0;
            log("Đã vào két: " + vnd + " VND");
            for (Listener l : snapshot()) l.onBillStacked(vnd);
        } else {
            // Tiền vào két mà ta không hề đồng ý nhận: tuyệt đối không bỏ qua âm thầm.
            onUnresolved("Máy báo có tờ tiền vào két (0x10) nhưng không có tờ nào được duyệt");
        }
    }

    private void onReturned() {
        endEscrow();
        if (pendingVnd > 0) {
            log("Tờ tiền bị máy trả lại dù đã duyệt, không tính tiền");
            pendingVnd = 0;
            for (Listener l : snapshot()) l.onBillRefused(lastBillType, 0, "Tờ tiền đã được trả lại");
        }
    }

    /** Sau kẹt giấy, máy báo tờ tiền đã được cuốn vào két: loại tờ trong tin báo là nguồn đáng tin nhất. */
    private void onJamStacked(int type) {
        endEscrow();
        int vnd = type == IctProtocol.BILL_UNKNOWN ? 0 : BillMap.getVnd(prefs, type);
        log(String.format(Locale.US, "Đã vào két sau kẹt giấy: loại 0x%02X = %d VND", type, vnd));
        pendingVnd = 0;
        if (vnd <= 0) {
            onUnresolved(String.format(Locale.US,
                    "Máy đã nhận một tờ tiền sau kẹt giấy nhưng không rõ mệnh giá (0x%02X)", type));
            return;
        }
        for (Listener l : snapshot()) l.onBillStacked(vnd);
    }

    private void armEscrowGuard() {
        main.removeCallbacks(escrowGuard);
        main.postDelayed(escrowGuard, ESCROW_GUARD_MS);
    }

    private void endEscrow() {
        inEscrow = false;
        main.removeCallbacks(escrowGuard);
        main.removeCallbacks(pendingGuard);
    }

    private void onEscrowGuard() {
        inEscrow = false;
        parseState = PARSE_IDLE;
        // KHÔNG xoá tờ đang chờ: nếu về sau máy báo 0x10 hoặc 0x83 thì vẫn cộng tiền đúng cho khách.
        log("Chưa thấy kết quả xử lý tờ tiền sau 15 giây, tiếp tục poll để phát hiện lỗi (kẹt tiền...)");
    }

    private void onPendingGuard() {
        dropPending("Đã duyệt nhận tờ tiền nhưng máy không báo vào két hay trả lại sau 2 phút");
    }

    /** Bỏ tờ đang chờ xác nhận nhưng LUÔN báo để nhân viên đối soát (có thể tiền đã vào két). */
    private void dropPending(String reason) {
        main.removeCallbacks(pendingGuard);
        if (pendingVnd <= 0) return;
        int vnd = pendingVnd;
        pendingVnd = 0;
        onUnresolved(reason + " (tờ " + vnd + " VND)");
    }

    // ------------------------------------------------------------------ lỗi phần cứng

    private void onFault(int code) {
        String msg = String.format(Locale.US, "Máy nhận tiền báo lỗi 0x%02X (%s)", code, IctProtocol.faultName(code));
        if (code == 0x2A) {
            msg += ". Nếu lỗi lặp lại sau mỗi lần poll, firmware có thể không hỗ trợ lệnh 0x0C: tắt 'Poll trạng thái' trong Chẩn đoán";
        }
        if (pendingVnd > 0) {
            msg += ". Có tờ " + pendingVnd + " VND chưa xác nhận vào két, vui lòng báo nhân viên";
        }
        setFault(msg);
    }

    private void setFault(String f) {
        if (f == null ? fault == null : f.equals(fault)) return;
        fault = f;
        log(f == null ? "Hết lỗi phần cứng" : f);
        for (Listener l : snapshot()) l.onLinkChanged(link, getLinkDetail());
        if (f != null) for (Listener l : snapshot()) l.onDeviceError(f);
    }

    private void onUnresolved(String message) {
        log("CẦN ĐỐI SOÁT: " + message);
        for (Listener l : snapshot()) l.onUnresolvedBill(message);
    }

    // ------------------------------------------------------------------ tiện ích

    private void setLink(Link newLink, String detail) {
        link = newLink;
        linkDetail = detail;
        log("[" + newLink + "] " + detail);
        for (Listener l : snapshot()) l.onLinkChanged(newLink, getLinkDetail());
    }

    private List<Listener> snapshot() {
        return new ArrayList<>(listeners);
    }

    private void log(String line) {
        String stamped = String.format(Locale.US, "%1$tH:%1$tM:%1$tS.%1$tL  %2$s", System.currentTimeMillis(), line);
        logLines.addLast(stamped);
        while (logLines.size() > MAX_LOG_LINES) logLines.removeFirst();
        for (Listener l : snapshot()) l.onLog(stamped);
    }
}
