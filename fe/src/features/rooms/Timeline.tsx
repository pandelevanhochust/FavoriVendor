import React from 'react';
import { useRoomStore } from '@/store/roomStore';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { TIMES } from '@/constants/times';
import { roomStartAvailable } from '@/lib/timeUtils';

export interface TimelineProps {
  onOpenBooking: (optionIndex: number, time: string) => void;
  onOpenRound: (optionIndex: number, time: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ onOpenBooking, onOpenRound }) => {
  const { options, showToast } = useRoomStore();

  return (
    <Card
      className="timelinewrap"
      title="Lượt hôm nay"
      subtitle="Mỗi lượt kéo dài 10 phút."
      action={
        <Button size="small" onClick={() => showToast('Đang hiển thị hôm nay · GMT+7')}>
          Hôm nay⌄
        </Button>
      }
    >
      <div className="timeline">
        <div className="timehead">
          <span>Phòng / lựa chọn</span>
          {TIMES.map((time) => (
            <span key={time}>{time}</span>
          ))}
        </div>

        {options.map((option, optIdx) => {
          // Precalculate which cells are covered by span 2
          const coveredByPrevious = new Set<string>();
          TIMES.forEach((time, i) => {
            if (option.slots[time] && i + 1 < TIMES.length) {
              coveredByPrevious.add(TIMES[i + 1]);
            }
          });

          return (
            <div key={`${option.room}-${option.label}`} className="timeRow">
              <span className="timeRoom">
                {option.room} · {option.label}
              </span>

              {TIMES.map((time) => {
                if (coveredByPrevious.has(time)) {
                  return null; // Hidden because previous slot spans 2
                }

                const round = option.slots[time];
                const isSpanned = !!round;

                if (round) {
                  let statusCls = 'occupied';
                  if (round.status === 'done') statusCls = 'done';
                  else if (round.status === 'on air') statusCls = 'current occupied';

                  return (
                    <div
                      key={time}
                      className={`slot ${statusCls}`}
                      style={{ gridColumn: isSpanned ? 'span 2' : undefined }}
                      onClick={() => onOpenRound(optIdx, time)}
                    >
                      #{round.number}
                    </div>
                  );
                }

                const available = roomStartAvailable(options, option.room, time);
                if (!available) {
                  return (
                    <div
                      key={time}
                      className="slot unavailable"
                      aria-disabled="true"
                    >
                      +
                    </div>
                  );
                }

                return (
                  <div
                    key={time}
                    className="slot"
                    onClick={() => onOpenBooking(optIdx, time)}
                  >
                    +
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
