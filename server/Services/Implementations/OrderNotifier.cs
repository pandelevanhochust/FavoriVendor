using System.Collections.Concurrent;
using VietQrKiosk.Server.Services.Interfaces;

namespace VietQrKiosk.Server.Services.Implementations;

/// <summary>
/// Cho phép app Android "long-poll": request GET giữ kết nối tới khi đơn đổi trạng thái
/// (hoặc hết thời gian chờ) thay vì hỏi liên tục. Trạng thái thật luôn nằm trong DB;
/// đây chỉ là cơ chế đánh thức để phản hồi tức thì qua HTTP API Callback / Long-polling.
/// </summary>
public class OrderNotifier : IOrderNotifier
{
    private readonly ConcurrentDictionary<string, TaskCompletionSource> _waiters = new();

    public Task Register(string orderId) =>
        _waiters.GetOrAdd(orderId,
            _ => new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).Task;

    public void Notify(string orderId)
    {
        if (_waiters.TryRemove(orderId, out var tcs))
            tcs.TrySetResult();
    }

    public async Task WaitAsync(Task registered, TimeSpan timeout, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var delay = Task.Delay(timeout, cts.Token);
        await Task.WhenAny(registered, delay);
        cts.Cancel();
    }
}
