package com.example.vietqrapp.viewmodel;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import com.example.vietqrapp.BuildConfig;
import com.example.vietqrapp.KioskApp;
import com.example.vietqrapp.api.KioskRepository;
import com.example.vietqrapp.api.KioskRepository.ResultCallback;
import com.example.vietqrapp.cash.BillAcceptorManager;
import com.example.vietqrapp.db.KioskDbHelper;
import com.example.vietqrapp.db.LocalDiscount;
import com.example.vietqrapp.db.LocalTransaction;
import com.example.vietqrapp.model.OrderResponse;
import com.example.vietqrapp.model.ValidateDiscountResponse;
import com.example.vietqrapp.ui.QrCodeGenerator;

import java.text.NumberFormat;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import retrofit2.Call;

/**
 * Luồng: HOME (chọn giá) -> METHOD (tiền mặt / chuyển khoản)
 *   - Chuyển khoản: server tạo đơn + QR, app long-poll tới khi server báo PAID.
 *   - Tiền mặt: đầu nhận tiền TP74 qua USB; tiền chỉ được cộng khi tờ tiền đã vào két.
 * Trạng thái "đã thanh toán" của chuyển khoản luôn do SERVER quyết định.
 */
public class PaymentViewModel extends ViewModel {

    private static final int CLIENT_MARGIN_SECONDS = 10;
    private static final int LONG_POLL_SECONDS = 20;
    private static final long RESULT_AUTO_RESET_MS = 8_000;
    private static final long REVIEW_AUTO_RESET_MS = 20_000;
    private static final long CASH_IDLE_MS = 90_000;

    public static class PaidEvent {
        public final String orderId;
        public final long amount;
        public final String method;

        PaidEvent(String orderId, long amount, String method) {
            this.orderId = orderId;
            this.amount = amount;
            this.method = method;
        }
    }

    private final KioskRepository repository;
    private final BillAcceptorManager acceptor;
    private final SharedPreferences cashPrefs;
    private final KioskDbHelper dbHelper;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final MutableLiveData<PaymentUiState> uiState = new MutableLiveData<>(new PaymentUiState());
    private final MutableLiveData<PaidEvent> paidEvent = new MutableLiveData<>();

    // Mức giá demo, đặt bằng kiosk.amounts trong local.properties (mặc định 10000,20000).
    // Máy VND6 chỉ nhận tờ từ 10.000 VND, nên mức dưới 10.000 chỉ thanh toán được bằng chuyển khoản.
    private final List<Long> amounts = parseAmounts(BuildConfig.DEMO_AMOUNTS);

    // --- chuyển khoản ---
    private int generation;
    private String activeOrderId;
    private long deadlineElapsedMs;
    private Call<OrderResponse> activeCall;

    // --- tiền mặt ---
    private long cashPrice;
    private long cashInserted;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (activeOrderId == null) return;
            long leftMs = deadlineElapsedMs - SystemClock.elapsedRealtime();
            int left = (int) Math.max(0, (leftMs + 999) / 1000);

            PaymentUiState s = current().copy();
            s.setRemainingSeconds(left);
            uiState.setValue(s);

