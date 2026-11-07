import React from 'react';
import { useRoomStore } from '@/store/roomStore';
import { Button } from '@/components/Button';
import { cn } from '@/lib/utils';

export interface TopBarProps {
  onOpenManagerAccess: () => void;
  onOpenManagerRooms: () => void;
  onOpenManagerStorage: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenManagerAccess,
  onOpenManagerRooms,
  onOpenManagerStorage,
}) => {
  const {
    checkedIn,
    currentView,
    activeNav,
    setView,
    managerAuth,
    managerConfigured,
    managerLogout,
  } = useRoomStore();

  return (
    <div className="top">
      <div className="crumb">
        Favori Foto　/　<b>{activeNav === 'reports' ? 'Báo cáo & Đối soát' : 'Quản lý phòng'}</b>
      </div>
      <div className="topright">
        <div className="live">
          <i />
          <span>{checkedIn.length} nhân viên đang làm</span>
        </div>
        <div className="switchview">
          <button
            className={cn(currentView === 'staff' && 'active')}
            onClick={() => setView('staff')}
          >
            Giao diện nhân viên
          </button>
          <button
            className={cn(currentView === 'guest' && 'active')}
            onClick={() => setView('guest')}
          >
            Xem trước giao diện khách
          </button>
        </div>
        <Button
          size="small"
          onClick={onOpenManagerAccess}
        >
          {managerAuth
            ? 'Quản lý ✓'
            : managerConfigured
            ? 'Đăng nhập quản lý'
            : 'Thiết lập quản lý'}
        </Button>
        {managerAuth && (
          <div className="manager-tools">
            <Button size="small" onClick={onOpenManagerRooms}>
              Sửa phòng
            </Button>
            <Button size="small" onClick={onOpenManagerStorage}>
              Kho dữ liệu
            </Button>
            <Button size="small" onClick={managerLogout}>
              Đăng xuất
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
