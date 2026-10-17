package com.example.vietqrapp;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.example.vietqrapp.db.LocalDiscount;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class DiscountsAdapter extends RecyclerView.Adapter<DiscountsAdapter.DiscountViewHolder> {

    private final List<LocalDiscount> items = new ArrayList<>();
    private final NumberFormat vndFormat = NumberFormat.getInstance(new Locale("vi", "VN"));
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault());

    public void setItems(List<LocalDiscount> list) {
        items.clear();
        if (list != null) {
            items.addAll(list);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public DiscountViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_discount, parent, false);
        return new DiscountViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull DiscountViewHolder holder, int position) {
        LocalDiscount d = items.get(position);

        holder.tvCode.setText(d.code);

        boolean isPercent = "PERCENT".equalsIgnoreCase(d.type) || "PERCENTAGE".equalsIgnoreCase(d.type);
        if (isPercent) {
            holder.tvTypeBadge.setText("GIẢM PHẦN TRĂM");
            holder.tvTypeBadge.setTextColor(0xFF850000);
            holder.tvTypeBadge.setBackgroundColor(0xFFFFEBEE);
            holder.tvValue.setText("Giảm: " + d.value + "%");
        } else {
            holder.tvTypeBadge.setText("TIỀN CỐ ĐỊNH");
            holder.tvTypeBadge.setTextColor(0xFF1565C0);
            holder.tvTypeBadge.setBackgroundColor(0xFFE3F2FD);
            holder.tvValue.setText("Giảm: " + vndFormat.format(d.value) + " VND");
        }

        if (d.description != null && !d.description.trim().isEmpty()) {
            holder.tvDescription.setText(d.description);
            holder.tvDescription.setVisibility(View.VISIBLE);
        } else {
            holder.tvDescription.setVisibility(View.GONE);
        }

        if (d.expiresAt <= 0) {
            holder.tvExpiresAt.setText("HSD: Không giới hạn");
        } else {
            holder.tvExpiresAt.setText("HSD: " + dateFormat.format(new Date(d.expiresAt)));
        }

        StringBuilder cond = new StringBuilder();
        if (d.minOrderAmount > 0) {
            cond.append("Đơn tối thiểu: ").append(vndFormat.format(d.minOrderAmount)).append(" VND");
        } else {
            cond.append("Đơn tối thiểu: 0đ");
        }

        if (isPercent && d.maxDiscountAmount > 0) {
            cond.append(" | Giảm tối đa: ").append(vndFormat.format(d.maxDiscountAmount)).append(" VND");
        }
        holder.tvConditions.setText(cond.toString());
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class DiscountViewHolder extends RecyclerView.ViewHolder {
        final TextView tvCode;
        final TextView tvTypeBadge;
        final TextView tvStatusBadge;
        final TextView tvValue;
        final TextView tvExpiresAt;
        final TextView tvDescription;
        final TextView tvConditions;

        DiscountViewHolder(@NonNull View itemView) {
            super(itemView);
            tvCode = itemView.findViewById(R.id.tvCode);
            tvTypeBadge = itemView.findViewById(R.id.tvTypeBadge);
            tvStatusBadge = itemView.findViewById(R.id.tvStatusBadge);
            tvValue = itemView.findViewById(R.id.tvValue);
            tvExpiresAt = itemView.findViewById(R.id.tvExpiresAt);
            tvDescription = itemView.findViewById(R.id.tvDescription);
            tvConditions = itemView.findViewById(R.id.tvConditions);
        }
    }
}
