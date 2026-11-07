import React from 'react';
import { OrderDto, BankTransactionDto } from '@/api/reportsApi';

export interface ReportStatsProps {
  orders: OrderDto[];
  transactions: BankTransactionDto[];
}

export const ReportStats: React.FC<ReportStatsProps> = ({ orders, transactions }) => {
  // 1. Calculate Revenue from Orders with status PAID
  const paidOrders = orders.filter((o) => o.status === 'PAID');
  const paidAmount = paidOrders.reduce((sum, o) => sum + o.amount, 0);

  // Cash vs Bank breakdown for Orders
  const cashOrders = paidOrders.filter(
    (o) =>
      o.content === 'CASH' ||
      (o.transaction && o.transaction.transType === 'CASH')
  );
  const cashAmount = cashOrders.reduce((sum, o) => sum + o.amount, 0);
  const bankAmount = paidAmount - cashAmount;

  // 2. Orders summary
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'PENDING').length;
  const expiredOrders = orders.filter((o) => o.status === 'EXPIRED').length;

  // 3. Transactions summary
  const totalTxns = transactions.length;
  const noOrderTxns = transactions.filter((t) => t.result === 'NO_ORDER').length;
  const kioskTxns = totalTxns - noOrderTxns;

  // 4. Average Order Value
  const aov = paidOrders.length > 0 ? Math.round(paidAmount / paidOrders.length) : 0;

  return (
    <div className="stat-grid-reports">
      {/* Card 1: Doanh thu thực thu */}
      <div className="stat-report-card">
        <div className="stat-report-header">
          <span>Tổng doanh thu thực thu</span>
          <span style={{ fontSize: '16px' }}>💰</span>
        </div>
        <div className="stat-report-num money">
          {paidAmount.toLocaleString('vi-VN')} <span style={{ fontSize: '15px' }}>₫</span>
        </div>
        <div className="stat-report-breakdown">
          <span>
            Tiền mặt: <b>{cashAmount.toLocaleString('vi-VN')}đ</b>
          </span>
          <span>
            Chuyển khoản: <b>{bankAmount.toLocaleString('vi-VN')}đ</b>
          </span>
        </div>
      </div>

      {/* Card 2: Đơn hàng Kiosk */}
      <div className="stat-report-card">
        <div className="stat-report-header">
          <span>Đơn hàng Kiosk</span>
          <span style={{ fontSize: '16px' }}>🧾</span>
        </div>
        <div className="stat-report-num">
          {paidOrders.length} <span style={{ fontSize: '14px', color: '#657169' }}>/ {totalOrders} đơn</span>
        </div>
        <div className="stat-report-breakdown">
          <span style={{ color: '#315d40' }}>
            Thành công: <b>{paidOrders.length}</b>
          </span>
          {pendingOrders > 0 && (
            <span style={{ color: '#a46d1b' }}>
              Chờ: <b>{pendingOrders}</b>
            </span>
          )}
          {expiredOrders > 0 && (
            <span style={{ color: '#7b867c' }}>
              Hết hạn: <b>{expiredOrders}</b>
            </span>
          )}
        </div>
      </div>

      {/* Card 3: Giao dịch thanh toán */}
      <div className="stat-report-card">
        <div className="stat-report-header">
          <span>Giao dịch thanh toán</span>
          <span style={{ fontSize: '16px' }}>💳</span>
        </div>
        <div className="stat-report-num">
          {totalTxns} <span style={{ fontSize: '14px', color: '#657169' }}>lượt</span>
        </div>
        <div className="stat-report-breakdown">
          <span>
            Khớp đơn: <b>{kioskTxns}</b>
          </span>
          {noOrderTxns > 0 && (
            <span style={{ color: '#6d28d9' }}>
              Thiết bị khác: <b>{noOrderTxns}</b>
            </span>
          )}
        </div>
      </div>

      {/* Card 4: Giá trị trung bình / đơn */}
      <div className="stat-report-card">
        <div className="stat-report-header">
          <span>Giá trị trung bình / đơn</span>
          <span style={{ fontSize: '16px' }}>📈</span>
        </div>
        <div className="stat-report-num">
          {aov.toLocaleString('vi-VN')} <span style={{ fontSize: '15px' }}>₫</span>
        </div>
        <div className="stat-report-breakdown">
          <span>
            Tỷ lệ hoàn tất:{' '}
            <b>
              {totalOrders > 0
                ? `${Math.round((paidOrders.length / totalOrders) * 100)}%`
                : '100%'}
            </b>
          </span>
        </div>
      </div>
    </div>
  );
};
