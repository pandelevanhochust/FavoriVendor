package com.example.vietqrapp;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class PriceManager {

    private static final String PREF_NAME = "kiosk_package_prices";
    private static final String KEY_PRICE_1 = "price_package_1";
    private static final String KEY_PRICE_2 = "price_package_2";
    private static final String KEY_PRICE_3 = "price_package_3";
    private static final String KEY_PRICE_VERSION = "price_config_version";
    private static final int CURRENT_PRICE_VERSION = 2;

    private static PriceManager instance;
    private final SharedPreferences prefs;
    private final List<Long> defaultPrices;

    public static synchronized PriceManager getInstance(Context context) {
        if (instance == null) {
            instance = new PriceManager(context.getApplicationContext());
        }
        return instance;
    }

    private PriceManager(Context context) {
        this.prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        this.defaultPrices = parseDefaultAmounts(BuildConfig.DEMO_AMOUNTS);

        int savedVer = prefs.getInt(KEY_PRICE_VERSION, 1);
        if (savedVer < CURRENT_PRICE_VERSION) {
            prefs.edit()
                    .putInt(KEY_PRICE_VERSION, CURRENT_PRICE_VERSION)
                    .putLong(KEY_PRICE_1, defaultPrices.get(0))
                    .putLong(KEY_PRICE_2, defaultPrices.get(1))
                    .putLong(KEY_PRICE_3, defaultPrices.get(2))
                    .apply();
        }
    }

    private List<Long> parseDefaultAmounts(String raw) {
        List<Long> out = new ArrayList<>();
        if (raw != null) {
            for (String part : raw.split(",")) {
                try {
                    long v = Long.parseLong(part.trim());
                    if (v > 0) out.add(v);
                } catch (NumberFormatException ignored) {}
            }
        }
        if (out.size() < 3) {
            return Arrays.asList(29_000L, 200_000L, 39_000L);
        }
        return out;
    }

    public long getPrice(int index) {
        long def = (index >= 0 && index < defaultPrices.size()) ? defaultPrices.get(index) : 100_000L;
        switch (index) {
            case 0:
                return prefs.getLong(KEY_PRICE_1, def);
            case 1:
                return prefs.getLong(KEY_PRICE_2, def);
            case 2:
                return prefs.getLong(KEY_PRICE_3, def);
            default:
                return def;
        }
    }

    public List<Long> getAllPrices() {
        return Arrays.asList(getPrice(0), getPrice(1), getPrice(2));
    }

    public void setPrices(long p1, long p2, long p3) {
        prefs.edit()
                .putLong(KEY_PRICE_1, p1)
                .putLong(KEY_PRICE_2, p2)
                .putLong(KEY_PRICE_3, p3)
                .apply();
    }

    public void resetToDefault() {
        prefs.edit()
                .putLong(KEY_PRICE_1, defaultPrices.get(0))
                .putLong(KEY_PRICE_2, defaultPrices.get(1))
                .putLong(KEY_PRICE_3, defaultPrices.get(2))
                .apply();
    }

    public List<Long> getDefaultPrices() {
        return new ArrayList<>(defaultPrices);
    }
}
