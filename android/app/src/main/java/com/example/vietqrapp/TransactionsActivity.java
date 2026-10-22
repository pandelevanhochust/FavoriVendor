package com.example.vietqrapp;

import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.recyclerview.widget.LinearLayoutManager;

import com.example.vietqrapp.databinding.ActivityTransactionsBinding;
import com.example.vietqrapp.db.KioskDbHelper;
import com.example.vietqrapp.db.LocalTransaction;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

public class TransactionsActivity extends AppCompatActivity {

    private ActivityTransactionsBinding binding;
    private TransactionsAdapter adapter;
    private final NumberFormat vndFormat = NumberFormat.getInstance(new Locale("vi", "VN"));

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemUI();

        binding = ActivityTransactionsBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        adapter = new TransactionsAdapter();
        binding.rvTransactions.setLayoutManager(new LinearLayoutManager(this));
        binding.rvTransactions.setAdapter(adapter);

        binding.btnBack.setOnClickListener(v -> finish());
        binding.btnRefresh.setOnClickListener(v -> {
            loadTransactions();
            Toast.makeText(this, "Đã cập nhật dữ liệu mới nhất", Toast.LENGTH_SHORT).show();
        });

        loadTransactions();
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

    private void loadTransactions() {
        List<LocalTransaction> list = KioskDbHelper.getInstance(this).getRecentTransactions(200);

        if (list.isEmpty()) {
            binding.tvEmpty.setVisibility(View.VISIBLE);
            binding.rvTransactions.setVisibility(View.GONE);
            binding.tvTotalOrders.setText("0 đơn");
            binding.tvTotalRevenue.setText("0 VND");
            binding.tvCashStats.setText("Tiền mặt: 0 đơn (0 VND)");
            binding.tvTransferStats.setText("Chuyển khoản: 0 đơn (0 VND)");
            return;
        }

        binding.tvEmpty.setVisibility(View.GONE);
        binding.rvTransactions.setVisibility(View.VISIBLE);

        long totalAmount = 0;
        int cashCount = 0;
        long cashAmount = 0;
        int transferCount = 0;
        long transferAmount = 0;

        for (LocalTransaction t : list) {
            totalAmount += t.amount;
            if ("CASH".equalsIgnoreCase(t.type)) {
                cashCount++;
                cashAmount += t.amount;
            } else {
                transferCount++;
                transferAmount += t.amount;
            }
        }

        binding.tvTotalOrders.setText(list.size() + " đơn");
        binding.tvTotalRevenue.setText(vndFormat.format(totalAmount) + " VND");
        binding.tvCashStats.setText("Tiền mặt: " + cashCount + " đơn (" + formatShortVnd(cashAmount) + ")");
        binding.tvTransferStats.setText("Chuyển khoản: " + transferCount + " đơn (" + formatShortVnd(transferAmount) + ")");

        adapter.setItems(list);
    }

    private String formatShortVnd(long amount) {
        if (amount >= 1_000_000) {
            return String.format(Locale.getDefault(), "%.1fM", amount / 1_000_000.0);
        } else if (amount >= 1_000) {
            return (amount / 1_000) + "k";
        }
        return amount + "đ";
    }
}
