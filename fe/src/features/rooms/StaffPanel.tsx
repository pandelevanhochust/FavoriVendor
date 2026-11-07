import React from 'react';
import { RoomList } from './RoomList';
import { Timeline } from './Timeline';
import { ShiftSection } from './ShiftSection';
import { CleaningReminder } from './CleaningReminder';
import { RecentActivity } from './RecentActivity';
import { QuickActions } from './QuickActions';

export interface StaffPanelProps {
  onOpenBooking: (optionIndex?: number, time?: string) => void;
  onOpenRound: (optionIndex: number, time: string) => void;
  onOpenShiftModal: () => void;
}

export const StaffPanel: React.FC<StaffPanelProps> = ({
  onOpenBooking,
  onOpenRound,
  onOpenShiftModal,
}) => {
  return (
    <div id="staffPanel">
      <div className="heading">
        <div>
          <h1>Quản lý phòng</h1>
          <p>Theo dõi phòng và đón vị khách tiếp theo.</p>
        </div>
        <div className="date">✳　Thứ Năm, ngày 1 tháng 10</div>
      </div>

      <div className="content">
        <div>
          <RoomList onOpenBooking={onOpenBooking} />
          <Timeline onOpenBooking={onOpenBooking} onOpenRound={onOpenRound} />
        </div>

        <div className="sidecol">
          <ShiftSection onOpenShiftModal={onOpenShiftModal} />
          <CleaningReminder />
          <RecentActivity />
          <QuickActions onOpenShiftModal={onOpenShiftModal} />
        </div>
      </div>
    </div>
  );
};
