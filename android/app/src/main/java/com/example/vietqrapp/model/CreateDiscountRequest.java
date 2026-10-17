package com.example.vietqrapp.model;

public class CreateDiscountRequest {
    public String code;
    public String description;
    public String type; // "PERCENT" hoặc "FIXED_AMOUNT"
    public long value;
    public Long minOrderAmount;
    public Long maxDiscountAmount;
    public Integer usageLimit;
    public Long expiresAtMs;

    public CreateDiscountRequest() {}

    public CreateDiscountRequest(String code, String description, String type, long value, Long minOrderAmount, Long maxDiscountAmount, Integer usageLimit, Long expiresAtMs) {
        this.code = code;
        this.description = description;
        this.type = type;
        this.value = value;
        this.minOrderAmount = minOrderAmount;
        this.maxDiscountAmount = maxDiscountAmount;
        this.usageLimit = usageLimit;
        this.expiresAtMs = expiresAtMs;
    }
}
