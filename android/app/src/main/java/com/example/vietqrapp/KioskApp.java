package com.example.vietqrapp;

import android.app.Application;

import com.example.vietqrapp.cash.BillAcceptorManager;

/** Giữ đầu nhận tiền ở mức Application để kết nối USB tồn tại độc lập với vòng đời Activity. */
public class KioskApp extends Application {

    private static KioskApp instance;
    private BillAcceptorManager billAcceptor;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        billAcceptor = new BillAcceptorManager(this);
    }

    public static KioskApp get() {
        return instance;
    }

    public BillAcceptorManager billAcceptor() {
        return billAcceptor;
    }
}
