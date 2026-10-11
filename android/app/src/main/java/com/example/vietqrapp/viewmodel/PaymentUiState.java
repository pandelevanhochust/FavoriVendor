package com.example.vietqrapp.viewmodel;

import android.graphics.Bitmap;

public class PaymentUiState {

    public enum Status {
        IDLE,       // màn chọn giá
        CREATING,   // đang xin QR từ server
        WAITING,    // đang hiện QR, chờ khách chuyển khoản
        PAID,       // server xác nhận đã nhận đủ tiền
        REVIEW      // có tiền về nhưng cần nhân viên xử lý (sai số tiền, trả muộn...)
    }

    private Status status = Status.IDLE;
    private Long selectedAmount;
    private Bitmap qrBitmap;
    private String orderId;
    private int remainingSeconds;
    private boolean busy;          // đang huỷ/kiểm tra lần cuối -> khoá nút
    private String message;        // thông báo lỗi/thông tin cho người dùng

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public Long getSelectedAmount() { return selectedAmount; }
    public void setSelectedAmount(Long selectedAmount) { this.selectedAmount = selectedAmount; }

    public Bitmap getQrBitmap() { return qrBitmap; }
    public void setQrBitmap(Bitmap qrBitmap) { this.qrBitmap = qrBitmap; }

    public String getOrderId() { return orderId; }
    public void setOrderId(String orderId) { this.orderId = orderId; }

    public int getRemainingSeconds() { return remainingSeconds; }
    public void setRemainingSeconds(int remainingSeconds) { this.remainingSeconds = remainingSeconds; }

    public boolean isBusy() { return busy; }
    public void setBusy(boolean busy) { this.busy = busy; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    /** Bản sao để LiveData luôn nhận đối tượng mới. */
    public PaymentUiState copy() {
        PaymentUiState c = new PaymentUiState();
        c.status = status;
        c.selectedAmount = selectedAmount;
        c.qrBitmap = qrBitmap;
        c.orderId = orderId;
        c.remainingSeconds = remainingSeconds;
        c.busy = busy;
        c.message = message;
        return c;
    }
}
