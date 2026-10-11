package com.example.vietqrapp.api;

import androidx.annotation.NonNull;

import com.example.vietqrapp.BuildConfig;
import com.example.vietqrapp.model.ApiError;
import com.example.vietqrapp.model.CreateOrderRequest;
import com.example.vietqrapp.model.OrderResponse;
import com.google.gson.Gson;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

public class KioskRepository {

    public interface ResultCallback<T> {
        void onSuccess(T result);

        void onError(String message);
    }

    private final KioskApiService api;
    private final Gson gson = new Gson();

    public KioskRepository() {
        OkHttpClient.Builder client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                // Phải lớn hơn thời gian long-poll (20s) để request chờ không bị coi là timeout.
                .readTimeout(35, TimeUnit.SECONDS)
                .addInterceptor(chain -> {
                    Request request = chain.request().newBuilder()
                            .header("X-Api-Key", BuildConfig.KIOSK_API_KEY)
                            .build();
                    return chain.proceed(request);
                });

        if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor logging = new HttpLoggingInterceptor();
            logging.setLevel(HttpLoggingInterceptor.Level.BASIC); // KHÔNG log header/body
            client.addInterceptor(logging);
        }

        String baseUrl = BuildConfig.SERVER_BASE_URL;
        if (!baseUrl.endsWith("/")) baseUrl = baseUrl + "/";

        api = new Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(client.build())
                .addConverterFactory(GsonConverterFactory.create(gson))
                .build()
                .create(KioskApiService.class);
    }

    public Call<OrderResponse> createOrder(long amount, ResultCallback<OrderResponse> cb) {
        return run(api.createOrder(new CreateOrderRequest(amount, BuildConfig.DEVICE_ID)), cb);
    }

    public Call<OrderResponse> pollOrder(String orderId, int waitSeconds, ResultCallback<OrderResponse> cb) {
        return run(api.getOrder(orderId, waitSeconds), cb);
    }

    public Call<OrderResponse> cancelOrder(String orderId, ResultCallback<OrderResponse> cb) {
        return run(api.cancelOrder(orderId), cb);
    }

    private <T> Call<T> run(Call<T> call, final ResultCallback<T> cb) {
        call.enqueue(new Callback<T>() {
            @Override
            public void onResponse(@NonNull Call<T> c, @NonNull Response<T> response) {
                if (response.isSuccessful() && response.body() != null) {
                    cb.onSuccess(response.body());
                } else {
                    cb.onError(parseError(response));
                }
            }

            @Override
            public void onFailure(@NonNull Call<T> c, @NonNull Throwable t) {
                if (c.isCanceled()) return; // do chủ động huỷ, không báo lỗi
                cb.onError("Lỗi kết nối tới máy chủ: " + t.getMessage());
            }
        });
        return call;
    }

    private String parseError(Response<?> response) {
        try {
            if (response.errorBody() != null) {
                ApiError err = gson.fromJson(response.errorBody().string(), ApiError.class);
                if (err != null && err.message != null && !err.message.isEmpty()) return err.message;
            }
        } catch (IOException | RuntimeException ignored) {
            // rơi xuống thông báo mặc định
        }
        return "Lỗi máy chủ (HTTP " + response.code() + ")";
    }
}
