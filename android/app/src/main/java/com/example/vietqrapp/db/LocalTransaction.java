package com.example.vietqrapp.db;

public class LocalTransaction {
    public long id;
    public String orderId;
    public String type; // "CASH" hoặc "TRANSFER"
    public long amount;
    public long unitPrice;
    public int quantity;
    public String discountCode;
    public long discountAmount;
    public String status; // "PAID", "REVIEW"
    public long createdAt;
    public String bankTxnId;
    public String bankAccount;
    public String content;
    public String referenceNumber;

    public LocalTransaction() {
        this.createdAt = System.currentTimeMillis();
    }
}
