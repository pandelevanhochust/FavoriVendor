import React from 'react';
import { NAV_ITEMS } from '@/constants/navigation';
import { useRoomStore } from '@/store/roomStore';
import { cn } from '@/lib/utils';

export const Sidebar: React.FC = () => {
  const { activeNav, setActiveNav, showToast } = useRoomStore();

  const handleNavClick = (item: typeof NAV_ITEMS[0]) => {
    if (item.demoMessage) {
      showToast(item.demoMessage);
      return;
    }
    if (item.id === 'rooms' || item.id === 'reports') {
      setActiveNav(item.id);
    }
  };

  return (
    <aside className="side">
      <div className="brand">
        <div className="brandmark">❋</div>
        <div>
          <b>Favori Foto</b>
          <small>Không gian chụp ảnh & trà</small>
        </div>
      </div>
      <div className="navlabel">Không gian làm việc</div>
      {NAV_ITEMS.map((item) => (
        <div
          key={item.id}
          className={cn('nav', activeNav === item.id && 'active')}
          onClick={() => handleNavClick(item)}
        >
          <span className="ico">{item.ico}</span>
          <span>{item.label}</span>
        </div>
      ))}
      <div className="sidebottom">
        <div className="avatar">ML</div>
        <div>
          <b>Mia Lê</b>
          <small>Nhân viên phục vụ · đang trong ca</small>
        </div>
      </div>
    </aside>
  );
};
