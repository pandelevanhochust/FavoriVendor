namespace VietQrKiosk.Server.Services.Interfaces;

public interface IOrderNotifier
{
    Task Register(string orderId);
    void Notify(string orderId);
    Task WaitAsync(Task registered, TimeSpan timeout, CancellationToken ct);
}
