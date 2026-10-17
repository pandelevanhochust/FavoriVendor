package com.example.vietqrapp;

import android.os.Bundle;
import android.text.InputFilter;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.example.vietqrapp.api.KioskRepository;
import com.example.vietqrapp.databinding.ActivityDiscountsBinding;
import com.example.vietqrapp.db.KioskDbHelper;
import com.example.vietqrapp.db.LocalDiscount;
import com.example.vietqrapp.model.CreateDiscountRequest;
import com.example.vietqrapp.model.DiscountSummaryResponse;
import com.google.android.material.button.MaterialButton;

import java.util.List;

public class DiscountsActivity extends AppCompatActivity {

    private ActivityDiscountsBinding binding;
    private DiscountsAdapter adapter;
    private KioskRepository kioskRepository;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemUI();

        binding = ActivityDiscountsBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        kioskRepository = new KioskRepository();
        adapter = new DiscountsAdapter();
        binding.rvDiscounts.setLayoutManager(new LinearLayoutManager(this));
        binding.rvDiscounts.setAdapter(adapter);

        binding.btnBack.setOnClickListener(v -> finish());
        binding.btnRefresh.setOnClickListener(v -> {
            loadDiscounts();
            Toast.makeText(this, "Đã làm mới danh sách mã giảm giá", Toast.LENGTH_SHORT).show();
        });

        binding.btnOpenCreateDialog.setOnClickListener(v -> showCreateDiscountDialog());

        loadDiscounts();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    /** Tải danh sách mã giảm giá chưa hết hạn từ SQLite */
    private void loadDiscounts() {
        List<LocalDiscount> list = KioskDbHelper.getInstance(this).getUnexpiredDiscounts();

        if (list.isEmpty()) {
            binding.tvEmpty.setVisibility(View.VISIBLE);
            binding.rvDiscounts.setVisibility(View.GONE);
            binding.tvTotalDiscounts.setText("0 mã");
            binding.tvPercentCount.setText("0 mã");
            binding.tvFixedCount.setText("0 mã");
            adapter.setItems(list);
            return;
        }

        binding.tvEmpty.setVisibility(View.GONE);
        binding.rvDiscounts.setVisibility(View.VISIBLE);

        int percentCount = 0;
        int fixedCount = 0;

        for (LocalDiscount d : list) {
            if ("PERCENT".equalsIgnoreCase(d.type) || "PERCENTAGE".equalsIgnoreCase(d.type)) {
                percentCount++;
            } else {
                fixedCount++;
            }
        }

        binding.tvTotalDiscounts.setText(list.size() + " mã");
        binding.tvPercentCount.setText(percentCount + " mã");
        binding.tvFixedCount.setText(fixedCount + " mã");

        adapter.setItems(list);
    }

    /** Hiển thị modal tạo mã giảm giá */
    private void showCreateDiscountDialog() {
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_create_discount, null);

        EditText etCode = dialogView.findViewById(R.id.etDiscountCode);
        EditText etDesc = dialogView.findViewById(R.id.etDiscountDesc);
        RadioGroup rgType = dialogView.findViewById(R.id.rgDiscountType);
        RadioButton rbPercent = dialogView.findViewById(R.id.rbPercent);
        TextView tvValueLabel = dialogView.findViewById(R.id.tvValueLabel);
        EditText etValue = dialogView.findViewById(R.id.etDiscountValue);
        EditText etMinOrder = dialogView.findViewById(R.id.etMinOrderAmount);
        TextView tvMaxDiscountLabel = dialogView.findViewById(R.id.tvMaxDiscountLabel);
        EditText etMaxDiscount = dialogView.findViewById(R.id.etMaxDiscountAmount);
        Spinner spExpiry = dialogView.findViewById(R.id.spExpiryOption);
        MaterialButton btnCancel = dialogView.findViewById(R.id.btnCancelModal);
        MaterialButton btnSubmit = dialogView.findViewById(R.id.btnSubmitDiscount);

        // Auto uppercase for code input
        etCode.setFilters(new InputFilter[]{new InputFilter.AllCaps(), new InputFilter.LengthFilter(20)});

