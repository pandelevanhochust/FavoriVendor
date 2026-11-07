import React from 'react';
import { OrderDto } from '@/api/reportsApi';

export interface OrdersTableProps {
  orders: OrderDto[];
  totalCount: number;
  currentPage: number;
  limit: number;
  onPageChange: (page: number) => void;
  onSelectOrder: (order: OrderDto) => void;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  totalCount,
  currentPage,
  limit,
  onPageChange,
  onSelectOrder,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const formatTime = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' ' + d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch {
      return iso;
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <span className="badge-tag paid">✓ Đã thanh toán</span>;
      case 'PENDING':
        return <span className="badge-tag pending">◷ Đang chờ</span>;
      case 'EXPIRED':
        return <span className="badge-tag expired">✕ Hết hạn</span>;
      case 'CANCELLED':
        return <span className="badge-tag cancelled">✕ Đã hủy</span>;
      default:
        return <span className="badge-tag">{status}</span>;
    }
  };

  const renderTypeBadge = (order: OrderDto) => {
    const isCash =
      order.content === 'CASH' ||
      (order.transaction && order.transaction.transType === 'CASH');

    if (isCash) {
      return <span className="badge-tag cash">💵 Tiền mặt</span>;
    }
    return <span className="badge-tag bank">💳 VietQR</span>;
  };

  return (
    <div>
      <div className="table-responsive">
        <table className="report-table">
          <thead>
            <tr>
              <th>Mã đơn hàng</th>
              <th>Thời gian</th>
              <th>Hình thức</th>
              <th>Nội dung QR / Chuyển khoản</th>
              <th style={{ textAlign: 'right' }}>Số tiền gốc</th>
              <th style={{ textAlign: 'right' }}>Giảm giá</th>
              <th style={{ textAlign: 'right' }}>Cần thu</th>
              <th style={{ textAlign: 'center' }}>Trạng thái</th>
              <th style={{ textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {orders.length > 0 ? (
              orders.map((o) => (
                <tr key={o.orderId}>
                  <td>
                    <b style={{ color: 'var(--ink)', fontFamily: 'monospace', fontSize: '13px' }}>
                      {o.orderId}
                    </b>
                  </td>
                  <td style={{ color: '#68746b', fontSize: '11px' }}>
                    {formatTime(o.paidAt)}
                  </td>
                  <td>{renderTypeBadge(o)}</td>
                  <td>
                    <code style={{ background: '#f2f5f1', padding: '3px 6px', borderRadius: '4px' }}>
                      {o.content || '—'}
                    </code>
                  </td>
                  <td style={{ textAlign: 'right', color: '#7d897f' }}>
                    {o.originalAmount ? o.originalAmount.toLocaleString('vi-VN') + 'đ' : '—'}
                  </td>
                  <td style={{ textAlign: 'right', color: '#c53030' }}>
                    {o.discountAmount > 0 ? `-${o.discountAmount.toLocaleString('vi-VN')}đ` : '0đ'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                    {o.amount.toLocaleString('vi-VN')}đ
                  </td>
                  <td style={{ textAlign: 'center' }}>{renderStatusBadge(o.status)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="button small"
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      onClick={() => onSelectOrder(o)}
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <b>Không tìm thấy đơn hàng nào</b>
                    <p style={{ margin: '4px 0 0', fontSize: '11px' }}>
                      Thử điều chỉnh lại bộ lọc ngày, khoảng giờ hoặc loại đơn hàng.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="pagination-footer">
        <div>
          Hiển thị <b>{orders.length}</b> trên tổng số <b>{totalCount}</b> đơn hàng
        </div>

        {totalPages > 1 && (
          <div className="pagination-controls">
            <button
              className="button small"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              ← Trước
            </button>
            <span style={{ fontSize: '12px', padding: '0 6px' }}>
              Trang <b>{currentPage}</b> / {totalPages}
            </span>
            <button
              className="button small"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Sau →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
