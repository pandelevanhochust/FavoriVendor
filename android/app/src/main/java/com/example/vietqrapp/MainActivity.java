package com.example.vietqrapp;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.lifecycle.ViewModelProvider;

import com.example.vietqrapp.databinding.ActivityMainBinding;
import com.example.vietqrapp.machine.LogMachineController;
import com.example.vietqrapp.machine.MachineController;
import com.example.vietqrapp.viewmodel.PaymentUiState;
import com.example.vietqrapp.viewmodel.PaymentViewModel;

import java.text.NumberFormat;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private ActivityMainBinding binding;
    private PaymentViewModel viewModel;

    // Điều khiển thiết bị thật hoặc mock log
    private final MachineController machine = new LogMachineController();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemUI();

        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        viewModel = new ViewModelProvider(this).get(PaymentViewModel.class);

        // ========================================================
        // ẨN NHÂN VIÊN: GIỮ VÀO LOGO PHÍA TRÊN CÙNG (GÓC PHẢI / TRÁI)
        // ========================================================
        View.OnLongClickListener secretStaffListener = v -> {
            showPinDialog();
            return true;
        };
        binding.viewStaffSecret.setOnLongClickListener(secretStaffListener);
        binding.viewStaffSecretLeft.setOnLongClickListener(secretStaffListener);

        // Bấm logo ở Page 5 -> lập tức quay về Page 1
        View.OnClickListener returnHomeListener = v -> {
            PaymentUiState s = viewModel.getUiState().getValue();
            if (s != null && (s.getStatus() == PaymentUiState.Status.PAID || s.getStatus() == PaymentUiState.Status.REVIEW)) {
                viewModel.resetToSelection(null);
            }
        };
        binding.viewStaffSecret.setOnClickListener(returnHomeListener);
        binding.viewStaffSecretLeft.setOnClickListener(returnHomeListener);

        // ========================================================
        // PAGE 1: GIỚI THIỆU
        // ========================================================
        binding.layoutPage1.btnLangVi.setOnClickListener(v -> Toast.makeText(this, "Tiếng Việt", Toast.LENGTH_SHORT).show());
        binding.layoutPage1.btnLangEn.setOnClickListener(v -> Toast.makeText(this, "English", Toast.LENGTH_SHORT).show());
        binding.layoutPage1.btnPage1Next.setOnClickListener(v -> viewModel.goToPage2());

        // ========================================================
        // PAGE 2: CHỌN GÓI CHỤP (BƯỚC 1/3)
        // ========================================================
        binding.layoutPage2.cardPackage1.setOnClickListener(v -> viewModel.selectPackage(0));
        binding.layoutPage2.cardPackage2.setOnClickListener(v -> viewModel.selectPackage(1));
        binding.layoutPage2.cardPackage3.setOnClickListener(v -> viewModel.selectPackage(2));

        binding.layoutPage2.btnPage2Back.setOnClickListener(v -> viewModel.backToPage1());
        binding.layoutPage2.btnPage2Next.setOnClickListener(v -> viewModel.proceedToQuantityDiscount());

        // ========================================================
        // PAGE 3: MÃ GIẢM GIÁ & SỐ LƯỢNG (BƯỚC 2/3)
        // ========================================================
        binding.layoutPage3.btnQtyMinus.setOnClickListener(v -> viewModel.decreaseQuantity());
        binding.layoutPage3.btnQtyPlus.setOnClickListener(v -> viewModel.increaseQuantity());
        binding.layoutPage3.btnApplyDiscount.setOnClickListener(v -> applyDiscountCode());

        binding.layoutPage3.etDiscountCode.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN)) {
                applyDiscountCode();
                return true;
            }
            return false;
        });

        binding.layoutPage3.btnPage3Next.setOnClickListener(v -> {
            hideKeyboard(binding.layoutPage3.etDiscountCode);
            viewModel.proceedToMethod();
        });
        binding.layoutPage3.btnPage3Back.setOnClickListener(v -> {
            hideKeyboard(binding.layoutPage3.etDiscountCode);
            viewModel.backToPage2();
        });

        // ========================================================
        // PAGE METHOD: CHỌN PHƯƠNG THỨC THANH TOÁN
        // ========================================================
        binding.layoutPageMethod.btnMethodTransfer.setOnClickListener(v -> viewModel.chooseTransfer());
        binding.layoutPageMethod.btnMethodCash.setOnClickListener(v -> viewModel.chooseCash());
        binding.layoutPageMethod.btnMethodBack.setOnClickListener(v -> viewModel.backToQuantity());

        // ========================================================
        // PAGE 4: THANH TOÁN (QR / TIỀN MẶT - BƯỚC 3/3)
        // ========================================================
        binding.layoutPage4.btnCancelPayment.setOnClickListener(v -> {
            PaymentUiState s = viewModel.getUiState().getValue();
            if (s != null && s.getStatus() == PaymentUiState.Status.CASH) {
                viewModel.cancelCash();
            } else {
                viewModel.cancel();
            }
        });

        // ========================================================
        // PAGE 5: THANH TOÁN THÀNH CÔNG (Chạm bất kỳ đâu để về trang chủ)
        // ========================================================
        binding.layoutPage5.getRoot().setOnClickListener(v -> viewModel.resetToSelection(null));

        viewModel.getUiState().observe(this, this::render);

        // Sự kiện "đã thanh toán": chỉ phát một lần cho mỗi giao dịch -> điều khiển máy ở đây là an toàn.
        viewModel.getPaidEvent().observe(this, event -> {
            if (event == null) return;
            viewModel.onPaidEventHandled();
            machine.onPaymentConfirmed(event.orderId, event.amount, event.method);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        KioskApp.get().billAcceptor().connect();
        viewModel.reassertCashState();
        viewModel.reloadPrices();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        KioskApp.get().billAcceptor().connect();
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
            // Ẩn cả thanh trạng thái (status bar: pin, wifi, giờ, noti) và thanh điều hướng (navigation bar)
            controller.hide(WindowInsetsCompat.Type.systemBars());
            // Thiết lập chế độ immersive: khi vuốt nhẹ chỉ hiện tạm thời rồi tự động ẩn lại
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    private void render(PaymentUiState state) {
        PaymentUiState.Status status = state.getStatus();

        // 1. Quản lý hiển thị các màn hình độc lập
        binding.layoutPage1.getRoot().setVisibility(status == PaymentUiState.Status.PAGE1 ? View.VISIBLE : View.GONE);
        binding.layoutPage2.getRoot().setVisibility(status == PaymentUiState.Status.HOME ? View.VISIBLE : View.GONE);
        binding.layoutPage3.getRoot().setVisibility(status == PaymentUiState.Status.QUANTITY_DISCOUNT ? View.VISIBLE : View.GONE);
        binding.layoutPageMethod.getRoot().setVisibility(status == PaymentUiState.Status.METHOD ? View.VISIBLE : View.GONE);
        binding.layoutPage4.getRoot().setVisibility(
                status == PaymentUiState.Status.CREATING || status == PaymentUiState.Status.WAITING || status == PaymentUiState.Status.CASH
                        ? View.VISIBLE : View.GONE);
        binding.layoutPage5.getRoot().setVisibility(
                status == PaymentUiState.Status.PAID || status == PaymentUiState.Status.REVIEW ? View.VISIBLE : View.GONE);

        long amount = state.getSelectedAmount() != null ? state.getSelectedAmount() : state.getSubtotal();

        // 2. PAGE 2: Chọn gói chụp (hiển thị giá cập nhật + tick box dạng circle + viền bọc)
        if (status == PaymentUiState.Status.HOME) {
            PriceManager pm = PriceManager.getInstance(this);
            binding.layoutPage2.tvPricePackage1.setText(formatVnd(pm.getPrice(0)));
            binding.layoutPage2.tvPricePackage2.setText(formatVnd(pm.getPrice(1)));
            binding.layoutPage2.tvPricePackage3.setText(formatVnd(pm.getPrice(2)));

            int selected = state.getSelectedPackageIndex();
            binding.layoutPage2.ivCheckPackage1.setImageResource(
                    selected == 0 ? R.drawable.ic_circle_checked : R.drawable.ic_circle_unchecked);
            binding.layoutPage2.ivCheckPackage2.setImageResource(
                    selected == 1 ? R.drawable.ic_circle_checked : R.drawable.ic_circle_unchecked);
            binding.layoutPage2.ivCheckPackage3.setImageResource(
                    selected == 2 ? R.drawable.ic_circle_checked : R.drawable.ic_circle_unchecked);

            binding.layoutPage2.cardPackage1.setBackgroundResource(
                    selected == 0 ? R.drawable.bg_package_selected : R.drawable.bg_package_unselected);
            binding.layoutPage2.cardPackage2.setBackgroundResource(
                    selected == 1 ? R.drawable.bg_package_selected : R.drawable.bg_package_unselected);
            binding.layoutPage2.cardPackage3.setBackgroundResource(
                    selected == 2 ? R.drawable.bg_package_selected : R.drawable.bg_package_unselected);
        }

        // 3. PAGE 3: Số lượng & Giảm giá
        if (status == PaymentUiState.Status.QUANTITY_DISCOUNT) {
            binding.layoutPage3.tvQtyValue.setText(String.valueOf(state.getQuantity()));
            binding.layoutPage3.tvTotalPrice.setText(formatVnd(amount));

            if (state.getDiscountMessage() != null) {
                binding.layoutPage3.tvDiscountMessage.setVisibility(View.VISIBLE);
                binding.layoutPage3.tvDiscountMessage.setText(state.getDiscountMessage());
            } else {
                binding.layoutPage3.tvDiscountMessage.setVisibility(View.GONE);
            }
        }

        // 4. PAGE METHOD: Phương thức thanh toán
        if (status == PaymentUiState.Status.METHOD) {
            boolean cashReady = state.isCashReady();
            binding.layoutPageMethod.btnMethodCash.setEnabled(cashReady);
            binding.layoutPageMethod.btnMethodCash.setAlpha(cashReady ? 1.0f : 0.5f);
            binding.layoutPageMethod.tvCashHint.setVisibility(cashReady ? View.GONE : View.VISIBLE);
            if (!cashReady) {
                binding.layoutPageMethod.tvCashHint.setText(state.getCashStatusText() != null && !state.getCashStatusText().isEmpty()
                        ? state.getCashStatusText() : "Máy nhận tiền chưa sẵn sàng");
            }
        }

        // 5. PAGE 4: Thanh toán (QR hoặc Tiền mặt)
        if (status == PaymentUiState.Status.CREATING || status == PaymentUiState.Status.WAITING) {
            binding.layoutPage4.layoutQrContent.setVisibility(View.VISIBLE);
            binding.layoutPage4.layoutCashContent.setVisibility(View.GONE);

            boolean creating = status == PaymentUiState.Status.CREATING;
            binding.layoutPage4.progressQr.setVisibility(creating ? View.VISIBLE : View.GONE);
            binding.layoutPage4.ivQrCode.setVisibility(creating ? View.INVISIBLE : View.VISIBLE);
            if (!creating && state.getQrBitmap() != null) {
                binding.layoutPage4.ivQrCode.setImageBitmap(state.getQrBitmap());
            }

            int s = state.getRemainingSeconds();
            binding.layoutPage4.tvCountdown.setText(creating ? "Đang tạo mã QR..."
                    : String.format(Locale.US, "Mã còn hiệu lực: %02d:%02d", s / 60, s % 60));
            binding.layoutPage4.tvOrderId.setText(creating || state.getOrderId() == null ? "" : "Mã đơn: " + state.getOrderId());

            binding.layoutPage4.tvPayTotalAmount.setText(formatVnd(amount));
            binding.layoutPage4.tvPayCashInserted.setText("0 VND");
            binding.layoutPage4.btnCancelPayment.setEnabled(!creating && !state.isBusy());
        } else if (status == PaymentUiState.Status.CASH) {
            binding.layoutPage4.layoutQrContent.setVisibility(View.GONE);
            binding.layoutPage4.layoutCashContent.setVisibility(View.VISIBLE);

            long inserted = state.getCashInserted();
            binding.layoutPage4.tvPayTotalAmount.setText(formatVnd(amount));
            binding.layoutPage4.tvPayCashInserted.setText(formatVnd(inserted));

            boolean hasMsg = state.getMessage() != null;
            binding.layoutPage4.tvCashMessage.setVisibility(hasMsg ? View.VISIBLE : View.GONE);
            if (hasMsg) binding.layoutPage4.tvCashMessage.setText(state.getMessage());

            binding.layoutPage4.btnCancelPayment.setEnabled(inserted == 0);
        }

        // 6. PAGE 5: Thành công / Cảm ơn
        if (status == PaymentUiState.Status.PAID) {
            String orderId = state.getOrderId() != null ? state.getOrderId() : "1";
            binding.layoutPage5.tvQueueNumber.setText(orderId);
            String methodStr = "CASH".equals(state.getPaidMethod()) ? "tiền mặt" : "chuyển khoản VietQR";
            binding.layoutPage5.tvSuccessMethod.setText("Đã thanh toán " + formatVnd(amount) + " (" + methodStr + ")");
        } else if (status == PaymentUiState.Status.REVIEW) {
            binding.layoutPage5.tvQueueNumber.setText("!");
            binding.layoutPage5.tvSuccessMethod.setText(state.getMessage() != null ? state.getMessage() : "Cần nhân viên kiểm tra");
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

    private void applyDiscountCode() {
        String code = binding.layoutPage3.etDiscountCode.getText() != null
                ? binding.layoutPage3.etDiscountCode.getText().toString().trim() : "";
        viewModel.applyDiscount(code);
        hideKeyboard(binding.layoutPage3.etDiscountCode);
    }

    private void hideKeyboard(View view) {
        if (view != null) {
            view.clearFocus();
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.hideSoftInputFromWindow(view.getWindowToken(), 0);
            }
        }
        hideSystemUI();
    }

    private String formatVnd(long amount) {
        return NumberFormat.getInstance(new Locale("vi", "VN")).format(amount) + " VND";
    }
}
