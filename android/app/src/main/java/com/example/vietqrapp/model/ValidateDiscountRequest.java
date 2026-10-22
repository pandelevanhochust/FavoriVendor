package com.example.vietqrapp.model;

public class ValidateDiscountRequest {
    private final String code;
    private final long amount;

    public ValidateDiscountRequest(String code, long amount) {
        this.code = code;
        this.amount = amount;
    }

    public String getCode() { return code; }
    public long getAmount() { return amount; }
}
