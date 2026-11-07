import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';
import { elapsed, canStartRound, formatMinutesSeconds } from '@/lib/timeUtils';

export interface RoundDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  optionIndex: number;
  time: string;
  onShowQR: (num: number, name: string, time: string) => void;
  onOpenChangeTime: (optionIndex: number, time: string) => void;
  onOpenOverrideTime: (optionIndex: number, time: string) => void;
}

export const RoundDetailModal: React.FC<RoundDetailModalProps> = ({
  isOpen,
  onClose,
  optionIndex,
  time,
  onShowQR,
  onOpenChangeTime,
  onOpenOverrideTime,
}) => {
  const { options, markRound, managerAuth } = useRoomStore();
  const [remainingMs, setRemainingMs] = useState<number>(0);

  const option = options[optionIndex];
  const round = option?.slots[time];

  useEffect(() => {
    if (!isOpen || !round || round.status !== 'on air') return;

    const updateTimer = () => {
      const left = elapsed(round);
      setRemainingMs(left);
      if (left <= 0) {
        // finished
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [isOpen, round]);

  if (!option || !round) return null;

  const isPast = round.status === 'done';
  const isWaiting = round.status === 'waiting';
  const isOnAir = round.status === 'on air';
  const ready = canStartRound(options, optionIndex, time);

  let statusLabel = 'Đang chờ';
  if (isPast) statusLabel = 'Hoàn tất';
  else if (isOnAir) statusLabel = 'Đang diễn ra';
  else if (round.status === 'remind') statusLabel = 'Đến giờ kiểm tra';

  let remainingText = '—';
  if (isOnAir) {
    remainingText = formatMinutesSeconds(remainingMs);
  } else if (isWaiting) {
    remainingText = ready ? '10:00' : 'Đang chờ đến lượt';
  } else if (round.status === 'remind') {
    remainingText = 'Vui lòng kiểm tra khách';
  }

  const endMinute = (parseInt(time.slice(3)) + 10) % 60;
  const timeRangeText = `${time}–${String(endMinute).padStart(2, '0')} · Hôm nay, GMT+7`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${option.room} · Lựa chọn ${option.label}`}
      subtitle={timeRangeText}
    >
      <div className="statusline">
        <span>Trạng thái lượt</span>
        <b>{statusLabel}</b>
      </div>

      <div className="detailgrid">
        <div className="detailbox">
          <small>Số thứ tự</small>
          <b>#{round.number}</b>
        </div>
        <div className="detailbox">
          <small>Khách hàng</small>
          <b>{round.name}</b>
        </div>
        <div className="detailbox">
          <small>Thời gian còn lại</small>
          <b>{remainingText}</b>
        </div>
        <div className="detailbox">
          <small>Dịch vụ thêm</small>
          <b>{isPast ? 'Hoàn tất' : '—'}</b>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {!isPast && (
          <Button onClick={() => onShowQR(round.number, round.name, time)}>
            Hiện mã QR
          </Button>
        )}

        {!isPast && isWaiting && (
          <Button onClick={() => onOpenChangeTime(optionIndex, time)}>
            Đổi giờ
          </Button>
        )}

        {managerAuth && !isPast && isWaiting && (
          <Button
            variant="warn"
            onClick={() => onOpenOverrideTime(optionIndex, time)}
          >
            Ghi đè giờ
          </Button>
        )}

        {!isPast && isWaiting && ready && (
          <Button
            variant="primary"
            onClick={() => {
              markRound(optionIndex, time, 'on air');
            }}
          >
            Mời vào ngay
          </Button>
        )}

        {!isPast && isOnAir && (
          <Button
            variant="primary"
            onClick={() => {
              markRound(optionIndex, time, 'done');
              onClose();
            }}
          >
            Hoàn tất
          </Button>
        )}
      </div>
    </Modal>
  );
};
