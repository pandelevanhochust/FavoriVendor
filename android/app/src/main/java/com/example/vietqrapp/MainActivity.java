package com.example.vietqrapp;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;

import com.example.vietqrapp.databinding.ActivityMainBinding;
import com.example.vietqrapp.machine.LogMachineController;
import com.example.vietqrapp.machine.MachineController;
import com.example.vietqrapp.viewmodel.PaymentUiState;
import com.example.vietqrapp.viewmodel.PaymentViewModel;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private ActivityMainBinding binding;
    private PaymentViewModel viewModel;

    // THAY bằng lớp điều khiển phần cứng thật của máy (relay, serial, bluetooth...).
    private final MachineController machine = new LogMachineController();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        setSupportActionBar(binding.toolbar);

        viewModel = new ViewModelProvider(this).get(PaymentViewModel.class);

        // Nhấn giữ thanh tiêu đề để vào màn Chẩn đoán (nhân viên, có PIN).
        binding.toolbar.setOnLongClickListener(v -> {
            showPinDialog();
            return true;
        });

        // Màn 1: chọn mức giá (80k, 100k, 200k...)
        final List<Long> amounts = viewModel.getAmounts();
        if (amounts.size() > 0) {
            binding.tvPrice1.setText(formatVnd(amounts.get(0)));
            binding.tvPrice1.setOnClickListener(v -> viewModel.selectAmount(amounts.get(0)));
            binding.tvPrice1.setVisibility(View.VISIBLE);
        } else {
            binding.tvPrice1.setVisibility(View.GONE);
        }

        if (amounts.size() > 1) {
            binding.tvPrice2.setText(formatVnd(amounts.get(1)));
            binding.tvPrice2.setOnClickListener(v -> viewModel.selectAmount(amounts.get(1)));
            binding.tvPrice2.setVisibility(View.VISIBLE);
        } else {
            binding.tvPrice2.setVisibility(View.GONE);
        }

        if (amounts.size() > 2) {
            binding.tvPrice3.setText(formatVnd(amounts.get(2)));
            binding.tvPrice3.setOnClickListener(v -> viewModel.selectAmount(amounts.get(2)));
            binding.tvPrice3.setVisibility(View.VISIBLE);
        } else {
            binding.tvPrice3.setVisibility(View.GONE);
        }

        // Màn 2: chọn phương thức
        binding.tvMethodCash.setOnClickListener(v -> viewModel.chooseCash());
        binding.tvMethodTransfer.setOnClickListener(v -> viewModel.chooseTransfer());
        binding.tvBack.setOnClickListener(v -> viewModel.backToHome());

        binding.btnCancel.setOnClickListener(v -> viewModel.cancel());
        binding.btnCashCancel.setOnClickListener(v -> viewModel.cancelCash());
        binding.btnDone.setOnClickListener(v -> viewModel.resetToSelection(null));

        viewModel.getUiState().observe(this, this::render);

        // Sự kiện "đã thanh toán": chỉ phát một lần cho mỗi giao dịch -> điều khiển máy ở đây là an toàn.
        viewModel.getPaidEvent().observe(this, event -> {
            if (event == null) return;
            viewModel.onPaidEventHandled(); // đánh dấu đã nhận TRƯỚC để không bị gọi lại
            machine.onPaymentConfirmed(event.orderId, event.amount, event.method);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        KioskApp.get().billAcceptor().connect();
        viewModel.reassertCashState();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Cắm module USB -> Android mở lại app qua intent USB_DEVICE_ATTACHED
        KioskApp.get().billAcceptor().connect();
    }

    private void render(PaymentUiState state) {
        PaymentUiState.Status status = state.getStatus();

        binding.layoutHome.setVisibility(status == PaymentUiState.Status.HOME ? View.VISIBLE : View.GONE);
        binding.layoutMethod.setVisibility(status == PaymentUiState.Status.METHOD ? View.VISIBLE : View.GONE);
        binding.layoutQr.setVisibility(
                status == PaymentUiState.Status.CREATING || status == PaymentUiState.Status.WAITING ? View.VISIBLE : View.GONE);
        binding.layoutCash.setVisibility(status == PaymentUiState.Status.CASH ? View.VISIBLE : View.GONE);
        binding.layoutResult.setVisibility(
                status == PaymentUiState.Status.PAID || status == PaymentUiState.Status.REVIEW ? View.VISIBLE : View.GONE);

        long amount = state.getSelectedAmount() != null ? state.getSelectedAmount() : 0L;

        // --- Màn 1 ---
        boolean hasHomeMessage = status == PaymentUiState.Status.HOME && state.getMessage() != null;
        binding.tvHomeMessage.setVisibility(hasHomeMessage ? View.VISIBLE : View.GONE);
        if (hasHomeMessage) binding.tvHomeMessage.setText(state.getMessage());

        // --- Màn 2 ---
        if (status == PaymentUiState.Status.METHOD) {
            binding.tvMethodAmount.setText("Số tiền: " + formatVnd(amount));
            binding.tvMethodCash.setAlpha(state.isCashReady() ? 1f : 0.5f);
            boolean showHint = !state.isCashReady();
            binding.tvCashHint.setVisibility(showHint ? View.VISIBLE : View.GONE);
            if (showHint) binding.tvCashHint.setText("Máy nhận tiền chưa sẵn sàng");
            boolean hasMsg = state.getMessage() != null;
            binding.tvMethodMessage.setVisibility(hasMsg ? View.VISIBLE : View.GONE);
            if (hasMsg) binding.tvMethodMessage.setText(state.getMessage());
        }

        // --- Chuyển khoản: QR ---
        if (status == PaymentUiState.Status.CREATING || status == PaymentUiState.Status.WAITING) {
            boolean creating = status == PaymentUiState.Status.CREATING;
            binding.tvQrAmount.setText(formatVnd(amount));
            binding.ivQrCode.setVisibility(creating ? View.INVISIBLE : View.VISIBLE);
            if (!creating && state.getQrBitmap() != null) binding.ivQrCode.setImageBitmap(state.getQrBitmap());
            binding.tvQrStatus.setText(creating ? "Đang tạo mã QR..." : "Đang chờ thanh toán...");
            int s = state.getRemainingSeconds();
            binding.tvCountdown.setText(creating ? ""
                    : String.format(Locale.US, "Mã còn hiệu lực: %02d:%02d", s / 60, s % 60));
            binding.tvOrderId.setText(creating || state.getOrderId() == null ? "" : "Mã đơn: " + state.getOrderId());
            binding.btnCancel.setEnabled(!creating && !state.isBusy());
        }

        // --- Tiền mặt ---
        if (status == PaymentUiState.Status.CASH) {
            long inserted = state.getCashInserted();
            binding.tvCashAmount.setText("Cần thanh toán: " + formatVnd(amount));
            binding.tvCashInserted.setText("Đã nhận: " + formatVnd(inserted));
            binding.tvCashRemaining.setText("Còn thiếu: " + formatVnd(Math.max(0, amount - inserted)));
            boolean hasMsg = state.getMessage() != null;
            binding.tvCashMessage.setVisibility(hasMsg ? View.VISIBLE : View.GONE);
            if (hasMsg) binding.tvCashMessage.setText(state.getMessage());
            binding.btnCashCancel.setEnabled(inserted == 0);
        }

        // --- Kết quả ---
        if (status == PaymentUiState.Status.PAID) {
            binding.tvResultIcon.setText("✓");
            binding.tvResultIcon.setTextColor(Color.parseColor("#2E7D32"));
            binding.tvResultTitle.setText("Thanh toán thành công");
            binding.tvResultMessage.setText(formatVnd(amount)
                    + ("CASH".equals(state.getPaidMethod()) ? " (tiền mặt)" : " (chuyển khoản)")
                    + "\nCảm ơn quý khách!");
        } else if (status == PaymentUiState.Status.REVIEW) {
            binding.tvResultIcon.setText("!");
            binding.tvResultIcon.setTextColor(Color.parseColor("#EF6C00"));
            binding.tvResultTitle.setText("Cần kiểm tra giao dịch");
            binding.tvResultMessage.setText(state.getMessage() != null ? state.getMessage() : "");
        }
    }

    private void showPinDialog() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setHint("Nhập mã PIN nhân viên");
        new AlertDialog.Builder(this)
                .setTitle("Chẩn đoán")
                .setView(input)
                .setPositiveButton("Mở", (d, w) -> {
                    if (BuildConfig.ADMIN_PIN.equals(input.getText().toString().trim())) {
                        startActivity(new Intent(this, DiagnosticsActivity.class));
                    } else {
                        Toast.makeText(this, "Sai mã PIN", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton("Huỷ", null)
                .show();
    }

    private String formatVnd(long amount) {
        return NumberFormat.getInstance(new Locale("vi", "VN")).format(amount) + " VND";
    }
}
