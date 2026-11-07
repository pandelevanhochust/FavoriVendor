import React from 'react';
import { useRoomStore } from '@/store/roomStore';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { RoomOption } from '@/constants/types';

export interface RoomListProps {
  onOpenBooking: (optionIndex?: number, time?: string) => void;
}

export const RoomList: React.FC<RoomListProps> = ({ onOpenBooking }) => {
  const { options } = useRoomStore();

  // Group options by room name
  const grouped: Record<string, { o: RoomOption; index: number }[]> = {};
  options.forEach((o, index) => {
    if (!grouped[o.room]) grouped[o.room] = [];
    grouped[o.room].push({ o, index });
  });

  return (
    <Card
      title="Phòng & lựa chọn"
      subtitle="Chọn khung giờ để đón khách."
      action={
        <Button size="small" variant="primary" onClick={() => onOpenBooking()}>
          ＋ Thêm khách
        </Button>
      }
    >
      <div className="roomlist">
        {Object.entries(grouped).map(([roomName, arr]) => {
          const hasOnAir = arr.some((x) =>
            Object.values(x.o.slots).some((r) => r.status === 'on air')
          );
          const waitingCount = arr.reduce(
            (n, x) =>
              n + Object.values(x.o.slots).filter((r) => r.status === 'waiting').length,
            0
          );

          let roomStateText = 'Còn trống';
          if (hasOnAir) {
            roomStateText = 'Đang có khách';
          } else if (waitingCount > 0) {
            roomStateText = `${waitingCount} lượt đang chờ`;
          }

          return (
            <div key={roomName} className="room">
              <div className="roomtop">
                <div>
                  <span className="roomname">{roomName}</span>
                  <span className="roommeta">
                    {arr.length} lựa chọn · mỗi lượt 10 phút
                  </span>
                </div>
                <span className="roomstate">{roomStateText}</span>
              </div>
              <div className="options">
                {arr.map(({ o, index }) => {
                  const waiting = Object.values(o.slots).filter(
                    (r) => r.status === 'waiting'
                  ).length;
                  const busy = arr.some((x) =>
                    Object.values(x.o.slots).some((r) => r.status === 'on air')
                  );

                  let optionStateText = 'Còn trống';
                  if (busy) {
                    optionStateText = 'Đang có khách';
                  } else if (waiting > 0) {
                    optionStateText = `${waiting} đang chờ`;
                  }

                  return (
                    <div
                      key={o.label}
                      className={`option ${busy ? 'busy' : ''}`}
                      onClick={() => onOpenBooking(index)}
                    >
                      <span>Lựa chọn {o.label}</span>
                      <span className="state">{optionStateText}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