        // Setup Spinner options
        String[] expiryOptions = new String[]{
                "Không bao giờ hết hạn",
                "Hết hạn sau 1 ngày",
                "Hết hạn sau 3 ngày",
                "Hết hạn sau 7 ngày",
                "Hết hạn sau 30 ngày",
                "Hết hạn sau 60 ngày",
                "Hết hạn sau 90 ngày"
        };
        ArrayAdapter<String> spinnerAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, expiryOptions);
        spExpiry.setAdapter(spinnerAdapter);

        // Dynamic change based on type
        rgType.setOnCheckedChangeListener((group, checkedId) -> {
            if (checkedId == R.id.rbPercent) {
                tvValueLabel.setText("Tỷ lệ giảm (%) *");
                etValue.setHint("Nhập số % (1 - 100)");
                tvMaxDiscountLabel.setVisibility(View.VISIBLE);
                etMaxDiscount.setVisibility(View.VISIBLE);
            } else {
                tvValueLabel.setText("Số tiền giảm (VND) *");
                etValue.setHint("Ví dụ: 20000, 50000");
                tvMaxDiscountLabel.setVisibility(View.GONE);
                etMaxDiscount.setVisibility(View.GONE);
            }
        });

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setView(dialogView)
                .setCancelable(false)
                .create();

        btnCancel.setOnClickListener(v -> dialog.dismiss());

        btnSubmit.setOnClickListener(v -> {
            String code = etCode.getText().toString().trim().toUpperCase();
            String desc = etDesc.getText().toString().trim();
            boolean isPercent = rbPercent.isChecked();
            String type = isPercent ? "PERCENT" : "FIXED_AMOUNT";
            String valStr = etValue.getText().toString().trim();
            String minOrderStr = etMinOrder.getText().toString().trim();
            String maxDiscStr = etMaxDiscount.getText().toString().trim();

            if (code.isEmpty()) {
                etCode.setError("Vui lòng nhập mã giảm giá");
                etCode.requestFocus();
                return;
            }

            if (valStr.isEmpty()) {
                etValue.setError("Vui lòng nhập giá trị giảm");
                etValue.requestFocus();
                return;
            }

            long value;
            try {
                value = Long.parseLong(valStr);
            } catch (NumberFormatException e) {
                etValue.setError("Giá trị không hợp lệ");
                etValue.requestFocus();
                return;
            }

            if (isPercent && (value <= 0 || value > 100)) {
                etValue.setError("Tỷ lệ giảm phải từ 1 đến 100%");
                etValue.requestFocus();
                return;
            }

            if (!isPercent && value <= 0) {
                etValue.setError("Số tiền giảm phải lớn hơn 0 VND");
                etValue.requestFocus();
                return;
            }

            long minOrder = 0;
            if (!minOrderStr.isEmpty()) {
                try {
                    minOrder = Long.parseLong(minOrderStr);
                } catch (NumberFormatException ignored) {}
            }

            long maxDiscount = 0;
            if (isPercent && !maxDiscStr.isEmpty()) {
                try {
                    maxDiscount = Long.parseLong(maxDiscStr);
                } catch (NumberFormatException ignored) {}
            }

            // Expiry timestamp
            long expiresAtMs = 0;
            int expirySelection = spExpiry.getSelectedItemPosition();
            long dayMs = 24L * 60 * 60 * 1000;
            switch (expirySelection) {
                case 1: expiresAtMs = System.currentTimeMillis() + 1 * dayMs; break;
                case 2: expiresAtMs = System.currentTimeMillis() + 3 * dayMs; break;
                case 3: expiresAtMs = System.currentTimeMillis() + 7 * dayMs; break;
                case 4: expiresAtMs = System.currentTimeMillis() + 30 * dayMs; break;
                case 5: expiresAtMs = System.currentTimeMillis() + 60 * dayMs; break;
                case 6: expiresAtMs = System.currentTimeMillis() + 90 * dayMs; break;
                default: expiresAtMs = 0; break;
            }

            // Gửi API lên Server
            btnSubmit.setEnabled(false);
            btnSubmit.setText("Đang lưu...");

            CreateDiscountRequest req = new CreateDiscountRequest(
                    code,
                    desc,
                    type,
                    value,
                    minOrder > 0 ? minOrder : null,
                    maxDiscount > 0 ? maxDiscount : null,
                    null,
                    expiresAtMs > 0 ? expiresAtMs : null
            );

            long finalExpiresAtMs = expiresAtMs;
            long finalMinOrder = minOrder;
            long finalMaxDiscount = maxDiscount;

            kioskRepository.createDiscount(req, new KioskRepository.ResultCallback<DiscountSummaryResponse>() {
                @Override
                public void onSuccess(DiscountSummaryResponse result) {
                    runOnUiThread(() -> {
                        // Lưu vào SQLite
                        LocalDiscount local = new LocalDiscount(
                                code,
                                desc,
                                type,
                                value,
                                finalMinOrder,
                                finalMaxDiscount,
                                true,
                                finalExpiresAtMs
                        );
                        KioskDbHelper.getInstance(DiscountsActivity.this).insertOrUpdateDiscount(local);

                        Toast.makeText(DiscountsActivity.this, "Tạo và đồng bộ mã " + code + " thành công!", Toast.LENGTH_SHORT).show();
                        dialog.dismiss();
                        loadDiscounts();
                    });
                }

                @Override
                public void onError(String message) {
                    runOnUiThread(() -> {
                        btnSubmit.setEnabled(true);
                        btnSubmit.setText("Tạo & Đồng bộ");

                        new AlertDialog.Builder(DiscountsActivity.this)
                                .setTitle("Lỗi từ Server")
                                .setMessage(message + "\n\nBạn có muốn lưu tạm thời mã này vào SQLite nội bộ trên máy không?")
                                .setPositiveButton("Lưu nội bộ", (d, which) -> {
                                    LocalDiscount local = new LocalDiscount(
                                            code,
                                            desc,
                                            type,
                                            value,
                                            finalMinOrder,
                                            finalMaxDiscount,
                                            true,
                                            finalExpiresAtMs
                                    );
                                    KioskDbHelper.getInstance(DiscountsActivity.this).insertOrUpdateDiscount(local);
                                    Toast.makeText(DiscountsActivity.this, "Đã lưu mã " + code + " vào SQLite", Toast.LENGTH_SHORT).show();
                                    dialog.dismiss();
                                    loadDiscounts();
                                })
                                .setNegativeButton("Thử lại", null)
                                .show();
                    });
                }
            });
        });

        dialog.show();
    }
}
