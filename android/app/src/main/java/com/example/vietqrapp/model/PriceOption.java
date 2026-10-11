package com.example.vietqrapp.model;

public class PriceOption {
    private final String label;
    private final long amount;

    public PriceOption(String label, long amount) {
        this.label = label;
        this.amount = amount;
    }

    public String getLabel() {
        return label;
    }

    public long getAmount() {
        return amount;
    }
}
