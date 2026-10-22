package com.example.vietqrapp.model;

import com.google.gson.annotations.SerializedName;

public class SyncCashTransactionResponse {
    @SerializedName("success")
    public boolean success;

    @SerializedName("orderId")
    public String orderId;

    @SerializedName("message")
    public String message;

    public SyncCashTransactionResponse() {}

    public SyncCashTransactionResponse(boolean success, String orderId, String message) {
        this.success = success;
        this.orderId = orderId;
        this.message = message;
    }
}
