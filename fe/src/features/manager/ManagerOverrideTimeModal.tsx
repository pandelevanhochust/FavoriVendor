import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';
import { TIMES } from '@/constants/times';

export interface ManagerOverrideTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  optionIndex: number;
  time: string;
}

export const ManagerOverrideTimeModal: React.FC<ManagerOverrideTimeModalProps> = ({
  isOpen,
  onClose,
  optionIndex,
  time,
}) => {
  const { options, managerOverrideTime } = useRoomStore();
  const option = options[optionIndex];
  const round = option?.slots[time];

  const candidateTimes = useMemo(() => {
    if (!option) return [];
    return TIMES.filter((t) => t === time || !option.slots[t]);
  }, [option, time]);

  const [newTime, setNewTime] = useState<string>(time);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTime) return;
    const ok = managerOverrideTime(optionIndex, time, newTime);
    if (ok) onClose();
  };

  if (!option || !round) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ghi đè giờ lượt"
      subtitle={`Khách số ${round.number} · ${option.room} · Lựa chọn ${option.label}`}
    >
      <p className="override-note">
        Quản lý có thể đặt lượt này vào thời gian đang có lượt ở lựa chọn khác cùng phòng.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Giờ bắt đầu mới · GMT+7</label>
          <select
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
          >
            {candidateTimes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <Button variant="primary" full type="submit">
          Lưu giờ ghi đè
        </Button>
      </form>
    </Modal>
  );
};
