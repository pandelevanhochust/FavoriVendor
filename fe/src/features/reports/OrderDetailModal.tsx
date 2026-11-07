import React from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { OrderDto, BankTransactionDto } from '@/api/reportsApi';

export interface OrderDetailModalProps {
  order: OrderDto | null;
  onClose: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  return (
    <Modal
      isOpen={!!order}
      onClose={onClose}
      title={`Chi tiết đơn hàng: #${order.orderId}`}
      subtitle={`Trạng thái: ${order.status} · Tạo tại máy Kiosk`}
    >
      <div className="statusline">
        <span>Số tiền thanh toán:</span>
        <b style={{ color: 'var(--green)', fontSize: '15px' }}>
          {order.amount.toLocaleString('vi-VN')} VND
        </b>
      </div>

      <div className="detailgrid">
        <div className="detailbox">
          <small>Mã đơn hàng</small>
          <b>{order.orderId}</b>
        </div>
        <div className="detailbox">
          <small>Nội dung QR / Chuyển khoản</small>
          <b>{order.content}</b>
        </div>
        <div className="detailbox">
          <small>Số tiền gốc</small>
          <b>{order.originalAmount.toLocaleString('vi-VN')} VND</b>
        </div>
        <div className="detailbox">
          <small>Giảm giá</small>
          <b>{order.discountAmount.toLocaleString('vi-VN')} VND {order.discountCode ? `(${order.discountCode})` : ''}</b>
        </div>
        <div className="detailbox">
          <small>Thời gian thanh toán</small>
          <b>{order.paidAt ? new Date(order.paidAt).toLocaleString('vi-VN') : 'Chưa ghi nhận'}</b>
        </div>
        <div className="detailbox">
          <small>Giao dịch ngân hàng liên kết</small>
          <b>{order.transaction ? order.transaction.transactionId : 'Chưa có hoặc Tiền mặt'}</b>
        </div>
      </div>

      {order.transaction && (
        <div style={{ marginTop: '12px', padding: '12px', background: '#f8faf7', borderRadius: '10px', border: '1px solid #eef2ed' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--green)' }}>
            Thông tin GD ngân hàng đã đối soát thành công:
          </h4>
          <div style={{ fontSize: '11px', color: '#59665c', lineHeight: 1.6 }}>
            <div>Mã GD: <b>{order.transaction.transactionId}</b></div>
            <div>Số tiền: <b>{order.transaction.amount.toLocaleString('vi-VN')}đ</b></div>
            <div>Tài khoản nhận: <b>{order.transaction.bankAccount}</b></div>
            <div>Nội dung GD: <b>{order.transaction.content}</b></div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
};

export interface TxnDetailModalProps {
  transaction: BankTransactionDto | null;
  onClose: () => void;
}

export const TxnDetailModal: React.FC<TxnDetailModalProps> = ({ transaction, onClose }) => {
  if (!transaction) return null;

  return (
    <Modal
      isOpen={!!transaction}
      onClose={onClose}
      title={`Giao dịch: ${transaction.transactionId}`}
      subtitle={`Kết quả: ${transaction.result} · Tài khoản: ${transaction.bankAccount}`}
    >
      <div className="statusline">
        <span>Số tiền nhận được:</span>
        <b style={{ color: 'var(--green)', fontSize: '15px' }}>
          {transaction.amount.toLocaleString('vi-VN')} VND
        </b>
      </div>

      <div className="detailgrid">
        <div className="detailbox">
          <small>Mã đơn hàng liên kết</small>
          <b>{transaction.orderId || 'Không có (NO_ORDER)'}</b>
        </div>
        <div className="detailbox">
          <small>Số tham chiếu (Ref)</small>
          <b>{transaction.referenceNumber || '—'}</b>
        </div>
        <div className="detailbox">
          <small>Loại giao dịch</small>
          <b>{transaction.transType}</b>
        </div>
        <div className="detailbox">
          <small>Thời gian nhận</small>
          <b>{transaction.receivedAt ? new Date(transaction.receivedAt).toLocaleString('vi-VN') : '—'}</b>
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <label style={{ fontSize: '11px', color: '#68746b' }}>Nội dung chi tiết giao dịch:</label>
        <div style={{ marginTop: '4px', padding: '10px', background: '#f8faf7', borderRadius: '8px', fontSize: '12px', border: '1px solid #eef2ed', wordBreak: 'break-word' }}>
          {transaction.content}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
};
