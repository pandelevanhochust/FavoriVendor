import React from 'react';
import { Menu } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  PictureOutlined,
  DesktopOutlined,
  CameraOutlined,
  CreditCardOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/router';

interface AppSidebarProps {
  collapsed: boolean;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ collapsed }) => {
  const router = useRouter();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined style={{ fontSize: '16px' }} />,
      label: 'Tổng quan (Dashboard)',
    },
    {
      key: '/layouts',
      icon: <AppstoreOutlined style={{ fontSize: '16px' }} />,
      label: 'Quản lý Layout & Giá',
    },
    {
      key: '/frames',
      icon: <PictureOutlined style={{ fontSize: '16px' }} />,
      label: 'Khung ảnh & Holes',
    },
    {
      key: '/machines',
      icon: <DesktopOutlined style={{ fontSize: '16px' }} />,
      label: 'Máy Kiosk (Photobooth)',
    },
    {
      key: '/photo-sessions',
      icon: <CameraOutlined style={{ fontSize: '16px' }} />,
      label: 'Phiên chụp & Link QR',
    },
    {
      type: 'divider' as const,
    },
    {
      key: '/payment-settings',
      icon: <CreditCardOutlined style={{ fontSize: '16px' }} />,
      label: 'Cài đặt Thanh toán',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand Logo Header */}
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 20px',
          borderBottom: '1px solid #f1f5f9',
          background: '#ffffff',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #f86fa5 0%, #ff8ab7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            boxShadow: '0 2px 6px rgba(248, 111, 165, 0.4)',
          }}
        >
          H
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', lineHeight: 1.2 }}>
              HiHiBooth <span style={{ color: '#f86fa5', fontSize: 13 }}>CMS</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Photobooth Manager</div>
          </div>
        )}
      </div>

      {/* Menu items */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
        <Menu
          mode="inline"
          selectedKeys={[router.pathname]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{ borderRight: 0, fontWeight: 500 }}
        />
      </div>

      {/* Footer Version info */}
      {!collapsed && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
          <div>Phiên bản: <strong>v1.2-prod</strong></div>
          <div style={{ marginTop: 2 }}>Kết nối: .NET 10 API</div>
        </div>
      )}
    </div>
  );
};
