import React from 'react';
import { useRoomStore } from '@/store/roomStore';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

export interface ShiftSectionProps {
  onOpenShiftModal: () => void;
}

export const ShiftSection: React.FC<ShiftSectionProps> = ({ onOpenShiftModal }) => {
  const { checkedIn } = useRoomStore();

  return (
    <Card
      title="Đang trong ca"
      subtitle="Chấm công trực tiếp · GMT+7"
      action={
        <Button size="small" onClick={onOpenShiftModal}>
          ＋ Ca làm
        </Button>
      }
    >
      <div className="shiftbody">
        {checkedIn.map((name, i) => {
          const initials = name
            .split(' ')
            .map((w) => w[0])
            .join('');
          const timeText = i === 0 ? '08:30 SA' : '10:10 SA';

          return (
            <div key={name} className="shiftrow">
              <div className="person">
                <div className="miniav">{initials}</div>
                <div>
                  <b>{name}</b>
                  <small>Đã vào ca · {timeText}</small>
                </div>
              </div>
              <span className="tag">Đang trong ca</span>
            </div>
          );
        })}

        <div className="divider">
          <div className="cleanhint">
            <span>◷</span>
            <span>
              Đang có nhân viên trực
              <br />
              <b>{checkedIn.length} nhân viên đang làm việc</b>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
