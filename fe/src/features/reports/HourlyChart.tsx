import React from 'react';
import { OrderDto, BankTransactionDto } from '@/api/reportsApi';

export interface HourlyChartProps {
  orders: OrderDto[];
  transactions: BankTransactionDto[];
  selectedHour: number | null; // null means all hours
  onSelectHour: (hour: number | null) => void;
}

export const HourlyChart: React.FC<HourlyChartProps> = ({
  orders,
  transactions,
  selectedHour,
  onSelectHour,
}) => {
  // Aggregate stats by hour (0 to 23 in Vietnam time UTC+7)
  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${h}h`,
    revenue: 0,
    orderCount: 0,
    txnCount: 0,
  }));

  // Helper to extract hour (UTC+7) from ISO string or timestamp
  const getVietnamHour = (isoOrMs: string | number | undefined | null): number | null => {
    if (!isoOrMs) return null;
    try {
      const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
      if (isNaN(d.getTime())) return null;
      // Convert to UTC+7 hour
      const utcHour = d.getUTCHours();
      return (utcHour + 7) % 24;
    } catch {
      return null;
    }
  };

  // Aggregate orders
  orders.forEach((o) => {
    if (o.status === 'PAID') {
      const h = getVietnamHour(o.paidAt);
      if (h !== null && h >= 0 && h < 24) {
        hourlyData[h].revenue += o.amount;
        hourlyData[h].orderCount += 1;
      }
    }
  });

  // Aggregate transactions
  transactions.forEach((t) => {
    const h = getVietnamHour(t.receivedAt || t.transactionTimeMs);
    if (h !== null && h >= 0 && h < 24) {
      hourlyData[h].txnCount += 1;
    }
  });

  // Find max revenue for scaling bars
  const maxRevenue = Math.max(...hourlyData.map((d) => d.revenue), 10000);
  const totalRevenue = hourlyData.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="chart-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ font: '700 15px Manrope', margin: 0 }}>
            Phân bố doanh thu theo khung giờ
          </h2>
          <div className="sub" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
            Biểu đồ 24 giờ trong ngày (Múi giờ GMT+7). Nhấn vào cột để lọc theo giờ.
          </div>
        </div>

        {selectedHour !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600 }}>
              Đang lọc khung giờ: <b>{selectedHour}h:00 - {selectedHour}h:59</b>
            </span>
            <button
              className="filter-chip active"
              style={{ padding: '4px 8px', fontSize: '11px' }}
              onClick={() => onSelectHour(null)}
            >
              Hủy lọc giờ ×
            </button>
          </div>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Tổng ngày: <b>{totalRevenue.toLocaleString('vi-VN')}₫</b>
          </span>
        )}
      </div>

      <div className="hourly-bars">
        {hourlyData.map((d) => {
          const heightPercent = d.revenue > 0 ? Math.max(10, Math.round((d.revenue / maxRevenue) * 100)) : 4;
          const isSelected = selectedHour === d.hour;

          return (
            <div
              key={d.hour}
              className={`hourly-col ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectHour(isSelected ? null : d.hour)}
              title={`${d.hour}h:00: ${d.revenue.toLocaleString('vi-VN')}₫ (${d.orderCount} đơn)`}
            >
              <div className="hourly-tooltip">
                <b>{d.hour}h:00 - {d.hour}h:59</b>
                <br />
                Doanh thu: {d.revenue.toLocaleString('vi-VN')}₫
                <br />
                Đơn: {d.orderCount} | GD: {d.txnCount}
              </div>

              <div
                className="hourly-bar-fill"
                style={{
                  height: `${heightPercent}%`,
                  background: isSelected
                    ? 'var(--green)'
                    : d.revenue > 0
                    ? '#81b693'
                    : '#e2e7e0',
                }}
              />
              <span className="hourly-bar-label">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
