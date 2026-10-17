package com.example.vietqrapp.model;

public class CreateOrderRequest {
    private final long amount;
    private final String deviceId;
    private final String discountCode;

    public CreateOrderRequest(long amount) {
        this(amount, "1", null);
    }

    public CreateOrderRequest(long amount, String deviceId) {
        this(amount, deviceId, null);
    }

    public CreateOrderRequest(long amount, String deviceId, String discountCode) {
        this.amount = amount;
        this.deviceId = (deviceId != null && !deviceId.isEmpty()) ? deviceId : "1";
        this.discountCode = discountCode;
    }

    public long getAmount() { return amount; }
    public String getDeviceId() { return deviceId; }
    public String getDiscountCode() { return discountCode; }
}
