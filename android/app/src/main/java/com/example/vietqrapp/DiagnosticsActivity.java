package com.example.vietqrapp;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.ArrayAdapter;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.example.vietqrapp.cash.BillAcceptorManager;
import com.example.vietqrapp.cash.BillMap;
import com.example.vietqrapp.databinding.ActivityDiagnosticsBinding;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Màn hình dành cho nhân viên/kỹ thuật: kiểm chứng giao thức với module thật, hiệu chuẩn mệnh giá,
 * xem nhật ký hex RX/TX. Mở bằng cách nhấn giữ thanh tiêu đề ở màn chính và nhập PIN.
 */
public class DiagnosticsActivity extends AppCompatActivity implements BillAcceptorManager.Listener {

    private static final int MAX_LOG_CHARS = 30_000;

    private ActivityDiagnosticsBinding b;
    private BillAcceptorManager acceptor;
    private boolean calibrating;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        b = ActivityDiagnosticsBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        acceptor = KioskApp.get().billAcceptor();

        // Mở màn hình Lịch sử giao dịch (SQLite)
        b.btnTransactions.setOnClickListener(v -> {
            startActivity(new Intent(this, TransactionsActivity.class));
        });

        // Mở màn hình Quản lý & Tạo mã giảm giá (SQLite & Server)
        b.btnDiscounts.setOnClickListener(v -> {
            startActivity(new Intent(this, DiscountsActivity.class));
        });

        // Cài đặt mức giá các gói chụp (Page 2)
        b.btnPackagePrices.setOnClickListener(v -> showEditPricesDialog());

        // Thay đổi Server URL (Yêu cầu mã PIN 1112)
        b.btnChangeServerUrl.setOnClickListener(v -> promptServerUrlPin());