            if (left <= 0) {
                cancelAndReset("Mã QR đã hết hạn. Vui lòng chọn lại.");
            } else {
                main.postDelayed(this, 1000);
            }
        }
    };

    private final Runnable autoReset = () -> resetToSelection(null);

    private final Runnable cashIdle = this::onCashIdleTimeout;

    private final BillAcceptorManager.Listener acceptorListener = new BillAcceptorManager.Listener() {
        @Override
        public void onLinkChanged(BillAcceptorManager.Link link, String detail) {
            PaymentUiState s = current().copy();
            s.setCashReady(acceptor.isReady());
            s.setCashStatusText(acceptor.isReady() ? "" : acceptor.getLinkDetail());
            if (s.getStatus() == PaymentUiState.Status.CASH) {
                s.setMessage(acceptor.isReady() ? null
                        : "Máy nhận tiền tạm ngừng. Tiền đã nhận vẫn được lưu. " + acceptor.getLinkDetail());
            }
            uiState.setValue(s);
        }

        @Override
        public void onBillSeen(int billType, int vnd) {
            // nhận diện tờ tiền; quyết định nhận/trả do chính sách ở BillAcceptorManager
        }

        @Override
        public void onBillStacked(int vnd) {
            handleStacked(vnd);
        }

        @Override
        public void onBillRefused(int billType, int vnd, String reason) {
            if (current().getStatus() != PaymentUiState.Status.CASH) return;
            long remaining = cashPrice - cashInserted;
            // Chỉ nói "vượt số tiền" khi đúng là vậy; các lý do khác (lỗi máy, chưa gán mệnh giá...) dùng câu chung.
            String text = vnd > 0 && vnd > remaining
                    ? "Tờ " + fmt(vnd) + " vượt số tiền còn thiếu. Máy không thối tiền, vui lòng dùng tờ nhỏ hơn."
                    : "Không nhận được tờ tiền này. Vui lòng thử lại hoặc dùng tờ khác.";
            PaymentUiState s = current().copy();
            s.setMessage(text);
            uiState.setValue(s);
            armCashIdle();
        }

        @Override
        public void onDeviceError(String message) {
            if (current().getStatus() != PaymentUiState.Status.CASH) return;
            PaymentUiState s = current().copy();
            s.setMessage(message);
            uiState.setValue(s);
        }

        @Override
        public void onUnresolvedBill(String message) {
            // Có thể đã có tiền vào máy mà không giải thích được: ghi lại và dừng tiền mặt tới khi nhân viên đối soát.
            cashPrefs.edit().putBoolean("unresolved", true).putString("unresolved_msg", message).apply();
            acceptor.setEscrowPolicy(null);
            acceptor.setEnabled(false);
            onReview(message + ". Vui lòng báo nhân viên.");
        }

        @Override
        public void onLog(String line) {
        }
    };

    public PaymentViewModel() {
        this(new KioskRepository(), KioskApp.get().billAcceptor());
    }

    public PaymentViewModel(KioskRepository repository, BillAcceptorManager acceptor) {
        this.repository = repository;
        this.acceptor = acceptor;
        this.cashPrefs = KioskApp.get().getSharedPreferences("cash_session", Context.MODE_PRIVATE);
        this.dbHelper = KioskDbHelper.getInstance(KioskApp.get());

        PaymentUiState init = new PaymentUiState();
        init.setCashReady(acceptor.isReady());
        init.setCashStatusText(acceptor.isReady() ? "" : acceptor.getLinkDetail());
        uiState.setValue(init);

        acceptor.addListener(acceptorListener);
        restoreCashSession();
    }

    public LiveData<PaymentUiState> getUiState() { return uiState; }

    public LiveData<PaidEvent> getPaidEvent() { return paidEvent; }

    public List<Long> getAmounts() { return amounts; }

    private PaymentUiState current() {
        PaymentUiState s = uiState.getValue();
        return s != null ? s : new PaymentUiState();
    }

    private static List<Long> parseAmounts(String raw) {
        List<Long> out = new java.util.ArrayList<>();
        if (raw != null) {
            for (String part : raw.split(",")) {
                try {
                    long v = Long.parseLong(part.trim());
                    if (v > 0) out.add(v);
                } catch (NumberFormatException ignored) {
                    // bỏ giá trị sai
                }
            }
        }
        if (out.isEmpty()) return Arrays.asList(80_000L, 100_000L, 200_000L);
        return out;
    }

    private static String fmt(long vnd) {
        return NumberFormat.getInstance(new Locale("vi", "VN")).format(vnd) + " VND";
    }

    // ------------------------------------------------------------------ chọn số tiền / số lượng & giảm giá / phương thức

    public void goToPage2() {
        PaymentUiState s = current().copy();
        s.setStatus(PaymentUiState.Status.HOME);
        if (amounts != null && !amounts.isEmpty()) {
            s.setSelectedPackageIndex(0);
            s.setUnitPrice(amounts.get(0));
            s.setSelectedAmount(amounts.get(0));
        }
        s.setMessage(null);
        uiState.setValue(s);
    }

    public void selectPackage(int index) {
        if (amounts == null || index < 0 || index >= amounts.size()) return;
        PaymentUiState s = current().copy();
        s.setSelectedPackageIndex(index);
        s.setUnitPrice(amounts.get(index));
        s.setSelectedAmount(amounts.get(index));
        uiState.setValue(s);
    }

    public void proceedToQuantityDiscount() {
        PaymentUiState s = current().copy();
        if (s.getUnitPrice() <= 0 && amounts != null && !amounts.isEmpty()) {
            s.setUnitPrice(amounts.get(0));
            s.setSelectedPackageIndex(0);
        }
        s.setStatus(PaymentUiState.Status.QUANTITY_DISCOUNT);
        s.setQuantity(1);
        s.setDiscountCode(null);
        s.setDiscountAmount(0);
        s.setDiscountMessage(null);
        s.setSelectedAmount(s.getUnitPrice());
        s.setMessage(null);
        uiState.setValue(s);
    }

    public void backToPage1() {
        resetToSelection(null);
    }

    public void backToPage2() {
        PaymentUiState s = current().copy();
        s.setStatus(PaymentUiState.Status.HOME);
        s.setMessage(null);
        uiState.setValue(s);
    }

    public void selectAmount(long unitPrice) {
        PaymentUiState s = current().copy();
        s.setUnitPrice(unitPrice);
        s.setSelectedAmount(unitPrice);
        if (amounts != null) {
            int idx = amounts.indexOf(unitPrice);
            if (idx >= 0) s.setSelectedPackageIndex(idx);
        }
        uiState.setValue(s);
    }

    public void increaseQuantity() {
        PaymentUiState s = current().copy();
        if (s.getStatus() != PaymentUiState.Status.QUANTITY_DISCOUNT) return;
        if (s.getQuantity() >= 99) return;
        s.setQuantity(s.getQuantity() + 1);
        recalculateTotal(s);
        uiState.setValue(s);
    }

    public void decreaseQuantity() {
        PaymentUiState s = current().copy();
        if (s.getStatus() != PaymentUiState.Status.QUANTITY_DISCOUNT) return;
        if (s.getQuantity() <= 1) return;
        s.setQuantity(s.getQuantity() - 1);
        recalculateTotal(s);
        uiState.setValue(s);
    }

    public void applyDiscount(String rawCode) {
        PaymentUiState s = current().copy();
        if (s.getStatus() != PaymentUiState.Status.QUANTITY_DISCOUNT) return;
        if (rawCode == null || rawCode.trim().isEmpty()) {
            s.setDiscountCode(null);
            s.setDiscountAmount(0);
            s.setDiscountMessage(null);
            recalculateTotal(s);
            uiState.setValue(s);
            return;
        }

        String code = rawCode.trim().toUpperCase();
        long subtotal = s.getSubtotal();

        // 1. Kiểm tra CSDL SQLite của Android trước
        LocalDiscount local = dbHelper.getDiscount(code);
        if (local != null) {
            if (local.minOrderAmount > 0 && subtotal < local.minOrderAmount) {
                s.setDiscountMessage("Đơn tối thiểu " + fmt(local.minOrderAmount) + " mới dùng được mã này");
                s.setDiscountCode(null);
                s.setDiscountAmount(0);
            } else {
                long disc = KioskDbHelper.calculateDiscount(local, subtotal);
                s.setDiscountCode(code);
                s.setDiscountAmount(disc);
                s.setDiscountMessage("Áp dụng mã " + code + " (-" + fmt(disc) + ")");
            }
            recalculateTotal(s);
            uiState.setValue(s);
        } else {
            // 2. Thử gọi validateDiscount lên Server
            repository.validateDiscount(code, subtotal, new ResultCallback<ValidateDiscountResponse>() {
                @Override
                public void onSuccess(ValidateDiscountResponse res) {
                    PaymentUiState current = current().copy();
                    if (current.getStatus() != PaymentUiState.Status.QUANTITY_DISCOUNT) return;
                    if (res.isValid) {
                        current.setDiscountCode(res.code);
                        current.setDiscountAmount(res.discountAmount);
                        current.setDiscountMessage("Áp dụng mã " + res.code + " (-" + fmt(res.discountAmount) + ")");
                    } else {
                        current.setDiscountCode(null);
                        current.setDiscountAmount(0);
                        current.setDiscountMessage(res.message != null ? res.message : "Mã không hợp lệ");
                    }
                    recalculateTotal(current);
                    uiState.setValue(current);
                }

                @Override
                public void onError(String message) {
                    PaymentUiState current = current().copy();
                    if (current.getStatus() != PaymentUiState.Status.QUANTITY_DISCOUNT) return;
                    current.setDiscountCode(null);
                    current.setDiscountAmount(0);
                    current.setDiscountMessage(message);
                    recalculateTotal(current);
                    uiState.setValue(current);
                }
            });
        }
    }

    private void recalculateTotal(PaymentUiState s) {
        long subtotal = s.getSubtotal();
        long disc = s.getDiscountAmount();
        if (s.getDiscountCode() != null) {
            LocalDiscount local = dbHelper.getDiscount(s.getDiscountCode());
            if (local != null) {
                disc = KioskDbHelper.calculateDiscount(local, subtotal);
                s.setDiscountAmount(disc);
            }
        }
        long finalAmount = Math.max(0, subtotal - disc);
        s.setSelectedAmount(finalAmount);
    }

    public void proceedToMethod() {
        PaymentUiState s = current().copy();
        if (s.getStatus() != PaymentUiState.Status.QUANTITY_DISCOUNT) return;
        if (s.getSelectedAmount() == null || s.getSelectedAmount() <= 0) {
            s.setMessage("Số tiền thanh toán phải lớn hơn 0");
            uiState.setValue(s);
            return;
        }
        s.setStatus(PaymentUiState.Status.METHOD);
        s.setMessage(null);
        uiState.setValue(s);
        acceptor.connect(); // đảm bảo đang thử kết nối đầu nhận tiền
    }

    public void backToQuantity() {
        PaymentUiState s = current().copy();
        if (s.getStatus() != PaymentUiState.Status.METHOD) return;
        s.setStatus(PaymentUiState.Status.QUANTITY_DISCOUNT);
        s.setMessage(null);
        uiState.setValue(s);
    }

    public void backToHome() {
        resetToSelection(null);
    }

    public void backToPriceSelection() {
        resetToSelection(null);
    }

    // ------------------------------------------------------------------ CHUYỂN KHOẢN

    public void chooseTransfer() {
        PaymentUiState now = current();
        if (now.getStatus() != PaymentUiState.Status.METHOD) return;
        Long amount = now.getSelectedAmount();
        if (amount == null || amount <= 0) return;

        final int gen = ++generation;
        PaymentUiState creating = now.copy();
        creating.setStatus(PaymentUiState.Status.CREATING);
        creating.setMessage(null);
        creating.setBusy(true);
        uiState.setValue(creating);

        activeCall = repository.createOrder(amount, now.getDiscountCode(), new ResultCallback<OrderResponse>() {
            @Override
            public void onSuccess(OrderResponse order) {
                if (gen != generation) return;

                Bitmap bitmap;
                try {
                    bitmap = QrCodeGenerator.generate(order.qrCode);
                } catch (Exception e) {
                    activeOrderId = order.orderId;
                    cancelAndReset("Không hiển thị được mã QR, vui lòng thử lại.");
                    return;
                }

                activeOrderId = order.orderId;
                int usable = Math.max(5, order.expiresInSeconds - CLIENT_MARGIN_SECONDS);
                deadlineElapsedMs = SystemClock.elapsedRealtime() + usable * 1000L;

                PaymentUiState s = current().copy();
                s.setStatus(PaymentUiState.Status.WAITING);
                s.setQrBitmap(bitmap);
                s.setOrderId(order.orderId);
                s.setSelectedAmount(order.amount);
                s.setRemainingSeconds(usable);
                s.setBusy(false);
                s.setMessage(null);
                uiState.setValue(s);

                main.removeCallbacks(ticker);
                main.postDelayed(ticker, 1000);
                pollOnce(gen);
            }

            @Override
            public void onError(String message) {
                if (gen != generation) return;
                resetToSelection(message);
            }
        });
    }

    private void pollOnce(final int gen) {
        if (gen != generation || activeOrderId == null) return;

        activeCall = repository.pollOrder(activeOrderId, LONG_POLL_SECONDS, new ResultCallback<OrderResponse>() {
            @Override
            public void onSuccess(OrderResponse order) {
                if (gen != generation) return;
                String status = order.status == null ? "" : order.status;
                switch (status) {
                    case "PAID":
                        onTransferPaid(order);
                        break;
                    case "REVIEW":
                        onReview("Giao dịch cần được nhân viên kiểm tra. Vui lòng giữ lại biên lai chuyển khoản.");
                        break;
                    case "PENDING":
                        main.postDelayed(() -> pollOnce(gen), 300);
                        break;
                    default:
                        resetToSelection("Giao dịch đã hết hạn hoặc bị huỷ. Vui lòng thử lại.");
                        break;
                }
            }

            @Override
            public void onError(String message) {
                if (gen != generation) return;
                main.postDelayed(() -> pollOnce(gen), 3000);
            }
        });
    }

    /** Người dùng bấm Huỷ ở màn QR. */
    public void cancel() {
        PaymentUiState s = current();
        if (s.getStatus() != PaymentUiState.Status.WAITING || s.isBusy()) return;
        cancelAndReset(null);
    }

    /** Server quyết định kết quả cuối: nếu đúng lúc đó đã được trả tiền thì vẫn là PAID. */
    private void cancelAndReset(final String idleMessage) {
        final String orderId = activeOrderId;
        if (orderId == null) {
            resetToSelection(idleMessage);
            return;
        }

        final int gen = ++generation;
        stopTransferWork();

        PaymentUiState busy = current().copy();
        busy.setBusy(true);
        uiState.setValue(busy);

        repository.cancelOrder(orderId, new ResultCallback<OrderResponse>() {
            @Override
            public void onSuccess(OrderResponse order) {
                if (gen != generation) return;
                if ("PAID".equals(order.status)) {
                    onTransferPaid(order);
                } else if ("REVIEW".equals(order.status)) {
                    onReview("Giao dịch cần được nhân viên kiểm tra. Vui lòng giữ lại biên lai chuyển khoản.");
                } else {
                    resetToSelection(idleMessage);
                }
            }

            @Override
            public void onError(String message) {
                if (gen != generation) return;
                resetToSelection("Không xác nhận được việc huỷ đơn. Nếu bạn đã chuyển tiền, vui lòng liên hệ nhân viên.");
            }
        });
    }

    private void onTransferPaid(OrderResponse order) {
        generation++;
        stopTransferWork();
        final String orderId = order.orderId;
        activeOrderId = null;

        // Lưu vào SQLite Database của Android
        PaymentUiState s = current();
        LocalTransaction tx = new LocalTransaction();
        tx.orderId = order.orderId;
        tx.type = "TRANSFER";
        tx.amount = order.amount;
        tx.unitPrice = s.getUnitPrice();
        tx.quantity = s.getQuantity();
        tx.discountCode = order.discountCode != null ? order.discountCode : s.getDiscountCode();
        tx.discountAmount = order.discountAmount;
        tx.status = "PAID";
        tx.createdAt = System.currentTimeMillis();
        if (order.transaction != null) {
            tx.bankTxnId = order.transaction.transactionId;
            tx.bankAccount = order.transaction.bankAccount;
            tx.content = order.transaction.content;
            tx.referenceNumber = order.transaction.referenceNumber;
        }
        dbHelper.insertTransaction(tx);

        finishPaid(orderId, order.amount, "QR");
    }

    // ------------------------------------------------------------------ TIỀN MẶT

    public void chooseCash() {
        PaymentUiState s = current();
        if (s.getStatus() != PaymentUiState.Status.METHOD) return;
        Long amount = s.getSelectedAmount();
        if (amount == null || amount <= 0) return;

        if (cashPrefs.getLong("inserted", 0) > 0 || cashPrefs.getLong("orphan", 0) > 0
                || cashPrefs.getBoolean("unresolved", false)) {
            PaymentUiState n = s.copy();
            n.setMessage("Có giao dịch tiền mặt chưa được xử lý. Vui lòng báo nhân viên.");
            uiState.setValue(n);
            return;
        }

        if (!acceptor.isReady()) {
            PaymentUiState n = s.copy();
            n.setMessage("Máy nhận tiền chưa sẵn sàng. " + acceptor.getLinkDetail());
            uiState.setValue(n);
            acceptor.connect();
            return;
        }

        cashPrice = amount;
        cashInserted = 0;
        persistCash();
        enterCash(null);
    }

    private void enterCash(String message) {
        // Chỉ nhận tờ có mệnh giá <= số tiền còn thiếu (máy không thối tiền).
        acceptor.setEscrowPolicy(vnd -> vnd > 0 && vnd <= cashPrice - cashInserted);
        acceptor.setEnabled(true);

        PaymentUiState n = current().copy();
        n.setStatus(PaymentUiState.Status.CASH);
        n.setSelectedAmount(cashPrice);
        n.setCashInserted(cashInserted);
        n.setMessage(message);
        n.setBusy(false);
        uiState.setValue(n);
        armCashIdle();
    }

    private void handleStacked(int vnd) {
        if (current().getStatus() != PaymentUiState.Status.CASH) {
            // Tờ tiền đã vào két nhưng không còn phiên tiền mặt: KHÔNG được bỏ qua âm thầm.
            long orphan = cashPrefs.getLong("orphan", 0) + vnd;
            cashPrefs.edit().putLong("orphan", orphan).apply();
            onReview("Máy đã nhận " + fmt(vnd) + " ngoài giao dịch. Vui lòng báo nhân viên.");
            return;
        }

        cashInserted += vnd;
        persistCash();

        if (cashInserted >= cashPrice) {
            onCashPaid();
            return;
        }

        PaymentUiState n = current().copy();
        n.setCashInserted(cashInserted);
        n.setMessage("Đã nhận " + fmt(vnd) + ".");
        uiState.setValue(n);
        armCashIdle();
    }

    private void onCashPaid() {
        acceptor.setEscrowPolicy(null);
        acceptor.setEnabled(false);
        main.removeCallbacks(cashIdle);

        long paid = cashInserted;
        String orderId = "CASH" + System.currentTimeMillis();
        clearCashSession();

        // Lưu vào SQLite Database của Android
        PaymentUiState s = current();
        LocalTransaction tx = new LocalTransaction();
        tx.orderId = orderId;
        tx.type = "CASH";
        tx.amount = paid;
        tx.unitPrice = s.getUnitPrice();
        tx.quantity = s.getQuantity();
        tx.discountCode = s.getDiscountCode();
        tx.discountAmount = s.getDiscountAmount();
        tx.status = "PAID";
        tx.createdAt = System.currentTimeMillis();
        dbHelper.insertTransaction(tx);

        finishPaid(orderId, paid, "CASH");
    }

    /** Người dùng bấm Huỷ ở màn tiền mặt: chỉ được khi chưa bỏ tiền vào (máy không hoàn tiền). */
    public void cancelCash() {
        if (current().getStatus() != PaymentUiState.Status.CASH) return;
        if (cashInserted > 0 || acceptor.hasPendingBill()) {
            PaymentUiState n = current().copy();
            n.setMessage("Đã nhận tiền nên không thể huỷ. Vui lòng bỏ đủ số tiền hoặc báo nhân viên.");
            uiState.setValue(n);
            return;
        }
        cancelCashInternal(null);
    }

    private void cancelCashInternal(String message) {
        main.removeCallbacks(cashIdle);
        acceptor.setEscrowPolicy(null);
        acceptor.setEnabled(false);
        clearCashSession();
        resetToSelection(message);
    }

    private void onCashIdleTimeout() {
        if (current().getStatus() != PaymentUiState.Status.CASH || cashInserted > 0) return;
        if (acceptor.hasPendingBill()) {
            armCashIdle(); // đang có tờ chờ xác nhận vào két: chưa được huỷ, hẹn lại
            return;
        }
        cancelCashInternal("Hết thời gian chờ, vui lòng chọn lại.");
    }

    private void armCashIdle() {
        main.removeCallbacks(cashIdle);
        if (cashInserted == 0) main.postDelayed(cashIdle, CASH_IDLE_MS);
    }

    /** Gọi từ Activity khi quay lại màn chính (vd: sau khi thoát màn Chẩn đoán) để đặt lại trạng thái đầu nhận tiền. */
    public void reassertCashState() {
        if (current().getStatus() == PaymentUiState.Status.CASH) {
            acceptor.setEscrowPolicy(vnd -> vnd > 0 && vnd <= cashPrice - cashInserted);
            acceptor.setEnabled(true);
        } else {
            acceptor.setEscrowPolicy(null);
            acceptor.setEnabled(false);
        }
    }

    private void persistCash() {
        cashPrefs.edit().putLong("price", cashPrice).putLong("inserted", cashInserted).apply();
    }

    private void clearCashSession() {
        cashPrice = 0;
        cashInserted = 0;
        cashPrefs.edit().remove("price").remove("inserted").apply();
    }

    /** Sau khi khởi động lại app giữa chừng: khôi phục tiền đã nhận để không mất tiền khách. */
    private void restoreCashSession() {
        long price = cashPrefs.getLong("price", 0);
        long inserted = cashPrefs.getLong("inserted", 0);
        long orphan = cashPrefs.getLong("orphan", 0);

        if (price > 0 && inserted > 0) {
            cashPrice = price;
            cashInserted = inserted;
            if (inserted >= price) {
                onReview("Có giao dịch tiền mặt chưa hoàn tất (đã nhận " + fmt(inserted) + "). Vui lòng báo nhân viên.");
            } else {
                enterCash("Tiếp tục giao dịch dang dở: đã nhận " + fmt(inserted) + ".");
            }
        } else if (orphan > 0) {
            onReview("Có " + fmt(orphan) + " đã vào máy ngoài giao dịch. Vui lòng báo nhân viên.");
        } else if (cashPrefs.getBoolean("unresolved", false)) {
            onReview(cashPrefs.getString("unresolved_msg", "Có giao dịch tiền mặt chưa được đối soát")
                    + ". Vui lòng báo nhân viên.");
        }
    }

    // ------------------------------------------------------------------ kết quả chung

    private void finishPaid(String orderId, long amount, String method) {
        PaymentUiState s = current().copy();
        s.setStatus(PaymentUiState.Status.PAID);
        s.setBusy(false);
        s.setOrderId(orderId);
        s.setSelectedAmount(amount);
        s.setPaidMethod(method);
        s.setMessage(null);
        uiState.setValue(s);

        paidEvent.setValue(new PaidEvent(orderId, amount, method));
        main.removeCallbacks(autoReset);
        main.postDelayed(autoReset, RESULT_AUTO_RESET_MS);
    }

    private void onReview(String message) {
        generation++;
        stopTransferWork();
        activeOrderId = null;

        PaymentUiState s = current().copy();
        s.setStatus(PaymentUiState.Status.REVIEW);
        s.setBusy(false);
        s.setMessage(message);
        uiState.setValue(s);

        main.removeCallbacks(autoReset);
        main.postDelayed(autoReset, REVIEW_AUTO_RESET_MS);
    }

    /** Activity gọi sau khi đã điều khiển máy xong, để sự kiện không bị phát lại. */
    public void onPaidEventHandled() {
        paidEvent.setValue(null);
    }

    /** Về màn chọn giá (nút "Xong", tự động, hoặc sau lỗi). */
    public void resetToSelection(String message) {
        generation++;
        stopTransferWork();
        main.removeCallbacks(autoReset);
        activeOrderId = null;

        // Không để lại đầu nhận tiền ở trạng thái đang nhận khi không còn giao dịch tiền mặt.
        acceptor.setEscrowPolicy(null);
        acceptor.setEnabled(false);

        PaymentUiState s = new PaymentUiState();
        s.setCashReady(acceptor.isReady());
        s.setCashStatusText(acceptor.isReady() ? "" : acceptor.getLinkDetail());
        s.setMessage(message);
        uiState.setValue(s);
    }

    private void stopTransferWork() {
        main.removeCallbacks(ticker);
        if (activeCall != null) {
            activeCall.cancel();
            activeCall = null;
        }
    }

    @Override
    protected void onCleared() {
        generation++;
        stopTransferWork();
        acceptor.removeListener(acceptorListener);
        main.removeCallbacksAndMessages(null);
        // Chuyển khoản đang chờ: đơn phía server tự hết hạn; có tiền về sau đó -> server đánh dấu REVIEW.
        // Tiền mặt đang dở: phiên được lưu trong SharedPreferences và khôi phục khi mở lại app.
    }
}
