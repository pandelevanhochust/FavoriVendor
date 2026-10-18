package com.example.vietqrapp;

import android.content.Context;
import android.content.SharedPreferences;

public class ServerConfigManager {

    private static final String PREF_NAME = "kiosk_server_config";
    private static final String KEY_SERVER_URL = "server_base_url";

    private static ServerConfigManager instance;
    private final SharedPreferences prefs;

    public static synchronized ServerConfigManager getInstance(Context context) {
        if (instance == null) {
            instance = new ServerConfigManager(context.getApplicationContext());
        }
        return instance;
    }

    private ServerConfigManager(Context context) {
        this.prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public String getServerUrl() {
        String url = prefs.getString(KEY_SERVER_URL, BuildConfig.SERVER_BASE_URL);
        if (url == null || url.trim().isEmpty()) {
            url = BuildConfig.SERVER_BASE_URL;
        }
        url = url.trim();
        if (!url.endsWith("/")) {
            url += "/";
        }
        return url;
    }

    public void setServerUrl(String url) {
        if (url == null) return;
        url = url.trim();
        if (!url.endsWith("/")) {
            url += "/";
        }
        prefs.edit().putString(KEY_SERVER_URL, url).apply();
    }

    public void resetToDefault() {
        prefs.edit().putString(KEY_SERVER_URL, BuildConfig.SERVER_BASE_URL).apply();
    }

    public String getDefaultServerUrl() {
        String url = BuildConfig.SERVER_BASE_URL;
        if (url != null && !url.endsWith("/")) url += "/";
        return url;
    }
}
