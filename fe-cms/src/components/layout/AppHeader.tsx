import React, { useState, useEffect } from 'react';
import { Button, Tag, Space, Dropdown, Modal, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ApiOutlined,
  UserOutlined,
  LogoutOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { getBaseApiUrl, setBaseApiUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AppHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ collapsed, onToggleCollapse }) => {
  const { user, logout } = useAuth();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    setCurrentUrl(getBaseApiUrl());
  }, []);

  const handleSaveConfig = () => {
    setBaseApiUrl(currentUrl);
    message.success('Đã lưu cấu hình kết nối Backend thành công!');
    setIsConfigModalOpen(false);
    window.location.reload();
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 600 }}>{user?.fullName || 'Quản trị viên'}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>@{user?.username || 'admin'} ({user?.role || 'Admin'})</div>
        </div>
      ),
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      danger: true,
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      onClick: logout,
    },
  ];

  return (
    <div
      style={{
        height: 64,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid #f1f5f9',
      }}
    >
      <Space size="middle">
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleCollapse}
          style={{ fontSize: 16, width: 40, height: 40 }}
        />
        <Tag color="magenta" icon={<CheckCircleOutlined />}>
          Favori PhotoBooth Active
        </Tag>
      </Space>

      <Space size="middle">
        <Button
          type="dashed"
          icon={<ApiOutlined />}
          onClick={() => setIsConfigModalOpen(true)}
          style={{ borderRadius: 8 }}
        >
          Kết nối Backend
        </Button>

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" arrow>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              background: '#f8fafc',
              borderRadius: 20,
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#f86fa5',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {user?.username ? user.username.charAt(0).toUpperCase() : 'A'}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
              {user?.username || 'admin'}
            </span>
          </div>
        </Dropdown>
      </Space>

      {/* Modal Cấu hình Backend URL */}
      <Modal
        title="Cấu hình Kết nối API Backend .NET"
        open={isConfigModalOpen}
        onOk={handleSaveConfig}
        onCancel={() => setIsConfigModalOpen(false)}
        okText="Lưu & Áp dụng"
        cancelText="Đóng"
      >
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Backend API Base URL:
          </label>
          <Input
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            placeholder="http://localhost:5000 hoặc https://favorivendor.onrender.com"
          />
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Mặc định: http://localhost:5000
          </div>
        </div>
      </Modal>
    </div>
  );
};
