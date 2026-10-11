package com.example.vietqrapp.model;

public class CreateOrderRequest {
    private final long amount;
    private final String deviceId;

    public CreateOrderRequest(long amount, String deviceId) {
        this.amount = amount;
        this.deviceId = deviceId;
    }
}
