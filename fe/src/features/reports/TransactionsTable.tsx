import React from 'react';
import { BankTransactionDto } from '@/api/reportsApi';

export interface TransactionsTableProps {
  transactions: BankTransactionDto[];
  totalCount: number;
  currentPage: number;
  limit: number;
  onPageChange: (page: number) => void;
  onSelectTxn: (txn: BankTransactionDto) => void;
}

export const TransactionsTable: React.FC<TransactionsTableProps> = ({
  transactions,
  totalCount,
  currentPage,
  limit,
  onPageChange,
  onSelectTxn,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const formatTime = (isoOrMs?: string | number | null) => {
    if (!isoOrMs) return '—';
    try {
      const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
      if (isNaN(d.getTime())) return String(isoOrMs);
      return d.toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' ' + d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch {
      return String(isoOrMs);
    }
  };

  const renderTypeTag = (t: BankTransactionDto) => {
    if (t.transType === 'CASH' || t.bankAccount === 'CASH_BOX') {
      return <span className="badge-tag cash">💵 Tiền mặt</span>;
    }
    if (t.result === 'NO_ORDER') {
      return <span className="badge-tag no_order">🟣 Khác (No order)</span>;
    }
    return <span className="badge-tag bank">💳 Chuyển khoản</span>;
  };

  return (
    <div>
      <div className="table-responsive">
        <table className="report-table">
          <thead>
            <tr>
              <th>Mã giao dịch</th>
              <th>Mã đơn liên kết</th>
              <th>Loại giao dịch</th>
              <th>Tài khoản</th>
              <th>Nội dung thanh toán</th>
              <th style={{ textAlign: 'right' }}>Số tiền</th>
              <th>Thời gian nhận (GMT+7)</th>
              <th style={{ textAlign: 'center' }}>Kết quả</th>
              <th style={{ textAlign: 'center' }}>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length > 0 ? (
              transactions.map((t) => (
                <tr key={t.id || t.transactionId}>
                  <td>
                    <b style={{ color: 'var(--ink)', fontFamily: 'monospace', fontSize: '12px' }}>
                      {t.transactionId}
                    </b>
                  </td>
                  <td>
                    {t.orderId ? (
                      <code style={{ background: '#edf4ed', color: 'var(--green)', padding: '2px 5px', borderRadius: '4px' }}>
                        {t.orderId}
                      </code>
                    ) : (
                      <span style={{ color: '#a0a9a0', fontSize: '11px' }}>— Không có —</span>
                    )}
                  </td>
                  <td>{renderTypeTag(t)}</td>
                  <td>
                    <span style={{ fontSize: '11px', color: '#526057' }}>
                      {t.bankAccount || '—'}
                    </span>
                  </td>
                  <td style={{ maxWidth: '280px' }}>
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: '11px',
                        color: '#657169',
                      }}
                      title={t.content}
                    >
                      {t.content || '—'}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                    {t.amount.toLocaleString('vi-VN')}đ
                  </td>
                  <td style={{ color: '#68746b', fontSize: '11px' }}>
                    {formatTime(t.receivedAt || t.transactionTimeMs)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {t.result === 'PAID' ? (
                      <span className="badge-tag paid">✓ PAID</span>
                    ) : t.result === 'NO_ORDER' ? (
                      <span className="badge-tag no_order">NO ORDER</span>
                    ) : (
                      <span className="badge-tag">{t.result}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="button small"
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      onClick={() => onSelectTxn(t)}
                    >
                      Xem
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-state-icon">💳</div>
                    <b>Không có giao dịch nào thỏa mãn bộ lọc</b>
                    <p style={{ margin: '4px 0 0', fontSize: '11px' }}>
                      Hãy thử đổi ngày hoặc chuyển sang loại giao dịch khác.
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
          Hiển thị <b>{transactions.length}</b> trên tổng số <b>{totalCount}</b> giao dịch
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
