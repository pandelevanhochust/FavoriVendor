package com.example.vietqrapp;

import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.example.vietqrapp.db.LocalTransaction;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class TransactionsAdapter extends RecyclerView.Adapter<TransactionsAdapter.ViewHolder> {

    private final List<LocalTransaction> items = new ArrayList<>();
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault());
    private final NumberFormat vndFormat = NumberFormat.getInstance(new Locale("vi", "VN"));

    public void setItems(List<LocalTransaction> newItems) {
        items.clear();
        if (newItems != null) {
            items.addAll(newItems);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_transaction, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        LocalTransaction t = items.get(position);

        holder.tvOrderId.setText("#" + (t.orderId != null ? t.orderId : "N/A"));
        holder.tvAmount.setText(vndFormat.format(t.amount) + " VND");

        if (t.createdAt > 0) {
            holder.tvCreatedAt.setText(dateFormat.format(new Date(t.createdAt)));
        } else {
            holder.tvCreatedAt.setText("N/A");
        }

        // Badge loại giao dịch
        boolean isCash = "CASH".equalsIgnoreCase(t.type);
        if (isCash) {
            holder.tvTypeBadge.setText("TIỀN MẶT");
            holder.tvTypeBadge.setTextColor(Color.parseColor("#2E7D32"));
            holder.tvTypeBadge.setBackgroundResource(R.drawable.bg_badge_cash);
        } else {
            holder.tvTypeBadge.setText("CHUYỂN KHOẢN");
            holder.tvTypeBadge.setTextColor(Color.parseColor("#1565C0"));
            holder.tvTypeBadge.setBackgroundResource(R.drawable.bg_badge_transfer);
        }

        // Chi tiết số lượng & đơn giá
        long unitPrice = t.unitPrice > 0 ? t.unitPrice : t.amount;
        holder.tvDetails.setText("Số lượng: " + t.quantity + " | Đơn giá: " + vndFormat.format(unitPrice) + " VND");

        // Giảm giá
        if (t.discountCode != null && !t.discountCode.trim().isEmpty()) {
            holder.tvDiscount.setVisibility(View.VISIBLE);
            holder.tvDiscount.setText("Mã giảm giá: " + t.discountCode + " (-" + vndFormat.format(t.discountAmount) + " VND)");
        } else {
            holder.tvDiscount.setVisibility(View.GONE);
        }

        // Thông tin ngân hàng nếu có
        StringBuilder bankSb = new StringBuilder();
        if (t.bankAccount != null && !t.bankAccount.isEmpty()) {
            bankSb.append("STK: ").append(t.bankAccount).append(" ");
        }
        if (t.referenceNumber != null && !t.referenceNumber.isEmpty()) {
            bankSb.append("| Mã GD: ").append(t.referenceNumber).append(" ");
        }
        if (t.content != null && !t.content.isEmpty()) {
            bankSb.append("| ND: ").append(t.content);
        }

        if (bankSb.length() > 0) {
            holder.tvBankInfo.setVisibility(View.VISIBLE);
            holder.tvBankInfo.setText(bankSb.toString().trim());
        } else {
            holder.tvBankInfo.setVisibility(View.GONE);
        }
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvOrderId, tvTypeBadge, tvStatusBadge, tvAmount, tvCreatedAt, tvDetails, tvDiscount, tvBankInfo;

        ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvOrderId = itemView.findViewById(R.id.tvOrderId);
            tvTypeBadge = itemView.findViewById(R.id.tvTypeBadge);
            tvStatusBadge = itemView.findViewById(R.id.tvStatusBadge);
            tvAmount = itemView.findViewById(R.id.tvAmount);
            tvCreatedAt = itemView.findViewById(R.id.tvCreatedAt);
            tvDetails = itemView.findViewById(R.id.tvDetails);
            tvDiscount = itemView.findViewById(R.id.tvDiscount);
            tvBankInfo = itemView.findViewById(R.id.tvBankInfo);
        }
    }
}
