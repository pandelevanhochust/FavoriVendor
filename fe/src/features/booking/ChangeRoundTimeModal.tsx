import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';
import { TIMES } from '@/constants/times';
import { roomStartAvailableExcept, getVNTimeNow } from '@/lib/timeUtils';

export interface ChangeRoundTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  optionIndex: number;
  time: string;
}

export const ChangeRoundTimeModal: React.FC<ChangeRoundTimeModalProps> = ({
  isOpen,
  onClose,
  optionIndex,
  time,
}) => {
  const { options, changeRoundTime } = useRoomStore();
  const option = options[optionIndex];
  const round = option?.slots[time];

  const candidateTimes = useMemo(() => {
    if (!option || !round) return [];
    const now = getVNTimeNow();
    return TIMES.filter(
      (t) => t >= now && roomStartAvailableExcept(options, option.room, t, round)
    );
  }, [options, option, round]);

  const [newTime, setNewTime] = useState<string>(time);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTime) return;
    const ok = changeRoundTime(optionIndex, time, newTime);
    if (ok) onClose();
  };

  if (!option || !round) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Đổi giờ lượt"
      subtitle={`${option.room} · Lựa chọn ${option.label} · Khách số ${round.number}`}
    >
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
          Lưu giờ mới
        </Button>
      </form>
    </Modal>
  );
};
