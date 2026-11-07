import React, { useState } from 'react';
import { Card, Table, Tag, Button, Typography, Space, message, Tooltip } from 'antd';
import { CopyOutlined, QrcodeOutlined, EyeOutlined } from '@ant-design/icons';
import { INITIAL_SESSIONS, PhotoSessionMock } from '../api/mockData';

const { Title, Text } = Typography;

export default function PhotoSessionsPage() {
  const [sessions] = useState<PhotoSessionMock[]>(INITIAL_SESSIONS);

  const handleCopyLink = (token: string) => {
    const url = `https://panel.hihibooth.app/s/${token}`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
    }
    message.success(`Đã sao chép link tải ảnh: ${url}`);
  };

  const columns = [
    {
      title: 'Mã Phiên (Session ID)',
      dataIndex: 'id',
      key: 'id',
      render: (id: string, record: PhotoSessionMock) => (
        <div>
          <Text strong>{id}</Text>
          <div style={{ fontSize: 12, color: '#64748b' }}>Đơn hàng: {record.order_id}</div>
        </div>
      ),
    },
    {
      title: 'Ảnh xem trước',
      key: 'preview',
      render: (_: any, record: PhotoSessionMock) => (
        <img
          src={record.preview_url}
          alt="Preview"
          style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }}
        />
      ),
    },
    {
      title: 'Máy chụp',
      dataIndex: 'machine_code',
      key: 'machine_code',
      render: (m: string) => <Tag color="blue">{m}</Tag>,
    },
    {
      title: 'Khổ ảnh Layout',
      dataIndex: 'layout_name',
      key: 'layout_name',
      render: (l: string) => <Tag color="magenta">{l}</Tag>,
    },
    {
      title: 'Số file ảnh',
      dataIndex: 'photos_count',
      key: 'photos_count',
      render: (count: number) => <span>{count} ảnh + video</span>,
    },
    {
      title: 'Thời gian chụp',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t: string) => <span style={{ fontSize: 12, color: '#64748b' }}>{t}</span>,
    },
    {
      title: 'Link Tải Ảnh (QR Share)',
      key: 'share',
      render: (_: any, record: PhotoSessionMock) => (
        <Space>
          <Tooltip title="Sao chép link web cho khách tải ảnh">
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopyLink(record.share_token)}
            >
              Copy Link
            </Button>
          </Tooltip>
          <Button
            size="small"
            icon={<QrcodeOutlined />}
            onClick={() => message.info(`Mã QR chia sẻ token: ${record.share_token}`)}
          >
            Hiện QR
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Quản Lý Phiên Chụp & Thư Viện Ảnh Khách Hàng</Title>
        <Text style={{ fontSize: 13, color: '#64748b' }}>
          Danh sách các lượt chụp tại Kiosk, tự động đồng bộ ảnh gốc, ảnh lồng khung và mã QR tải ảnh về điện thoại
        </Text>
      </div>

      <Card className="kpi-card" bodyStyle={{ padding: 0 }}>
        <Table dataSource={sessions} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
}
