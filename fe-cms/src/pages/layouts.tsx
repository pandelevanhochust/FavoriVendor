import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Typography,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  message,
  Popconfirm,
  Spin,
  Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, MinusCircleOutlined } from '@ant-design/icons';
import {
  PhotoLayout,
  PricingTier,
  getLayouts,
  createLayout,
  updateLayout,
  deleteLayout,
} from '../api/photoLayoutApi';

const { Title, Text } = Typography;

export default function LayoutsPage() {
  const [layouts, setLayouts] = useState<PhotoLayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState<PhotoLayout | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getLayouts();
      setLayouts(data);
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể tải danh sách khổ ảnh từ server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatVnd = (amt: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
  };

  const handleOpenModal = (layout?: PhotoLayout) => {
    if (layout) {
      setEditingLayout(layout);
      form.setFieldsValue({
        id: layout.id,
        name: layout.name,
        slug: layout.slug,
        widthPx: layout.widthPx,
        heightPx: layout.heightPx,
        holeCount: layout.holeCount,
        description: layout.description,
        isActive: layout.isActive,
        displayOrder: layout.displayOrder,
        pricingTiers: layout.pricingTiers && layout.pricingTiers.length > 0
          ? layout.pricingTiers
          : [{ quantity: 2, price: 70000 }],
      });
    } else {
      setEditingLayout(null);
      form.resetFields();
      form.setFieldsValue({
        id: '',
        name: '',
        widthPx: 1200,
        heightPx: 1800,
        holeCount: 4,
        isActive: true,
        displayOrder: 1,
        pricingTiers: [
          { quantity: 2, price: 70000 },
          { quantity: 4, price: 100000 },
        ],
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingLayout) {
        await updateLayout(editingLayout.id, values);
        message.success(`Đã cập nhật khổ ảnh '${editingLayout.name}' thành công!`);
      } else {
        await createLayout(values);
        message.success(`Đã tạo khổ ảnh '${values.name}' thành công!`);
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err?.errorFields) return;
      console.error(err);
      message.error(err?.response?.data?.message || 'Lỗi khi lưu cấu hình khổ ảnh.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLayout(id);
      message.success('Đã xóa khổ ảnh thành công!');
      loadData();
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể xóa khổ ảnh.');
    }
  };

  const columns = [
    {
      title: 'Mã Khổ (ID)',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <Tag color="magenta" style={{ fontWeight: 700, fontSize: 13, padding: '3px 8px' }}>
          {id}
        </Tag>
      ),
    },
    {
      title: 'Tên Khổ Ảnh',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: PhotoLayout) => (
        <div>
          <Text strong style={{ color: '#1e293b' }}>{text}</Text>
          {record.description && (
            <div style={{ fontSize: 12, color: '#64748b' }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Kích Thước (W x H)',
      key: 'dimension',
      render: (_: any, record: PhotoLayout) => (
        <span style={{ fontFamily: 'monospace', color: '#475569' }}>
          {record.widthPx} × {record.heightPx} px
        </span>
      ),
    },
    {
      title: 'Số Ô Ảnh (Holes)',
      dataIndex: 'holeCount',
      key: 'holeCount',
      render: (val: number) => <Tag color="blue">{val} ô ảnh</Tag>,
    },
    {
      title: 'Bậc Giá Theo Số Bản In',
      key: 'pricingTiers',
      render: (_: any, record: PhotoLayout) => (
        <Space direction="vertical" size={2}>
          {record.pricingTiers && record.pricingTiers.length > 0 ? (
            record.pricingTiers.map((tier, idx) => (
              <Tag key={idx} color="purple">
                {tier.quantity} bản: <b>{formatVnd(tier.price)}</b>
              </Tag>
            ))
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>Chưa đặt giá</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Số Khung',
      dataIndex: 'frameCount',
      key: 'frameCount',
      render: (val?: number) => <Tag color="cyan">{val ?? 0} khung</Tag>,
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? 'Đang bật' : 'Tắt'}</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: PhotoLayout) => (
        <Space direction="horizontal">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
            style={{ color: '#0284c7' }}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xác nhận xoá khổ ảnh?"
            description="Tất cả khung ảnh thuộc khổ này sẽ bị ảnh hưởng!"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Cấu Hình Khổ Ảnh (Layouts)</Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Quản lý kích cỡ bản in, số ô ảnh (holes) và các mốc giá theo số lượng bản in trên máy PhotoBooth
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: '#f86fa5', borderColor: '#f86fa5', borderRadius: 8 }}
            onClick={() => handleOpenModal()}
          >
            Thêm Khổ Mới
          </Button>
        </Space>
      </div>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Table
          dataSource={layouts}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingLayout ? `Sửa Khổ Ảnh: ${editingLayout.name}` : 'Thêm Khổ Ảnh Mới'}
        open={isModalOpen}
        onOk={handleSave}
        confirmLoading={submitting}
        onCancel={() => setIsModalOpen(false)}
        okText="Lưu Khổ Ảnh"
        cancelText="Đóng"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
            <Form.Item
              name="id"
              label="Mã Khổ (ID)"
              rules={[{ required: true, message: 'Nhập mã ID (vd: 1x4, 2x2, 2x3)' }]}
            >
              <Input placeholder="ví dụ: 1x4" disabled={!!editingLayout} />
            </Form.Item>
            <Form.Item
              name="name"
              label="Tên Hiển Thị Khổ Ảnh"
              rules={[{ required: true, message: 'Vui lòng nhập tên khổ ảnh' }]}
            >
              <Input placeholder="ví dụ: Dải 4 ảnh (1x4 Strips)" />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} placeholder="Mô tả ngắn về khổ ảnh này..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item
              name="widthPx"
              label="Chiều Rộng (px)"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: '100%' }} min={100} max={10000} />
            </Form.Item>

            <Form.Item
              name="heightPx"
              label="Chiều Cao (px)"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: '100%' }} min={100} max={10000} />
            </Form.Item>

            <Form.Item
              name="holeCount"
              label="Số Ô Ảnh (Holes)"
              rules={[{ required: true }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} max={20} />
            </Form.Item>

            <Form.Item name="displayOrder" label="Thứ tự hiển thị">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </div>

          <Divider orientation="left" style={{ margin: '12px 0', fontSize: 13, color: '#f86fa5' }}>
            Mốc Giá In (Pricing Tiers)
          </Divider>

          <Form.List name="pricingTiers">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, 'quantity']}
                      rules={[{ required: true, message: 'Nhập số bản' }]}
                    >
                      <InputNumber min={1} max={50} addonBefore="Số bản in:" style={{ width: 170 }} />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'price']}
                      rules={[{ required: true, message: 'Nhập giá' }]}
                    >
                      <InputNumber
                        min={0}
                        step={5000}
                        addonBefore="Đơn giá (VNĐ):"
                        formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={(val) => (val ? Number(val.replace(/\$\s?|(,*)/g, '')) : 0) as any}
                        style={{ width: 240 }}
                      />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ef4444' }} />
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add({ quantity: 2, price: 70000 })} block icon={<PlusOutlined />}>
                    Thêm Mốc Giá In
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <Form.Item name="isActive" label="Kích hoạt trên Kiosk" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
