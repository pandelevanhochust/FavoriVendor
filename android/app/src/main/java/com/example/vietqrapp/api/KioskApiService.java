package com.example.vietqrapp.api;

import com.example.vietqrapp.model.BankTransactionResponse;
import com.example.vietqrapp.model.CreateOrderRequest;
import com.example.vietqrapp.model.OrderResponse;
import com.example.vietqrapp.model.ValidateDiscountRequest;
import com.example.vietqrapp.model.ValidateDiscountResponse;

import java.util.List;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.Path;
import retrofit2.http.Query;

/** API của SERVER CỦA BẠN (tiền tố vendor/...). Header X-Api-Key được thêm tự động ở KioskRepository. */
public interface KioskApiService {

    @POST("vendor/orders")
    Call<OrderResponse> createOrder(@Body CreateOrderRequest body);

    /** wait > 0: server giữ kết nối tối đa wait giây tới khi trạng thái đổi (long-poll). */
    @GET("vendor/orders/{orderId}")
    Call<OrderResponse> getOrder(@Path("orderId") String orderId, @Query("wait") int waitSeconds);

    @POST("vendor/orders/{orderId}/cancel")
    Call<OrderResponse> cancelOrder(@Path("orderId") String orderId);

    @POST("vendor/discounts/validate")
    Call<ValidateDiscountResponse> validateDiscount(@Body ValidateDiscountRequest body);

    @POST("vendor/discounts")
    Call<com.example.vietqrapp.model.DiscountSummaryResponse> createDiscount(@Body com.example.vietqrapp.model.CreateDiscountRequest body);

    @GET("vendor/discounts/active")
    Call<List<com.example.vietqrapp.model.DiscountSummaryResponse>> getActiveDiscounts();

    @GET("vendor/transactions/{orderId}")
    Call<BankTransactionResponse> getTransactionByOrderId(@Path("orderId") String orderId);

    @GET("vendor/transactions")
    Call<List<BankTransactionResponse>> getRecentTransactions(@Query("limit") int limit);

    @POST("vendor/transactions/cash")
    Call<com.example.vietqrapp.model.SyncCashTransactionResponse> syncCashTransaction(@Body com.example.vietqrapp.model.SyncCashTransactionRequest body);
}
