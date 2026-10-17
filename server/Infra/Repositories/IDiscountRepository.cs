using VietQrKiosk.Server.Entities;

namespace VietQrKiosk.Server.Infra.Repositories;

public interface IDiscountRepository
{
    Task<DiscountCode?> GetByCodeAsync(string code, bool asNoTracking = false, CancellationToken ct = default);
    Task<List<DiscountCode>> GetActiveDiscountsAsync(CancellationToken ct = default);
    Task AddAsync(DiscountCode discountCode, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
