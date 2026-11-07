import React from 'react';
import { Modal } from '@/components/Modal';
import { useRoomStore } from '@/store/roomStore';

export interface ManagerStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManagerStorageModal: React.FC<ManagerStorageModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { customerHistory, attendanceHistory, checkedIn } = useRoomStore();

  const ratingLabel = (rating?: string) => {
    switch (rating) {
      case 'sad':
        return 'Không hài lòng';
      case 'neutral':
        return 'Ổn thôi';
      case 'happy':
        return 'Sẽ quay lại';
      default:
        return '—';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kho dữ liệu dùng chung"
      subtitle={`${customerHistory.length} hồ sơ khách · ${attendanceHistory.length} lượt chấm công`}
    >
      <h4>Khách hàng</h4>
      <div className="storage-table-wrap">
        <table className="storage-table">
          <thead>
            <tr>
              <th>Số</th>
              <th>Tên</th>
              <th>Nguồn</th>
              <th>Đánh giá</th>
              <th>Góp ý</th>
            </tr>
          </thead>
          <tbody>
            {customerHistory.length > 0 ? (
              customerHistory.map((c, i) => (
                <tr key={i}>
                  <td>#{c.number}</td>
                  <td>{c.name}</td>
                  <td>{c.source || '—'}</td>
                  <td>{ratingLabel(c.rating)}</td>
                  <td>{c.feedback || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>Chưa có dữ liệu khách hàng.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h4>Chấm công nhân viên</h4>
      <div className="storage-table-wrap">
        <table className="storage-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Thao tác</th>
              <th>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {attendanceHistory.length > 0 ? (
              attendanceHistory.map((a, i) => (
                <tr key={i}>
                  <td>{a.name}</td>
                  <td>{a.action === 'in' ? 'Vào ca' : 'Tan ca'}</td>
                  <td>{a.at}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>Chưa có lịch sử chấm công.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="storage-current">
        Đang trong ca: {checkedIn.join(', ') || 'Không có nhân viên'}
      </p>
    </Modal>
  );
};
