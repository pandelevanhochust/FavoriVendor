import React, { useState } from 'react';
import { Card, Table, Tag, Button, Typography, Space, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import { INITIAL_MACHINES, KioskMachineMock } from '../api/mockData';

const { Title, Text } = Typography;

export default function MachinesPage() {
  const [machines, setMachines] = useState<KioskMachineMock[]>(INITIAL_MACHINES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleCreate = () => {
    form.validateFields().then((vals) => {
      const newM: KioskMachineMock = {
        id: Date.now(),
        name: vals.name,
        code: vals.code.toUpperCase(),
        business_mode: vals.business_mode,
        status: 'active',
        ip_address: '192.168.1.120',
        last_heartbeat: 'Vừa kết nối',
      };
      setMachines((prev) => [...prev, newM]);
      message.success('Đã thêm máy Kiosk mới vào hệ thống!');
      setIsModalOpen(false);
    });
  };

  const columns = [
    {
      title: 'Tên máy Kiosk',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Mã định danh (Device Code)',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Chế độ hoạt động',
      dataIndex: 'business_mode',
      key: 'business_mode',
      render: (mode: string) =>
        mode === 'photobooth' ? (
          <Tag color="magenta">Photobooth Tự Động</Tag>
        ) : (
          <Tag color="geekblue">Self-Studio Chụp Phòng</Tag>
        ),
    },
    {
      title: 'Địa chỉ IP nội bộ',
      dataIndex: 'ip_address',
      key: 'ip_address',
      render: (ip: string) => <code>{ip}</code>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) =>
        s === 'active' ? (
          <Tag color="success">ĐANG ONLINE</Tag>
        ) : (
          <Tag color="default">OFFLINE</Tag>
        ),
    },
    {
      title: 'Lần cuối đồng bộ',
      dataIndex: 'last_heartbeat',
      key: 'last_heartbeat',
      render: (t: string) => <span style={{ fontSize: 12, color: '#64748b' }}>{t}</span>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, record: KioskMachineMock) => (
        <Space>
          <Button
            size="small"
            icon={<KeyOutlined />}
            onClick={() => message.info(`Đã sao chép Kiosk API Token cho ${record.code}`)}
          >
            Lấy Token
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => message.success(`Đã reset kết nối cho ${record.code}`)}
          >
            Reset
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Quản Lý Máy Kiosk & Thiết Bị Chụp</Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Theo dõi trạng thái trực tuyến (Heartbeat) và quản lý API Key cho từng máy Kiosk tại cửa hàng
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ background: '#f86fa5', borderColor: '#f86fa5', borderRadius: 8 }}
          onClick={() => {
            form.resetFields();
            setIsModalOpen(true);
          }}
        >
          Thêm Máy Mới
        </Button>
      </div>

      <Card className="kpi-card" bodyStyle={{ padding: 0 }}>
        <Table dataSource={machines} columns={columns} rowKey="id" pagination={false} />
      </Card>

      <Modal
        title="Đăng Ký Máy Kiosk Mới"
        open={isModalOpen}
        onOk={handleCreate}
        onCancel={() => setIsModalOpen(false)}
        okText="Đăng ký máy"
        cancelText="Đóng"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên gọi gợi nhớ" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Máy Kiosk Quầy 01" />
          </Form.Item>

          <Form.Item name="code" label="Mã thiết bị (Kiosk Device ID)" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: BOOTH-01 hoặc KIOSK-02" />
          </Form.Item>

          <Form.Item name="business_mode" label="Mô hình hoạt động" initialValue="photobooth" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="photobooth">Photobooth Tự Động (Kiosk chụp lấy ngay)</Select.Option>
              <Select.Option value="selfbooth">Self-Studio (Chụp phòng riêng có điều khiển)</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
