package com.example.vietqrapp.machine;

/**
 * ĐIỂM GẮN PHẦN CỨNG CỦA MÁY.
 * Được gọi đúng MỘT lần cho mỗi đơn sau khi server xác nhận đã nhận đủ tiền.
 * Ví dụ: kích relay mở cửa / trả hàng qua USB-Serial, Bluetooth, GPIO...
 */
public interface MachineController {
    void onPaymentConfirmed(String orderId, long amount);
}
