import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';
import { getVNTimeNow } from '@/lib/timeUtils';

export interface ShiftAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShiftAttendanceModal: React.FC<ShiftAttendanceModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { shiftAction } = useRoomStore();
  const [name, setName] = useState('');
  const clock = getVNTimeNow();

  const handleAction = (action: 'in' | 'out') => {
    const success = shiftAction(name, action);
    if (success) {
      setName('');
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chấm công nhân viên"
      subtitle="Ghi nhận vào ca hoặc tan ca. Giờ theo GMT+7."
    >
      <div className="field">
        <label>Tên của bạn</label>
        <input
          placeholder="Nhập tên của bạn"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Giờ địa phương · GMT+7</label>
        <input value={clock} disabled />
      </div>
      <div style={{ display: 'flex', gap: '9px' }}>
        <Button variant="primary" onClick={() => handleAction('in')}>
          Vào ca
        </Button>
        <Button onClick={() => handleAction('out')}>
          Tan ca
        </Button>
      </div>
    </Modal>
  );
};
