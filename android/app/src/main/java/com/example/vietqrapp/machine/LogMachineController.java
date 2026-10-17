package com.example.vietqrapp.machine;

import android.util.Log;

/** Bản mặc định chỉ ghi log. Thay bằng lớp điều khiển phần cứng thật của bạn. */
public class LogMachineController implements MachineController {
    private static final String TAG = "MachineController";

    @Override
    public void onPaymentConfirmed(String orderId, long amount, String method) {
        Log.i(TAG, "ĐÃ THANH TOÁN [" + method + "] order=" + orderId + " amount=" + amount
                + " -> TODO: điều khiển máy tại đây");
    }
}
