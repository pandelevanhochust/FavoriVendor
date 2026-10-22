package com.example.vietqrapp.cash;

/**
 * Hằng số giao thức "ICT106 General Protocol For RS232" (V0.2, International Currency Technologies).
 *
 * Khung truyền: 9600 baud, 8 data bit, PARITY CHẴN (Even), 1 stop bit, full duplex.
 * Mỗi lệnh/sự kiện là MỘT byte, không đóng khung, không checksum.
 * Thời gian đáp ứng tối đa 50 ms; chu kỳ poll khuyến nghị 100~200 ms.
 *
 * Trên máy VND6 (nhận 10.000 ... 500.000 VND): đặt DIP SW SETTING 2, SW2 = OFF để chọn "ICT Protocol"
 * (mặc định ON là Pulse), rồi tắt/bật nguồn máy.
 */
public final class IctProtocol {

    private IctProtocol() {
    }

    public static final int DEFAULT_BAUD = 9600;

    // ---- Lệnh: tablet -> máy nhận tiền ----
    public static final byte CMD_ACK_POWER_UP = 0x02; // xác nhận 80 8F, phải gửi trong 2 giây
    public static final byte CMD_ACCEPT = 0x02;       // nhận tờ tiền đang giữ (escrow)
    public static final byte CMD_REJECT = 0x0F;       // trả lại tờ tiền đang giữ
    public static final byte CMD_POLL = 0x0C;         // hỏi trạng thái
    public static final byte CMD_RESET = 0x30;
    public static final byte CMD_ENABLE = 0x3E;
    public static final byte CMD_DISABLE = 0x5E;
    public static final byte CMD_ESCROW_ACK_COMPAT = (byte) 0x8F; // KHÔNG có trong tài liệu; chỉ bật khi máy thật cần

    // ---- Sự kiện: máy nhận tiền -> tablet ----
    public static final int EVT_POWER_ON = 0x80;      // luôn đi cặp với 0x8F, lặp mỗi 2 giây tới khi nhận 0x02
    public static final int EVT_MARK = 0x8F;          // đi sau 0x80 và sau 0x81
    public static final int EVT_BILL_VALID = 0x81;    // theo sau (8F rồi) 1 byte loại tờ 0x40...
    public static final int EVT_STACKED = 0x10;       // tờ tiền đã vào két -> mới được tính tiền
    public static final int EVT_RETURNED = 0x11;      // tờ tiền đã được trả lại
    public static final int EVT_JAM_STACKED = 0x83;   // đã nhận tiền vào két sau kẹt giấy, theo sau là loại tờ

    // ---- Phản hồi trạng thái (khi poll hoặc sau lệnh bật/tắt) ----
    public static final int STATUS_ENABLED = 0x3E;
    public static final int STATUS_INHIBIT = 0x5E;
    public static final int STATUS_BUSY = 0x71;
    public static final int STATUS_POWER_COMM = 0xA1;
    public static final int STATUS_NO_ERROR = 0x2F;   // "Response when Error Status is Exclusion"
    public static final int STATUS_BILL_REJECT = 0x29;

    public static final int BILL_UNKNOWN = 0x3F;
    public static final int BILL_TYPE_FIRST = 0x40;
    public static final int BILL_TYPE_LAST = 0x4F;

    public static boolean isBillType(int b) {
        return b >= BILL_TYPE_FIRST && b <= BILL_TYPE_LAST;
    }

    /** Mã lỗi theo bảng trạng thái (0x26 không tồn tại, 0x29 là "Bill Reject" xử lý riêng). */
    public static boolean isFaultCode(int b) {
        return (b >= 0x20 && b <= 0x25) || b == 0x27 || b == 0x28 || b == 0x2A;
    }

    public static String faultName(int b) {
        switch (b) {
            case 0x20: return "Motor failure";
            case 0x21: return "Checksum error";
            case 0x22: return "Bill jam (kẹt tiền)";
            case 0x23: return "Bill remove";
            case 0x24: return "Stacker open (mở két)";
            case 0x25: return "Sensor problem";
            case 0x27: return "Bill fish";
            case 0x28: return "Stacker problem (két đầy/lỗi)";
            case 0x2A: return "Invalid command";
            default: return "Lỗi không rõ";
        }
    }

    public static String hex(byte[] data) {
        StringBuilder sb = new StringBuilder();
        for (byte b : data) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(String.format("%02X", b & 0xFF));
        }
        return sb.toString();
    }
}
