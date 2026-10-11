package com.example.vietqrapp.api;

import com.example.vietqrapp.model.CreateOrderRequest;
import com.example.vietqrapp.model.OrderResponse;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.Path;
import retrofit2.http.Query;

/** API của SERVER CỦA BẠN (không phải VietQR). Header X-Api-Key được thêm tự động ở KioskRepository. */
public interface KioskApiService {

    @POST("kiosk/orders")
    Call<OrderResponse> createOrder(@Body CreateOrderRequest body);

    /** wait > 0: server giữ kết nối tối đa wait giây tới khi trạng thái đổi (long-poll). */
    @GET("kiosk/orders/{orderId}")
    Call<OrderResponse> getOrder(@Path("orderId") String orderId, @Query("wait") int waitSeconds);

    @POST("kiosk/orders/{orderId}/cancel")
    Call<OrderResponse> cancelOrder(@Path("orderId") String orderId);
}
