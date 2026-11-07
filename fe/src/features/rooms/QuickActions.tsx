import React from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useRoomStore } from '@/store/roomStore';

export interface QuickActionsProps {
  onOpenShiftModal: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onOpenShiftModal }) => {
  const { setView } = useRoomStore();

  return (
    <Card title="Thao tác nhanh" subtitle="Công cụ trong ca">
      <div className="shiftbody" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button size="small" onClick={onOpenShiftModal}>
          Vào ca / tan ca
        </Button>
        <Button size="small" onClick={() => setView('guest')}>
          Mã QR khách hàng
        </Button>
      </div>
    </Card>
  );
};
