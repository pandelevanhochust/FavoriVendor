package com.example.vietqrapp.model;

import com.google.gson.annotations.SerializedName;

public class SyncCashTransactionRequest {
    @SerializedName("orderId")
    public String orderId;

    @SerializedName("amount")
    public long amount;

    @SerializedName("unitPrice")
    public long unitPrice;

    @SerializedName("quantity")
    public int quantity;

    @SerializedName("discountCode")
    public String discountCode;

    @SerializedName("discountAmount")
    public long discountAmount;

    @SerializedName("createdAt")
    public long createdAt;

    @SerializedName("deviceId")
    public String deviceId;

    public SyncCashTransactionRequest() {}

    public SyncCashTransactionRequest(String orderId, long amount, long unitPrice, int quantity,
                                      String discountCode, long discountAmount, long createdAt, String deviceId) {
        this.orderId = orderId;
        this.amount = amount;
        this.unitPrice = unitPrice;
        this.quantity = quantity;
        this.discountCode = discountCode;
        this.discountAmount = discountAmount;
        this.createdAt = createdAt;
        this.deviceId = deviceId;
    }
}
