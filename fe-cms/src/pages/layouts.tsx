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
  Row,
  Col,
  Statistic,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  MinusCircleOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  PictureOutlined,
  ScissorOutlined,
  CameraOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import {
  PhotoLayout,
  PricingTier,
  getLayouts,
  createLayout,
  updateLayout,
  deleteLayout,
} from '../api/photoLayoutApi';

const { Title, Text } = Typography;

// Miniature SVG Preview for Layout aspect ratio and visual hole distribution
const LayoutVisualBadge: React.FC<{ layoutId: string; holeCount: number }> = ({ layoutId, holeCount }) => {
  const norm = layoutId.toLowerCase();

  if (norm === '1x4' || norm === '2x6') {
    return (
      <div
        style={{
          width: 32,
          height: 52,
          background: '#f1f5f9',
          border: '1.5px solid #cbd5e1',
          borderRadius: 4,
          padding: 2,
          display: 'flex',
          gap: 2,
        }}
        title="Dải Film 2 Cột Đôi (2 Cut Strips)"
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ flex: 1, background: '#f86fa5', borderRadius: 1 }} />
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ flex: 1, background: '#f86fa5', borderRadius: 1 }} />
          ))}
        </div>
      </div>
    );
  }

  if (norm === '2x2') {
    return (
      <div
        style={{
          width: 44,
          height: 44,
          background: '#f1f5f9',
          border: '1.5px solid #cbd5e1',
          borderRadius: 4,
          padding: 3,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 3,
        }}
        title="Lưới 4 Ô Vuông (2x2 Grid)"
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ background: '#f86fa5', borderRadius: 2 }} />
        ))}
      </div>
    );
  }

  if (norm === '2x3') {
    return (
      <div
        style={{
          width: 38,
          height: 52,
          background: '#f1f5f9',
          border: '1.5px solid #cbd5e1',
          borderRadius: 4,
          padding: 3,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 2,
        }}
        title="Lưới 6 Ô Postcard (2x3 Postcard)"
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ background: '#f86fa5', borderRadius: 1.5 }} />
        ))}
      </div>
    );
  }

  // 6x4 or standard landscape
  return (
    <div
      style={{
        width: 52,
        height: 38,
        background: '#f1f5f9',
        border: '1.5px solid #cbd5e1',
        borderRadius: 4,
        padding: 3,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 2,
      }}
      title="Khung Ngang (6x4 Landscape)"
    >
      {[1, 2, 3, 4, 5, 6].slice(0, holeCount || 4).map((i) => (
        <div key={i} style={{ background: '#f86fa5', borderRadius: 1.5 }} />
      ))}
    </div>
  );
};

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
        pricingTiers:
          layout.pricingTiers && layout.pricingTiers.length > 0
            ? layout.pricingTiers
            : [{ quantity: 2, price: 70000 }],
      });
    } else {
      setEditingLayout(null);
      form.resetFields();
      form.setFieldsValue({
        id: '',
        name: '',
        widthPx: 2400,
        heightPx: 3600,
        holeCount: 4,
        isActive: true,
        displayOrder: layouts.length + 1,
        pricingTiers: [
          { quantity: 2, price: 70000 },
          { quantity: 4, price: 100000 },
          { quantity: 6, price: 130000 },
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

  const handleToggleActive = async (layout: PhotoLayout, checked: boolean) => {
    try {
      await updateLayout(layout.id, { isActive: checked });
      message.success(`Đã ${checked ? 'bật' : 'tắt'} khổ ảnh ${layout.name}!`);
      loadData();
    } catch (err: any) {
      message.error('Không thể cập nhật trạng thái.');
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

  // KPI Calculations
  const totalLayouts = layouts.length;
  const activeLayouts = layouts.filter((l) => l.isActive).length;
  const totalFramesAssigned = layouts.reduce((sum, l) => sum + (l.frameCount || 0), 0);

  const columns = [
    {
      title: 'Tỉ Lệ',
      key: 'visual',
      width: 70,
      render: (_: any, record: PhotoLayout) => (
        <LayoutVisualBadge layoutId={record.id} holeCount={record.holeCount} />
      ),
    },
    {
      title: 'Mã & Tên Khổ Ảnh',
      key: 'name',
      render: (_: any, record: PhotoLayout) => (
        <div>
          <Space direction="horizontal" size={6} style={{ marginBottom: 4 }}>
            <Tag color="magenta" style={{ fontWeight: 700, fontSize: 13, padding: '2px 8px' }}>
              {record.id}
            </Tag>
            <Text strong style={{ fontSize: 14, color: '#0f172a' }}>
              {record.name}
            </Text>
            {(record.id.toLowerCase() === '1x4' || record.id.toLowerCase() === '2x6') && (
              <Tag icon={<ScissorOutlined />} color="orange" style={{ margin: 0 }}>
                Cắt đôi tự động
              </Tag>
            )}
          </Space>
          {record.description && (
            <div style={{ fontSize: 12, color: '#64748b' }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Thông Số In Ấn',
      key: 'specs',
      render: (_: any, record: PhotoLayout) => (
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>
            <Text type="secondary">Kích thước:</Text>{' '}
            <b style={{ fontFamily: 'monospace' }}>{record.widthPx} × {record.heightPx} px</b>
          </div>
          <div>
            <Text type="secondary">Số ô chụp (Holes):</Text>{' '}
            <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>
              {record.holeCount} ảnh
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Mốc Giá In Lũy Tiến (Pricing Tiers)',
      key: 'pricingTiers',
      render: (_: any, record: PhotoLayout) => (
        <Space wrap size={[6, 6]}>
          {record.pricingTiers && record.pricingTiers.length > 0 ? (
            record.pricingTiers.map((tier, idx) => (
              <Tag
                key={idx}
                color="pink"
                style={{
                  background: '#fdf2f8',
                  borderColor: '#fbcfe8',
                  color: '#be185d',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
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
      title: 'Khung Đã Gán',
      dataIndex: 'frameCount',
      key: 'frameCount',
      width: 140,
      render: (val?: number, record?: PhotoLayout) => (
        <Link href={`/frames?layout=${record?.id}`}>
          <Button
            size="small"
            icon={<PictureOutlined />}
            style={{ borderRadius: 6, fontSize: 12 }}
          >
            {val ?? 0} khung
          </Button>
        </Link>
      ),
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 110,
      render: (active: boolean, record: PhotoLayout) => (
        <Switch
          checked={active}
          onChange={(checked) => handleToggleActive(record, checked)}
          checkedChildren="Bật"
          unCheckedChildren="Tắt"
        />
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 130,
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
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            Cấu Hình Khổ Ảnh (Layouts)
          </Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Hệ thống quản lý tỷ lệ khổ in, số lần chụp máy ảnh, cắt đôi tự động và bảng giá in ấn lũy tiến theo phong cách HiHiBooth
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

      {/* KPI Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: 18 }}>
            <Statistic
              title={<span style={{ fontSize: 13, color: '#64748b' }}>Tổng Số Khổ Ảnh</span>}
              value={totalLayouts}
              prefix={<AppstoreOutlined style={{ color: '#f86fa5', marginRight: 6 }} />}
              valueStyle={{ fontWeight: 700, color: '#0f172a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: 18 }}>
            <Statistic
              title={<span style={{ fontSize: 13, color: '#64748b' }}>Đang Mở Bán Trên Kiosk</span>}
              value={activeLayouts}
              prefix={<CheckCircleOutlined style={{ color: '#10b981', marginRight: 6 }} />}
              valueStyle={{ fontWeight: 700, color: '#10b981' }}
              suffix={<span style={{ fontSize: 13, color: '#94a3b8' }}>/ {totalLayouts}</span>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: 18 }}>
            <Statistic
              title={<span style={{ fontSize: 13, color: '#64748b' }}>Tổng Khung Đang Hoạt Động</span>}
              value={totalFramesAssigned}
              prefix={<PictureOutlined style={{ color: '#0284c7', marginRight: 6 }} />}
              valueStyle={{ fontWeight: 700, color: '#0284c7' }}
              suffix={<span style={{ fontSize: 13, color: '#64748b' }}>mẫu</span>}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table */}
      <Card
        style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          dataSource={layouts}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* Create / Edit Layout Modal */}
      <Modal
        title={editingLayout ? `Chỉnh Sửa Khổ Ảnh: ${editingLayout.name}` : 'Tạo Khổ Ảnh Mới'}
        open={isModalOpen}
        onOk={handleSave}
        confirmLoading={submitting}
        onCancel={() => setIsModalOpen(false)}
        okText="Lưu Khổ Ảnh"
        cancelText="Hủy"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
            <Form.Item
              name="id"
              label="Mã Khổ (ID / Slug)"
              rules={[{ required: true, message: 'Nhập mã khổ (vd: 1x4, 2x2, 2x3)' }]}
              tooltip="Mã định danh duy nhất (Slug) phục vụ kết nối máy Kiosk"
            >
              <Input placeholder="ví dụ: 1x4" disabled={!!editingLayout} />
            </Form.Item>

            <Form.Item
              name="name"
              label="Tên Hiển Thị Khổ Ảnh"
              rules={[{ required: true, message: 'Vui lòng nhập tên khổ ảnh' }]}
            >
              <Input placeholder="ví dụ: Dải 4 ảnh đôi (2 Cut Strips)" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item
              name="widthPx"
              label="Chiều Rộng In (Width)"
              rules={[{ required: true, message: 'Nhập chiều rộng pixel' }]}
            >
              <InputNumber style={{ width: '100%' }} min={600} max={6000} addonAfter="px" />
            </Form.Item>

            <Form.Item
              name="heightPx"
              label="Chiều Cao In (Height)"
              rules={[{ required: true, message: 'Nhập chiều cao pixel' }]}
            >
              <InputNumber style={{ width: '100%' }} min={600} max={6000} addonAfter="px" />
            </Form.Item>

            <Form.Item
              name="holeCount"
              label="Số Ô Ảnh (Holes)"
              rules={[{ required: true, message: 'Nhập số ô ảnh' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} max={12} addonAfter="ô" />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Mô Tả & Ghi Chú Cắt Giấy">
            <Input.TextArea rows={2} placeholder="ví dụ: Máy in tự động cắt làm 2 dải film nhỏ 5x15cm..." />
          </Form.Item>

          <Divider style={{ margin: '16px 0 12px 0' }}>Bảng Giá In Lũy Tiến (Pricing Tiers)</Divider>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Cấu hình các mức giá ưu đãi khi khách hàng chọn in thêm số lượng bản tại máy Kiosk:
          </Text>

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
                      <InputNumber min={1} placeholder="Số bản in" addonAfter="bản" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'price']}
                      rules={[{ required: true, message: 'Nhập giá tiền' }]}
                    >
                      <InputNumber
                        min={0}
                        step={5000}
                        style={{ width: 180 }}
                        formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        addonAfter="₫"
                      />
                    </Form.Item>
                    <MinusCircleOutlined
                      onClick={() => remove(name)}
                      style={{ color: '#ef4444', fontSize: 16 }}
                    />
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Thêm Mốc Giá In
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            <Form.Item name="isActive" label="Kích Hoạt Trên Kiosk" valuePropName="checked">
              <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
            </Form.Item>
            <Form.Item name="displayOrder" label="Thứ Tự Sắp Xếp">
              <InputNumber min={0} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
