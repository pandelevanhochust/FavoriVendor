import React from 'react';
import { Card } from '@/components/Card';

export const RecentActivity: React.FC = () => {
  return (
    <Card title="Hoạt động gần đây" subtitle="Hoạt động mới nhất tại Favori Foto">
      <div className="activity">
        <div className="event">
          <time>10:18</time>
          <span>
            <b>Khách số 14</b> đã nhận phòng · Phòng trà
          </span>
        </div>
        <div className="event">
          <time>10:10</time>
          <span>
            <b>Alex</b> đã bắt đầu ca làm
          </span>
        </div>
        <div className="event">
          <time>09:50</time>
          <span>
            <b>Khách số 13</b> đã hoàn tất lượt
          </span>
        </div>
      </div>
    </Card>
  );
};
