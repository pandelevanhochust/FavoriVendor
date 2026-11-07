import React, { useState, useEffect } from 'react';
import { Button, Tag, Space, Dropdown, Modal, Input, message } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ApiOutlined,
  SettingOutlined,
  UserOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { getBaseApiUrl, setBaseApiUrl, getApiKey, setApiKey } from '../../api/client';

interface AppHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ collapsed, onToggleCollapse }) => {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentKey, setCurrentKey] = useState('');

  useEffect(() => {
    setCurrentUrl(getBaseApiUrl());
    setCurrentKey(getApiKey());
  }, []);

  const handleSaveConfig = () => {
    setBaseApiUrl(currentUrl);
    setApiKey(currentKey);
    message.success('Đã lưu cấu hình kết nối Backend thành công!');
    setIsConfigModalOpen(false);
    // Reload lại dữ liệu
    window.location.reload();
  };

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
          HiHiBooth Studio Active
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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#f8fafc',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
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
            A
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Admin Quản Lý</span>
        </div>
      </Space>

      {/* Modal Cấu hình Backend */}
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
            placeholder="https://favorivendor.onrender.com hoặc http://localhost:5000"
          />
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Mặc định: Render Production hoặc localhost .NET server
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Kiosk API Key (Header X-Api-Key):
          </label>
          <Input.Password
            value={currentKey}
            onChange={(e) => setCurrentKey(e.target.value)}
            placeholder="Nhập API Key nếu có thay đổi"
          />
        </div>
      </Modal>
    </div>
  );
};
