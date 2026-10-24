using Microsoft.EntityFrameworkCore;
using VietQrKiosk.Server.Entities;
using VietQrKiosk.Server.Infra.Data;

namespace VietQrKiosk.Server.Infra.Repositories;

public class OrderRepository : IOrderRepository
{
    private readonly AppDbContext _db;

    public OrderRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<Order?> GetByIdAsync(string orderId, bool asNoTracking = false, CancellationToken ct = default)
    {
        var query = asNoTracking ? _db.Orders.AsNoTracking() : _db.Orders;
        return await query.FirstOrDefaultAsync(o => o.OrderId == orderId, ct);
    }

    public async Task<Order?> GetByContentAsync(string content, bool asNoTracking = false, CancellationToken ct = default)
    {
        var upperContent = content.Trim().ToUpperInvariant();
        var query = asNoTracking ? _db.Orders.AsNoTracking() : _db.Orders;

        // 1. Khớp chính xác nội dung
        var exact = await query.FirstOrDefaultAsync(o => o.QrContent != null && o.QrContent.ToUpper() == upperContent, ct);
        if (exact != null) return exact;

        // 2. Tìm trong các đơn PENDING gần nhất (trong 24 giờ qua): ngân hàng chèn thêm tên/nội dung
        var recentPending = await query
            .Where(o => o.Status == OrderStatus.Pending && o.CreatedAt >= DateTime.UtcNow.AddHours(-24))
            .OrderByDescending(o => o.CreatedAt)
            .Take(50)
            .ToListAsync(ct);

        foreach (var o in recentPending)
        {
            if (!string.IsNullOrEmpty(o.OrderId) && upperContent.Contains(o.OrderId.ToUpperInvariant()))
                return o;
            if (!string.IsNullOrEmpty(o.QrContent) && upperContent.Contains(o.QrContent.ToUpperInvariant()))
                return o;
        }

        // 3. Nếu không có đơn PENDING, kiểm tra các đơn tạo trong 2 giờ qua (kể cả đã Expired) để nhận diện
        var recentOthers = await query
            .Where(o => o.CreatedAt >= DateTime.UtcNow.AddHours(-2))
            .OrderByDescending(o => o.CreatedAt)
            .Take(50)
            .ToListAsync(ct);

        foreach (var o in recentOthers)
        {
            if (!string.IsNullOrEmpty(o.OrderId) && upperContent.Contains(o.OrderId.ToUpperInvariant()))
                return o;
            if (!string.IsNullOrEmpty(o.QrContent) && upperContent.Contains(o.QrContent.ToUpperInvariant()))
                return o;
        }

        return null;
    }

    public async Task AddAsync(Order order, CancellationToken ct = default)
    {
        await _db.Orders.AddAsync(order, ct);
    }

    public async Task<List<Order>> GetExpiredPendingOrdersAsync(DateTime nowUtc, CancellationToken ct = default)
    {
        return await _db.Orders
            .Where(o => o.Status == OrderStatus.Pending && o.ExpiresAt < nowUtc)
            .ToListAsync(ct);
    }

    public async Task<List<Order>> GetOrdersFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        OrderStatus? status = null,
        string? paymentType = null,
        int limit = 50,
        int page = 1,
        CancellationToken ct = default)
    {
        var query = _db.Orders.AsNoTracking().AsQueryable();

        if (fromUtc.HasValue)
        {
            query = query.Where(o => o.CreatedAt >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            query = query.Where(o => o.CreatedAt <= toUtc.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(o => o.Status == status.Value);
        }

        if (!string.IsNullOrWhiteSpace(paymentType))
        {
            var pType = paymentType.Trim().ToLowerInvariant();
            if (pType is "cash" or "tien_mat")
            {
                query = query.Where(o => o.QrContent == "CASH" || (o.BankTransactionId != null && o.BankTransactionId.StartsWith("CASH-")));
            }
            else if (pType is "bank" or "vietqr" or "transfer" or "chuyen_khoan")
            {
                query = query.Where(o => o.QrContent != "CASH" && (o.BankTransactionId == null || !o.BankTransactionId.StartsWith("CASH-")));
            }
        }

        var p = Math.Max(1, page);
        var take = Math.Clamp(limit, 1, 500);
        var skip = (p - 1) * take;

        return await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);
    }

    public async Task<int> CountOrdersFilteredAsync(
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        OrderStatus? status = null,
        string? paymentType = null,
        CancellationToken ct = default)
    {
        var query = _db.Orders.AsNoTracking().AsQueryable();

        if (fromUtc.HasValue)
        {
            query = query.Where(o => o.CreatedAt >= fromUtc.Value);
        }

        if (toUtc.HasValue)
        {
            query = query.Where(o => o.CreatedAt <= toUtc.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(o => o.Status == status.Value);
        }

        if (!string.IsNullOrWhiteSpace(paymentType))
        {
            var pType = paymentType.Trim().ToLowerInvariant();
            if (pType is "cash" or "tien_mat")
            {
                query = query.Where(o => o.QrContent == "CASH" || (o.BankTransactionId != null && o.BankTransactionId.StartsWith("CASH-")));
            }
            else if (pType is "bank" or "vietqr" or "transfer" or "chuyen_khoan")
            {
                query = query.Where(o => o.QrContent != "CASH" && (o.BankTransactionId == null || !o.BankTransactionId.StartsWith("CASH-")));
            }
        }

        return await query.CountAsync(ct);
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
