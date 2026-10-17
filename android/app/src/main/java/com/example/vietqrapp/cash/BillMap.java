package com.example.vietqrapp.cash;

import android.content.SharedPreferences;

/**
 * Bảng gán "loại tờ tiền" (0x40, 0x41, ...) -> mệnh giá VND.
 * Đầu nhận tiền chỉ báo THỨ TỰ loại tờ (thứ nhất, thứ hai, ...). Mệnh giá cụ thể phụ thuộc
 * firmware tiền tệ và DIP switch của từng máy, nên KHÔNG đoán mà để bạn hiệu chuẩn trong màn hình Chẩn đoán.
 * Loại chưa gán (0) sẽ bị trả lại.
 */
public final class BillMap {

    public static final int FIRST = 0x40;
    public static final int LAST = 0x47;

    private BillMap() {
    }

    private static String key(int type) {
        return "vnd_" + type;
    }

    public static int getVnd(SharedPreferences prefs, int type) {
        int v = prefs.getInt(key(type), -1);
        if (v >= 0) {
            return v;
        }
        // Mặc định theo thứ tự nhãn chuẩn của máy nhận tiền ICT TP74 / VND6:
        // 0x40: 10.000đ, 0x41: 20.000đ, 0x42: 50.000đ, 0x43: 100.000đ, 0x44: 200.000đ, 0x45: 500.000đ
        switch (type) {
            case 0x40: return 10_000;
            case 0x41: return 20_000;
            case 0x42: return 50_000;
            case 0x43: return 100_000;
            case 0x44: return 200_000;
            case 0x45: return 500_000;
            default: return 0;
        }
    }

    public static void setVnd(SharedPreferences prefs, int type, int vnd) {
        prefs.edit().putInt(key(type), vnd).apply();
    }

    public static String describe(SharedPreferences prefs) {
        StringBuilder sb = new StringBuilder();
        for (int t = FIRST; t <= LAST; t++) {
            int v = getVnd(prefs, t);
            sb.append(String.format("0x%02X = %s%n", t, v > 0 ? v + " VND" : "(chưa gán)"));
        }
        return sb.toString().trim();
    }
}