        b.spParity.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"Parity: None", "Parity: Even", "Parity: Odd"}));

        b.spParity.setSelection(acceptor.getParityIndex());
        b.etBaud.setText(String.valueOf(acceptor.getBaud()));
        b.etVidPid.setText(acceptor.getPreferredVidPid());
        b.swPoll.setChecked(acceptor.isPollEnabled());
        b.swAckCompat.setChecked(acceptor.isEscrowAckCompat());

        b.btnApply.setOnClickListener(v -> applySettings());
        b.btnHandshake.setOnClickListener(v -> acceptor.manualHandshake());
        b.btnReset.setOnClickListener(v -> acceptor.resetDevice());
        b.btnSend.setOnClickListener(v -> sendHex());

        b.swCalib.setOnCheckedChangeListener((btn, checked) -> {
            calibrating = checked;
            acceptor.setEscrowPolicy(null); // luôn trả lại tờ tiền khi hiệu chuẩn
            acceptor.setEnabled(checked);
        });
        b.btnSaveMap.setOnClickListener(v -> saveMapping());
        b.btnFillVnd6.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("Điền gợi ý VND6?")
                .setMessage("Đây chỉ là GỢI Ý theo thứ tự trên nhãn máy (10k, 20k, 50k, 100k, 200k, 500k). "
                        + "Hãy kiểm tra bằng tờ tiền thật: ở chế độ hiệu chuẩn, nhét từng loại và xem mã 0x4X có khớp không.")
                .setPositiveButton("Điền", (d, w) -> {
                    int[] vnd = {10_000, 20_000, 50_000, 100_000, 200_000, 500_000};
                    for (int i = 0; i < vnd.length; i++) BillMap.setVnd(acceptor.getPrefs(), BillMap.FIRST + i, vnd[i]);
                    refreshMap();
                })
                .setNegativeButton("Huỷ", null)
                .show());

        b.btnClearCash.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("Xoá bản ghi tiền mặt?")
                .setMessage("Chỉ làm sau khi đã đối soát và hoàn tiền/ghi nhận thủ công cho khách.")
                .setPositiveButton("Xoá", (d, w) -> {
                    getSharedPreferences("cash_session", Context.MODE_PRIVATE).edit().clear().apply();
                    refreshCashSession();
                })
                .setNegativeButton("Huỷ", null)
                .show());

        b.btnCopyLog.setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("log", acceptor.getLogText()));
            Toast.makeText(this, "Đã sao chép log", Toast.LENGTH_SHORT).show();
        });
        b.btnClearLog.setOnClickListener(v -> {
            acceptor.clearLog();
            b.tvLog.setText("");
        });
    }

    @Override
    protected void onStart() {
        super.onStart();
        acceptor.addListener(this);
        refreshAll();
    }

    @Override
    protected void onStop() {
        super.onStop();
        acceptor.removeListener(this);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (calibrating) {
            acceptor.setEnabled(false); // MainActivity.onResume sẽ đặt lại đúng trạng thái
        }
    }

    private void applySettings() {
        int baud;
        try {
            baud = Integer.parseInt(b.etBaud.getText().toString().trim());
        } catch (NumberFormatException e) {
            Toast.makeText(this, "Baud không hợp lệ", Toast.LENGTH_SHORT).show();
            return;
        }
        acceptor.setPollEnabled(b.swPoll.isChecked());
        acceptor.setEscrowAckCompat(b.swAckCompat.isChecked());
        acceptor.saveSerialSettings(baud, b.spParity.getSelectedItemPosition(), b.etVidPid.getText().toString());
        acceptor.reconnect();
        Toast.makeText(this, "Đã lưu, đang kết nối lại", Toast.LENGTH_SHORT).show();
    }

    private void sendHex() {
        String text = b.etHex.getText().toString().trim();
        if (text.isEmpty()) return;
        String[] tokens = text.split("[\\s,]+");
        byte[] data = new byte[tokens.length];
        try {
            for (int i = 0; i < tokens.length; i++) {
                int v = Integer.parseInt(tokens[i], 16);
                if (v < 0 || v > 255) throw new NumberFormatException();
                data[i] = (byte) v;
            }
        } catch (NumberFormatException e) {
            Toast.makeText(this, "Hex không hợp lệ (mỗi byte 00..FF)", Toast.LENGTH_SHORT).show();
            return;
        }
        acceptor.sendRaw(data);
    }

    private void saveMapping() {
        int type = acceptor.getLastBillType();
        if (type < 0) {
            Toast.makeText(this, "Chưa nhận diện loại tờ tiền nào", Toast.LENGTH_SHORT).show();
            return;
        }
        int vnd;
        try {
            vnd = Integer.parseInt(b.etVnd.getText().toString().trim());
        } catch (NumberFormatException e) {
            Toast.makeText(this, "Mệnh giá không hợp lệ", Toast.LENGTH_SHORT).show();
            return;
        }
        BillMap.setVnd(acceptor.getPrefs(), type, vnd);
        refreshMap();
        Toast.makeText(this, String.format("Đã lưu 0x%02X = %d VND", type, vnd), Toast.LENGTH_SHORT).show();
    }

    private void refreshAll() {
        b.tvLink.setText("Trạng thái: " + acceptor.getLink() + " - " + acceptor.getLinkDetail());
        b.tvDevices.setText(acceptor.describeUsbDevices());
        refreshMap();
        refreshCashSession();

        // log hiển thị mới nhất ở trên
        String[] lines = acceptor.getLogText().split("\n");
        List<String> list = new ArrayList<>();
        for (String l : lines) if (!l.isEmpty()) list.add(l);
        Collections.reverse(list);
        b.tvLog.setText(android.text.TextUtils.join("\n", list)); // String.join cần API 26, minSdk là 24
        updateLastBill();
    }

    private void refreshMap() {
        b.tvMap.setText(BillMap.describe(acceptor.getPrefs()));
    }

    private void refreshCashSession() {
        android.content.SharedPreferences p = getSharedPreferences("cash_session", Context.MODE_PRIVATE);
        long price = p.getLong("price", 0);
        long inserted = p.getLong("inserted", 0);
        long orphan = p.getLong("orphan", 0);
        boolean unresolved = p.getBoolean("unresolved", false);
        if (price == 0 && inserted == 0 && orphan == 0 && !unresolved) {
            b.tvCashSession.setText("Không có bản ghi tồn đọng.");
        } else {
            b.tvCashSession.setText("Giá: " + price + " VND, đã nhận: " + inserted
                    + " VND, tiền ngoài giao dịch: " + orphan + " VND."
                    + (unresolved ? "\nChưa đối soát: " + p.getString("unresolved_msg", "") : "")
                    + "\nCần đối soát với két tiền.");
        }
    }

    private void updateLastBill() {
        int t = acceptor.getLastBillType();
        b.tvLastBill.setText(t < 0 ? "Loại tờ tiền vừa nhận diện: (chưa có)"
                : String.format("Loại tờ tiền vừa nhận diện: 0x%02X", t));
    }

    // ------------------------------------------------------------------ BillAcceptorManager.Listener

    @Override
    public void onLinkChanged(BillAcceptorManager.Link link, String detail) {
        b.tvLink.setText("Trạng thái: " + link + " - " + detail);
    }

    @Override
    public void onBillSeen(int billType, int vnd) {
        updateLastBill();
        b.etVnd.setText(vnd > 0 ? String.valueOf(vnd) : "");
    }

    @Override
    public void onBillStacked(int vnd) {
    }

    @Override
    public void onBillRefused(int billType, int vnd, String reason) {
    }

    @Override
    public void onDeviceError(String message) {
    }

    @Override
    public void onUnresolvedBill(String message) {
        refreshCashSession();
    }

    @Override
    public void onLog(String line) {
        CharSequence old = b.tvLog.getText();
        String next = line + "\n" + old;
        if (next.length() > MAX_LOG_CHARS) next = next.substring(0, MAX_LOG_CHARS);
        b.tvLog.setText(next);
    }

    private void showEditPricesDialog() {
        android.view.View dialogView = getLayoutInflater().inflate(R.layout.dialog_edit_package_prices, null);
        android.widget.EditText etPrice1 = dialogView.findViewById(R.id.etPricePkg1);
        android.widget.EditText etPrice2 = dialogView.findViewById(R.id.etPricePkg2);
        android.widget.EditText etPrice3 = dialogView.findViewById(R.id.etPricePkg3);
        com.google.android.material.button.MaterialButton btnReset = dialogView.findViewById(R.id.btnResetDefaultPrices);
        com.google.android.material.button.MaterialButton btnCancel = dialogView.findViewById(R.id.btnCancelPriceModal);
        com.google.android.material.button.MaterialButton btnSave = dialogView.findViewById(R.id.btnSavePrices);

        PriceManager pm = PriceManager.getInstance(this);
        etPrice1.setText(String.valueOf(pm.getPrice(0)));
        etPrice2.setText(String.valueOf(pm.getPrice(1)));
        etPrice3.setText(String.valueOf(pm.getPrice(2)));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setView(dialogView)
                .setCancelable(false)
                .create();

        btnReset.setOnClickListener(v -> {
            List<Long> defs = pm.getDefaultPrices();
            etPrice1.setText(String.valueOf(defs.get(0)));
            etPrice2.setText(String.valueOf(defs.get(1)));
            etPrice3.setText(String.valueOf(defs.get(2)));
            Toast.makeText(this, "Đã điền lại mức giá mặc định", Toast.LENGTH_SHORT).show();
        });

        btnCancel.setOnClickListener(v -> dialog.dismiss());

        btnSave.setOnClickListener(v -> {
            String s1 = etPrice1.getText().toString().trim();
            String s2 = etPrice2.getText().toString().trim();
            String s3 = etPrice3.getText().toString().trim();

            if (s1.isEmpty() || s2.isEmpty() || s3.isEmpty()) {
                Toast.makeText(this, "Vui lòng nhập đầy đủ giá cho cả 3 gói", Toast.LENGTH_SHORT).show();
                return;
            }

            long p1, p2, p3;
            try {
                p1 = Long.parseLong(s1);
                p2 = Long.parseLong(s2);
                p3 = Long.parseLong(s3);
            } catch (NumberFormatException e) {
                Toast.makeText(this, "Giá tiền không hợp lệ", Toast.LENGTH_SHORT).show();
                return;
            }

            if (p1 <= 0 || p2 <= 0 || p3 <= 0) {
                Toast.makeText(this, "Giá các gói phải lớn hơn 0 VND", Toast.LENGTH_SHORT).show();
                return;
            }

            pm.setPrices(p1, p2, p3);
            Toast.makeText(this, "Đã lưu cài đặt giá gói chụp thành công!", Toast.LENGTH_LONG).show();
            dialog.dismiss();
        });

        dialog.show();
    }

    private void promptServerUrlPin() {
        final android.widget.EditText input = new android.widget.EditText(this);
        input.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setGravity(android.view.Gravity.CENTER);
        input.setTextSize(22);
        input.setLetterSpacing(0.2f);
        input.setHint("Nhập mã PIN");

        android.widget.FrameLayout container = new android.widget.FrameLayout(this);
        android.widget.FrameLayout.LayoutParams params = new android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
        int margin = (int) (24 * getResources().getDisplayMetrics().density);
        params.leftMargin = margin;
        params.rightMargin = margin;
        params.topMargin = margin / 2;
        params.bottomMargin = margin / 2;
        input.setLayoutParams(params);
        container.addView(input);

        new AlertDialog.Builder(this)
                .setTitle("Xác thực quản trị viên")
                .setMessage("Vui lòng nhập mã PIN bảo mật để thay đổi Server URL:")
                .setView(container)
                .setPositiveButton("Xác nhận", (d, w) -> {
                    String enteredPin = input.getText().toString().trim();
                    if ("1112".equals(enteredPin)) {
                        showEditServerUrlDialog();
                    } else {
                        Toast.makeText(this, "Mã PIN không chính xác! Không có quyền thay đổi Server URL.", Toast.LENGTH_LONG).show();
                    }
                })
                .setNegativeButton("Hủy", null)
                .show();
    }

    private void showEditServerUrlDialog() {
        android.view.View dialogView = getLayoutInflater().inflate(R.layout.dialog_edit_server_url, null);
        android.widget.EditText etUrl = dialogView.findViewById(R.id.etServerUrl);
        com.google.android.material.button.MaterialButton btnReset = dialogView.findViewById(R.id.btnResetDefaultUrl);
        com.google.android.material.button.MaterialButton btnCancel = dialogView.findViewById(R.id.btnCancelUrlModal);
        com.google.android.material.button.MaterialButton btnSave = dialogView.findViewById(R.id.btnSaveServerUrl);

        ServerConfigManager scm = ServerConfigManager.getInstance(this);
        etUrl.setText(scm.getServerUrl());

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setView(dialogView)
                .setCancelable(false)
                .create();

        btnReset.setOnClickListener(v -> {
            etUrl.setText(scm.getDefaultServerUrl());
            Toast.makeText(this, "Đã điền lại Server URL mặc định", Toast.LENGTH_SHORT).show();
        });

        btnCancel.setOnClickListener(v -> dialog.dismiss());

        btnSave.setOnClickListener(v -> {
            String newUrl = etUrl.getText().toString().trim();
            if (newUrl.isEmpty()) {
                Toast.makeText(this, "Vui lòng nhập địa chỉ Server URL", Toast.LENGTH_SHORT).show();
                return;
            }

            if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                Toast.makeText(this, "Server URL phải bắt đầu bằng http:// hoặc https://", Toast.LENGTH_LONG).show();
                return;
            }

            if (!newUrl.endsWith("/")) {
                newUrl += "/";
            }

            scm.setServerUrl(newUrl);
            KioskApp.get().kioskRepository().reloadBaseUrl();

            Toast.makeText(this, "Đã cập nhật Server URL thành công:\n" + newUrl, Toast.LENGTH_LONG).show();
            dialog.dismiss();
        });

        dialog.show();
    }
}
