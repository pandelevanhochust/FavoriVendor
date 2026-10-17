using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Models;

namespace VietQrKiosk.Server.Services.Interfaces;

public interface IOrderService
{
    Task<(bool Success, OrderDto? Order, string? ErrorMessage, int StatusCode)> CreateOrderAsync(
        CreateOrderRequest req, CancellationToken ct);

    Task<(bool Found, OrderDto? Order)> GetOrderAsync(
        string orderId, int waitSeconds, CancellationToken ct);

    Task<(bool Found, OrderDto? Order)> CancelOrderAsync(
        string orderId, CancellationToken ct);
}
