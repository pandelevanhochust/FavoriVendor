package com.example.vietqrapp.viewmodel;

import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import com.example.vietqrapp.api.KioskRepository;
import com.example.vietqrapp.api.KioskRepository.ResultCallback;
import com.example.vietqrapp.model.OrderResponse;
import com.example.vietqrapp.model.PriceOption;
import com.example.vietqrapp.ui.QrCodeGenerator;

import java.util.Arrays;
import java.util.List;

import retrofit2.Call;

/**
 * Luồng chính:
 *   generateQr() -> server tạo đơn + QR -> hiện QR + đếm ngược
 *   -> long-poll server liên tục -> PAID  => phát PaidEvent (đúng 1 lần) cho Activity điều khiển máy
 *   Hết giờ / bấm Huỷ -> gọi cancel (server quyết định: nếu vừa được trả thì kết quả vẫn là PAID).
 *
 * Trạng thái thanh toán luôn do SERVER quyết định; app chỉ hiển thị.
 */
public class PaymentViewModel extends ViewModel {

    /** App hết hạn sớm hơn server ngần này giây, để việc huỷ luôn xảy ra trước khi server tự expire. */
    private static final int CLIENT_MARGIN_SECONDS = 10;
    private static final int LONG_POLL_SECONDS = 20;
    private static final long RESULT_AUTO_RESET_MS = 8_000;
    private static final long REVIEW_AUTO_RESET_MS = 20_000;

    public static class PaidEvent {
        public final String orderId;
        public final long amount;

        PaidEvent(String orderId, long amount) {
            this.orderId = orderId;
            this.amount = amount;
        }
    }

    private final KioskRepository repository;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final MutableLiveData<PaymentUiState> uiState = new MutableLiveData<>(new PaymentUiState());
    private final MutableLiveData<PaidEvent> paidEvent = new MutableLiveData<>();

    private final List<PriceOption> priceOptions = Arrays.asList(
            new PriceOption("20.000đ", 20_000),
            new PriceOption("50.000đ", 50_000),
            new PriceOption("100.000đ", 100_000),
            new PriceOption("200.000đ", 200_000)
    );

