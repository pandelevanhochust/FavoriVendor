package com.example.vietqrapp.model;

/** Khớp với OrderDto của server. status: PENDING | PAID | EXPIRED | CANCELLED | REVIEW */
public class OrderResponse {
    public String orderId;
    public String status;
    public long amount;
    public long originalAmount;
    public long discountAmount;
    public String discountCode;
    public String qrCode;
    public String content;
    public int expiresInSeconds;
    public String paidAt;
    public BankTransactionResponse transaction;
}
