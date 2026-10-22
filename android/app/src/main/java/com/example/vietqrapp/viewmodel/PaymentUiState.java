package com.example.vietqrapp.viewmodel;

import android.graphics.Bitmap;

public class PaymentUiState {

    public enum Status {
        PAGE1,              // màn 1: giới thiệu (Tiếng Việt / English / Tiếp tục)
        HOME,               // màn 2: chọn gói chụp (Bước 1/3)
        QUANTITY_DISCOUNT,  // màn 3: chọn số lượng & nhập mã giảm giá (Bước 2/3)
        METHOD,             // màn chọn Tiền mặt / Chuyển khoản
        CREATING,           // chuyển khoản: đang xin QR từ server (Bước 3/3)
        WAITING,            // chuyển khoản: hiện QR, chờ khách chuyển (Bước 3/3)
        CASH,               // tiền mặt: chờ khách cho tiền vào máy (Bước 3/3)
        PAID,               // màn 5: đã thanh toán đủ (Cảm ơn & Số thứ tự)
        REVIEW              // cần nhân viên kiểm tra
    }

    private Status status = Status.PAGE1;
    private int selectedPackageIndex = 0; // 0, 1, 2
    private Long selectedAmount;     // Số tiền cuối cùng cần thanh toán
    private long unitPrice;          // Đơn giá ban đầu
    private int quantity = 1;        // Số lượng
    private String discountCode;     // Mã giảm giá đã áp dụng
    private long discountAmount;     // Số tiền giảm
    private String discountMessage;  // Thông báo áp dụng mã giảm giá
    private String volumeDiscountHint; // Thông báo ưu đãi số lượng (Ví dụ: Từ 2 tấm chỉ còn 26k/tấm)

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

    public long getUnitPrice() { return unitPrice; }
    public void setUnitPrice(long unitPrice) { this.unitPrice = unitPrice; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public String getDiscountCode() { return discountCode; }
    public void setDiscountCode(String discountCode) { this.discountCode = discountCode; }

    public long getDiscountAmount() { return discountAmount; }
    public void setDiscountAmount(long discountAmount) { this.discountAmount = discountAmount; }

    public String getDiscountMessage() { return discountMessage; }
    public void setDiscountMessage(String discountMessage) { this.discountMessage = discountMessage; }

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

    public String getVolumeDiscountHint() { return volumeDiscountHint; }
    public void setVolumeDiscountHint(String volumeDiscountHint) { this.volumeDiscountHint = volumeDiscountHint; }

    public String getCashStatusText() { return cashStatusText; }
    public void setCashStatusText(String cashStatusText) { this.cashStatusText = cashStatusText; }

    public String getPaidMethod() { return paidMethod; }
    public void setPaidMethod(String paidMethod) { this.paidMethod = paidMethod; }
    public int getSelectedPackageIndex() { return selectedPackageIndex; }
    public void setSelectedPackageIndex(int selectedPackageIndex) { this.selectedPackageIndex = selectedPackageIndex; }

    /** Tính số tiền trước giảm = unitPrice * quantity */
    public long getSubtotal() {
        return unitPrice * Math.max(1, quantity);
    }

    /** Bản sao để LiveData luôn nhận đối tượng mới. */
    public PaymentUiState copy() {
        PaymentUiState c = new PaymentUiState();
        c.status = status;
        c.selectedPackageIndex = selectedPackageIndex;
        c.selectedAmount = selectedAmount;
        c.unitPrice = unitPrice;
        c.quantity = quantity;
        c.discountCode = discountCode;
        c.discountAmount = discountAmount;
        c.discountMessage = discountMessage;
        c.volumeDiscountHint = volumeDiscountHint;
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