    private int generation;              // tăng mỗi khi bắt đầu/kết thúc một phiên -> bỏ qua callback cũ
    private String activeOrderId;
    private long deadlineElapsedMs;
    private Call<OrderResponse> activeCall;

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
                cancelAndReset("Mã QR đã hết hạn. Vui lòng chọn lại số tiền.");
            } else {
                main.postDelayed(this, 1000);
            }
        }
    };

    private final Runnable autoReset = () -> resetToSelection(null);

    public PaymentViewModel() {
        this(new KioskRepository());
    }

    public PaymentViewModel(KioskRepository repository) {
        this.repository = repository;
    }

    public LiveData<PaymentUiState> getUiState() { return uiState; }

    public LiveData<PaidEvent> getPaidEvent() { return paidEvent; }

    public List<PriceOption> getPriceOptions() { return priceOptions; }

    private PaymentUiState current() {
        PaymentUiState s = uiState.getValue();
        return s != null ? s : new PaymentUiState();
    }

    // ------------------------------------------------------------------ chọn giá

    public void selectPreset(long amount) {
        PaymentUiState s = current().copy();
        s.setSelectedAmount(amount);
        s.setMessage(null);
        uiState.setValue(s);
    }

    public void onCustomAmountChanged(String rawInput) {
        String digits = rawInput.replaceAll("[^0-9]", "");
        Long amount = null;
        if (!digits.isEmpty() && digits.length() <= 12) amount = Long.valueOf(digits);

        PaymentUiState s = current().copy();
        s.setSelectedAmount(amount);
        s.setMessage(null);
        uiState.setValue(s);
    }

    // ------------------------------------------------------------------ tạo QR

    public void generateQr() {
        PaymentUiState now = current();
        if (now.getStatus() != PaymentUiState.Status.IDLE) return;

        Long amount = now.getSelectedAmount();
        if (amount == null || amount <= 0) {
            PaymentUiState s = now.copy();
            s.setMessage("Vui lòng chọn hoặc nhập số tiền hợp lệ");
            uiState.setValue(s);
            return;
        }

        final int gen = ++generation;
        PaymentUiState creating = now.copy();
        creating.setStatus(PaymentUiState.Status.CREATING);
        creating.setMessage(null);
        uiState.setValue(creating);

        activeCall = repository.createOrder(amount, new ResultCallback<OrderResponse>() {
            @Override
            public void onSuccess(OrderResponse order) {
                if (gen != generation) return;

                Bitmap bitmap;
                try {
                    bitmap = QrCodeGenerator.generate(order.qrCode);
                } catch (Exception e) {
                    // Đã tạo đơn ở server nhưng không vẽ được QR -> huỷ đơn đó.
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

    // ------------------------------------------------------------------ chờ thanh toán

    private void pollOnce(final int gen) {
        if (gen != generation || activeOrderId == null) return;

        activeCall = repository.pollOrder(activeOrderId, LONG_POLL_SECONDS, new ResultCallback<OrderResponse>() {
            @Override
            public void onSuccess(OrderResponse order) {
                if (gen != generation) return;
                String status = order.status == null ? "" : order.status;
                switch (status) {
                    case "PAID":
                        onPaid(order);
                        break;
                    case "REVIEW":
                        onReview();
                        break;
                    case "PENDING":
                        // server đã giữ kết nối tới 20s nên không dồn dập; delay nhỏ phòng khi server trả ngay.
                        main.postDelayed(() -> pollOnce(gen), 300);
                        break;
                    default: // EXPIRED, CANCELLED
                        resetToSelection("Giao dịch đã hết hạn hoặc bị huỷ. Vui lòng thử lại.");
                        break;
                }
            }

            @Override
            public void onError(String message) {
                if (gen != generation) return;
                main.postDelayed(() -> pollOnce(gen), 3000); // mất mạng thoáng qua: thử lại
            }
        });
    }

    /** Người dùng bấm Huỷ. */
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

        final int gen = ++generation; // vô hiệu hoá callback poll đang chạy
        stopWork();                   // dừng đếm ngược + huỷ request poll (activeOrderId vẫn giữ nguyên)

        PaymentUiState busy = current().copy();
        busy.setBusy(true);
        uiState.setValue(busy);

        repository.cancelOrder(orderId, new ResultCallback<OrderResponse>() {
            @Override
            public void onSuccess(OrderResponse order) {
                if (gen != generation) return;
                if ("PAID".equals(order.status)) {
                    onPaid(order);
                } else if ("REVIEW".equals(order.status)) {
                    onReview();
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

    // ------------------------------------------------------------------ kết quả

    private void onPaid(OrderResponse order) {
        generation++;
        stopWork();
        final String orderId = order.orderId;
        activeOrderId = null;

        PaymentUiState s = current().copy();
        s.setStatus(PaymentUiState.Status.PAID);
        s.setBusy(false);
        s.setOrderId(orderId);
        s.setSelectedAmount(order.amount);
        s.setMessage(null);
        uiState.setValue(s);

        paidEvent.setValue(new PaidEvent(orderId, order.amount)); // Activity gọi MachineController rồi xác nhận đã xử lý
        main.postDelayed(autoReset, RESULT_AUTO_RESET_MS);
    }

    private void onReview() {
        generation++;
        stopWork();
        activeOrderId = null;

        PaymentUiState s = current().copy();
        s.setStatus(PaymentUiState.Status.REVIEW);
        s.setBusy(false);
        s.setMessage("Giao dịch cần được nhân viên kiểm tra. Vui lòng giữ lại biên lai chuyển khoản.");
        uiState.setValue(s);

        main.postDelayed(autoReset, REVIEW_AUTO_RESET_MS);
    }

    /** Activity gọi sau khi đã điều khiển máy xong, để sự kiện không bị phát lại khi xoay màn hình... */
    public void onPaidEventHandled() {
        paidEvent.setValue(null);
    }

    /** Về màn chọn giá (nút "Xong" hoặc tự động). */
    public void resetToSelection(String message) {
        generation++;
        stopWork();
        main.removeCallbacks(autoReset);
        activeOrderId = null;

        PaymentUiState s = new PaymentUiState();
        s.setMessage(message);
        uiState.setValue(s);
    }

    private void stopWork() {
        main.removeCallbacks(ticker);
        if (activeCall != null) {
            activeCall.cancel();
            activeCall = null;
        }
    }

    @Override
    protected void onCleared() {
        generation++;
        stopWork();
        main.removeCallbacks(autoReset);
        main.removeCallbacksAndMessages(null);
        // Nếu đang chờ: đơn phía server sẽ tự hết hạn. Có tiền về sau đó -> server đánh dấu REVIEW.
    }
}
