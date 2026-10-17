package com.example.vietqrapp.viewmodel;

import android.graphics.Bitmap;

public class PaymentUiState {

    public enum Status {
        HOME,       // màn 1: chọn số tiền
        METHOD,     // màn 2: chọn Tiền mặt / Chuyển khoản
        CREATING,   // chuyển khoản: đang xin QR từ server
        WAITING,    // chuyển khoản: hiện QR, chờ khách chuyển
        CASH,       // tiền mặt: chờ khách cho tiền vào máy
        PAID,       // đã thanh toán đủ
        REVIEW      // cần nhân viên kiểm tra
    }

    private Status status = Status.HOME;
    private Long selectedAmount;
    private Bitmap qrBitmap;
    private String orderId;
    private int remainingSeconds;
    private boolean busy;
    private String message;

    private long cashInserted;       // tiền mặt đã vào két
    private boolean cashReady;       // đầu nhận tiền đã sẵn sàng
    private String cashStatusText;   // lý do chưa sẵn sàng
    private String paidMethod;       // "QR" | "CASH"

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

    public long getCashInserted() { return cashInserted; }
    public void setCashInserted(long cashInserted) { this.cashInserted = cashInserted; }

    public boolean isCashReady() { return cashReady; }
    public void setCashReady(boolean cashReady) { this.cashReady = cashReady; }

    public String getCashStatusText() { return cashStatusText; }
    public void setCashStatusText(String cashStatusText) { this.cashStatusText = cashStatusText; }

    public String getPaidMethod() { return paidMethod; }
    public void setPaidMethod(String paidMethod) { this.paidMethod = paidMethod; }

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
        c.cashInserted = cashInserted;
        c.cashReady = cashReady;
        c.cashStatusText = cashStatusText;
        c.paidMethod = paidMethod;
        return c;
    }
}
