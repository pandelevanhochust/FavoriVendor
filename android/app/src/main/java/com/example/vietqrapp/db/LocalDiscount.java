package com.example.vietqrapp.db;

public class LocalDiscount {
    public String code;
    public String description;
    public String type; // "PERCENT" hoặc "FIXED_AMOUNT"
    public long value;
    public long minOrderAmount;
    public long maxDiscountAmount;
    public boolean isActive;
    public long expiresAt; // Epoch timestamp in ms; 0 hoặc null = không giới hạn thời gian

    public LocalDiscount() {}

    public LocalDiscount(String code, String description, String type, long value, long minOrderAmount, long maxDiscountAmount, boolean isActive) {
        this(code, description, type, value, minOrderAmount, maxDiscountAmount, isActive, 0);
    }

    public LocalDiscount(String code, String description, String type, long value, long minOrderAmount, long maxDiscountAmount, boolean isActive, long expiresAt) {
        this.code = code;
        this.description = description;
        this.type = type;
        this.value = value;
        this.minOrderAmount = minOrderAmount;
        this.maxDiscountAmount = maxDiscountAmount;
        this.isActive = isActive;
        this.expiresAt = expiresAt;
    }

    public boolean isExpired() {
        return expiresAt > 0 && expiresAt < System.currentTimeMillis();
    }
}

