package com.example.vietqrapp;

import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;

import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;

import com.example.vietqrapp.databinding.ActivityMainBinding;
import com.example.vietqrapp.machine.LogMachineController;
import com.example.vietqrapp.machine.MachineController;
import com.example.vietqrapp.model.PriceOption;
import com.example.vietqrapp.viewmodel.PaymentUiState;
import com.example.vietqrapp.viewmodel.PaymentViewModel;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.color.MaterialColors;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private ActivityMainBinding binding;
    private PaymentViewModel viewModel;

    // THAY bằng lớp điều khiển phần cứng thật của máy (relay, serial, bluetooth...).
    private final MachineController machine = new LogMachineController();

    private MaterialButton[] presetButtons;
    private boolean updatingCustomAmount = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        setSupportActionBar(binding.toolbar);

        viewModel = new ViewModelProvider(this).get(PaymentViewModel.class);

        setupPresetButtons();
        setupCustomAmountInput();

        binding.btnGenerate.setOnClickListener(v -> viewModel.generateQr());
        binding.btnCancel.setOnClickListener(v -> viewModel.cancel());
        binding.btnDone.setOnClickListener(v -> {
            clearCustomAmountText();
            viewModel.resetToSelection(null);
        });

        viewModel.getUiState().observe(this, this::render);

        // Sự kiện "đã thanh toán": chỉ phát một lần cho mỗi đơn, nên điều khiển máy ở đây là an toàn.
        viewModel.getPaidEvent().observe(this, event -> {
            if (event == null) return;
            viewModel.onPaidEventHandled(); // đánh dấu đã nhận TRƯỚC để không bị gọi lại nếu lỗi/recreate
            machine.onPaymentConfirmed(event.orderId, event.amount);
        });
    }

    private void setupPresetButtons() {
        presetButtons = new MaterialButton[]{
                binding.btnPrice1, binding.btnPrice2, binding.btnPrice3, binding.btnPrice4
        };
        List<PriceOption> options = viewModel.getPriceOptions();
        for (int i = 0; i < presetButtons.length && i < options.size(); i++) {
            final PriceOption option = options.get(i);
            presetButtons[i].setText(option.getLabel());
            presetButtons[i].setOnClickListener(v -> {
                clearCustomAmountText();
                viewModel.selectPreset(option.getAmount());
            });
        }
    }

    private void setupCustomAmountInput() {
        binding.etCustomAmount.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                if (updatingCustomAmount) return;
                viewModel.onCustomAmountChanged(s.toString());
            }
        });
    }

    private void clearCustomAmountText() {
        updatingCustomAmount = true;
        binding.etCustomAmount.setText("");
        updatingCustomAmount = false;
    }

    private void render(PaymentUiState state) {
        PaymentUiState.Status status = state.getStatus();

        boolean selecting = status == PaymentUiState.Status.IDLE || status == PaymentUiState.Status.CREATING;
        binding.layoutPriceSelection.setVisibility(selecting ? View.VISIBLE : View.GONE);
        binding.layoutQr.setVisibility(status == PaymentUiState.Status.WAITING ? View.VISIBLE : View.GONE);
        binding.layoutResult.setVisibility(
                status == PaymentUiState.Status.PAID || status == PaymentUiState.Status.REVIEW ? View.VISIBLE : View.GONE);

        // --- 1. chọn giá ---
        List<PriceOption> options = viewModel.getPriceOptions();
        for (int i = 0; i < presetButtons.length && i < options.size(); i++) {
            boolean selected = state.getSelectedAmount() != null
                    && state.getSelectedAmount() == options.get(i).getAmount();
            styleSelected(presetButtons[i], selected);
            presetButtons[i].setEnabled(status == PaymentUiState.Status.IDLE);
        }
        binding.etCustomAmount.setEnabled(status == PaymentUiState.Status.IDLE);

        boolean creating = status == PaymentUiState.Status.CREATING;
        Long amount = state.getSelectedAmount();
        binding.btnGenerate.setEnabled(status == PaymentUiState.Status.IDLE && amount != null && amount > 0);
        binding.btnGenerate.setText(creating ? "" : "Tạo mã QR");
        binding.progressGenerate.setVisibility(creating ? View.VISIBLE : View.GONE);

        boolean hasMessage = selecting && state.getMessage() != null;
        binding.tvError.setVisibility(hasMessage ? View.VISIBLE : View.GONE);
        if (hasMessage) binding.tvError.setText(state.getMessage());

        // --- 2. QR ---
        if (status == PaymentUiState.Status.WAITING) {
            if (state.getQrBitmap() != null) binding.ivQrCode.setImageBitmap(state.getQrBitmap());
            binding.tvAmount.setText(formatVnd(amount != null ? amount : 0));
            binding.tvOrderId.setText("Mã đơn: " + (state.getOrderId() != null ? state.getOrderId() : ""));
            int s = state.getRemainingSeconds();
            binding.tvCountdown.setText(String.format(Locale.US, "Mã còn hiệu lực: %02d:%02d", s / 60, s % 60));
            binding.btnCancel.setEnabled(!state.isBusy());
        }

        // --- 3. kết quả ---
        if (status == PaymentUiState.Status.PAID) {
            binding.tvResultIcon.setText("✓");
            binding.tvResultIcon.setTextColor(Color.parseColor("#2E7D32"));
            binding.tvResultTitle.setText("Thanh toán thành công");
            binding.tvResultMessage.setText(formatVnd(amount != null ? amount : 0) + "\nCảm ơn quý khách!");
        } else if (status == PaymentUiState.Status.REVIEW) {
            binding.tvResultIcon.setText("!");
            binding.tvResultIcon.setTextColor(Color.parseColor("#EF6C00"));
            binding.tvResultTitle.setText("Cần kiểm tra giao dịch");
            binding.tvResultMessage.setText(state.getMessage() != null ? state.getMessage() : "");
        }
    }

    private void styleSelected(MaterialButton button, boolean selected) {
        int primary = MaterialColors.getColor(button, com.google.android.material.R.attr.colorPrimary);
        button.setBackgroundTintList(ColorStateList.valueOf(selected ? primary : Color.TRANSPARENT));
        button.setTextColor(selected ? Color.WHITE : primary);
    }

    private String formatVnd(long amount) {
        return NumberFormat.getInstance(new Locale("vi", "VN")).format(amount) + " đ";
    }
}
