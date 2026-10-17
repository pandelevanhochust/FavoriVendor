package com.example.vietqrapp.machine;

/**
 * ĐIỂM GẮN PHẦN CỨNG CỦA MÁY (relay, trả hàng...).
 * Được gọi đúng MỘT lần cho mỗi giao dịch đã thanh toán đủ.
 *
 * @param method "QR" (chuyển khoản, đã được server xác nhận) hoặc "CASH" (tiền mặt, đã vào két)
 */
public interface MachineController {
    void onPaymentConfirmed(String orderId, long amount, String method);
}
