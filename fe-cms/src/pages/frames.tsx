import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Tag,
  Space,
  Upload,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  message,
  Popconfirm,
  Spin,
  Empty,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import {
  PhotoFrame,
  PhotoLayout,
  PhotoCategory,
  HoleRect,
  getFrames,
  getLayouts,
  getCategories,
  createFrame,
  deleteFrame,
  resolveAssetUrl,
} from '../api/photoLayoutApi';

const { Title, Text } = Typography;

export default function FramesPage() {
  const [frames, setFrames] = useState<PhotoFrame[]>([]);
  const [layouts, setLayouts] = useState<PhotoLayout[]>([]);
  const [categories, setCategories] = useState<PhotoCategory[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterLayout, setFilterLayout] = useState<string | undefined>(undefined);
  const [filterCategory, setFilterCategory] = useState<number | undefined>(undefined);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [form] = Form.useForm();

  // Holes Inspector Modal
  const [inspectingFrame, setInspectingFrame] = useState<PhotoFrame | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fData, lData, cData] = await Promise.all([
        getFrames({ layoutId: filterLayout, categoryId: filterCategory }),
        getLayouts(),
        getCategories(),
      ]);
      setFrames(fData);
      setLayouts(lData);
      setCategories(cData);
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể tải danh sách khung ảnh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [filterLayout, filterCategory]);

  const handleOpenUpload = () => {
    setFileList([]);
    form.resetFields();
    form.setFieldsValue({
      layoutId: layouts[0]?.id || '1x4',
      categoryId: categories[0]?.id,
      displayOrder: 1,
      isActive: true,
      holesJson: '[\n  {"x": 100, "y": 80, "w": 400, "h": 280},\n  {"x": 100, "y": 420, "w": 400, "h": 280},\n  {"x": 100, "y": 760, "w": 400, "h": 280},\n  {"x": 100, "y": 1100, "w": 400, "h": 280}\n]',
    });
    setIsUploadModalOpen(true);
  };

  const handleUploadSubmit = async () => {
    try {
      const vals = await form.validateFields();
      if (fileList.length === 0) {
        message.error('Vui lòng chọn hoặc kéo thả file ảnh PNG viền khung!');
        return;
      }

      setSubmitting(true);
      const formData = new FormData();
      formData.append('file', fileList[0].originFileObj || fileList[0]);
      formData.append('layoutId', vals.layoutId);
      formData.append('name', vals.name);
      if (vals.categoryId) formData.append('categoryId', vals.categoryId.toString());
      formData.append('holesJson', vals.holesJson || '[]');
      formData.append('displayOrder', (vals.displayOrder || 0).toString());
      formData.append('isActive', (vals.isActive ?? true).toString());

      await createFrame(formData);
      message.success('Đã tải lên và lưu khung ảnh thành công!');
      setIsUploadModalOpen(false);
      loadAll();
    } catch (err: any) {
      if (err?.errorFields) return;
      console.error(err);
      message.error(err?.response?.data?.message || 'Lỗi khi tải khung ảnh lên máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFrame = async (id: number) => {
    try {
      await deleteFrame(id);
      message.success('Đã xoá khung ảnh!');
      loadAll();
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể xoá khung ảnh.');
    }
  };

  // Helper tạo holes mẫu theo layout được chọn
  const handleGenerateTemplateHoles = () => {
    const selectedLayoutId = form.getFieldValue('layoutId');
    const layout = layouts.find((l) => l.id === selectedLayoutId);
    const count = layout ? layout.holeCount : 4;
    const w = layout ? layout.widthPx : 1200;
    const h = layout ? layout.heightPx : 1800;

    const holes: HoleRect[] = [];
    const itemHeight = Math.floor((h - 200) / count);
    const itemWidth = Math.floor(w * 0.7);
    const x = Math.floor((w - itemWidth) / 2);

    for (let i = 0; i < count; i++) {
      holes.push({
        x,
        y: 80 + i * itemHeight,
        w: itemWidth,
        h: itemHeight - 40,
      });
    }

    form.setFieldsValue({
      holesJson: JSON.stringify(holes, null, 2),
    });
    message.info(`Đã tạo mẫu ${count} ô holes cho khổ ${selectedLayoutId}!`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Kho Khung Ảnh & Tọa Độ Holes</Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Quản lý các viền ảnh PNG trong suốt và định vị vị trí lồng ảnh chụp tự động cho máy Kiosk
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: '#f86fa5', borderColor: '#f86fa5', borderRadius: 8 }}
            onClick={handleOpenUpload}
          >
            Tải Lên Khung PNG
          </Button>
        </Space>
      </div>

      {/* Filter Bar */}
      <Card style={{ marginBottom: 20, borderRadius: 12, border: 'none' }} bodyStyle={{ padding: 14 }}>
        <Space direction="horizontal" size={16} wrap>
          <span><b>Lọc theo Khổ:</b></span>
          <Select
            style={{ width: 220 }}
            placeholder="Tất cả các khổ ảnh"
            allowClear
            value={filterLayout}
            onChange={(val) => setFilterLayout(val)}
            options={layouts.map((l) => ({ label: `${l.name} (${l.id})`, value: l.id }))}
          />

          <span><b>Lọc theo Danh mục:</b></span>
          <Select
            style={{ width: 200 }}
            placeholder="Tất cả danh mục"
            allowClear
            value={filterCategory}
            onChange={(val) => setFilterCategory(val)}
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
          />
        </Space>
      </Card>

      {/* Frame Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : frames.length === 0 ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
          <Empty description="Chưa có khung ảnh nào. Hãy nhấn 'Tải Lên Khung PNG' để bắt đầu!" />
        </Card>
      ) : (
        <Row gutter={[20, 20]}>
          {frames.map((frame) => {
            const fullUrl = resolveAssetUrl(frame.frameUrl);
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={frame.id}>
                <Card
                  hoverable
                  style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #f1f5f9' }}
                  cover={
                    <div
                      style={{
                        height: 260,
                        background: '#f8fafc',
                        backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                        backgroundSize: '16px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        padding: 12,
                      }}
                    >
                      {/* Frame image preview */}
                      <img
                        alt={frame.name}
                        src={fullUrl}
                        style={{
                          maxHeight: '100%',
                          maxWidth: '100%',
                          objectFit: 'contain',
                          filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
                        }}
                        onError={(e) => {
                          (e.target as any).src = 'https://placehold.co/300x450/e2e8f0/64748b?text=PNG+Frame';
                        }}
                      />
                      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 4 }}>
                        <Tag color="magenta" style={{ margin: 0, fontWeight: 700 }}>{frame.layoutId}</Tag>
                        {frame.categoryName && <Tag color="blue" style={{ margin: 0 }}>{frame.categoryName}</Tag>}
                      </div>
                      <div style={{ position: 'absolute', top: 10, right: 10 }}>
                        <Tag color={frame.isActive ? 'green' : 'default'} style={{ margin: 0 }}>
                          {frame.isActive ? 'Bật' : 'Tắt'}
                        </Tag>
                      </div>
                    </div>
                  }
                  actions={[
                    <Tooltip title="Xem cấu trúc các ô Holes lồng ảnh">
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => setInspectingFrame(frame)}
                        style={{ color: '#0284c7' }}
                      >
                        Holes ({frame.holes?.length || 0})
                      </Button>
                    </Tooltip>,
                    <Popconfirm
                      title="Xóa khung ảnh này?"
                      description="File ảnh trên bộ lưu trữ cũng sẽ bị xóa vĩnh viễn!"
                      onConfirm={() => handleDeleteFrame(frame.id)}
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />}>
                        Xóa
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <Card.Meta
                    title={<span style={{ fontSize: 15, fontWeight: 600 }}>{frame.name}</span>}
                    description={
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                        <span>Thứ tự: #{frame.displayOrder}</span>
                        <span>{new Date(frame.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                    }
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Visual Holes Inspector Modal */}
      <Modal
        title={`Visual Holes Inspector: ${inspectingFrame?.name} (${inspectingFrame?.layoutId})`}
        open={!!inspectingFrame}
        onCancel={() => setInspectingFrame(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setInspectingFrame(null)}>
            Đóng
          </Button>,
        ]}
        width={720}
        destroyOnClose
      >
        {inspectingFrame && (
          <div>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
              Các ô màu đỏ nhạt bên dưới đại diện cho tọa độ các lỗ (holes) `{'{x, y, w, h}'}` mà máy Kiosk sẽ tự động crop và lồng ảnh chụp vào.
            </Text>

            <div
              style={{
                position: 'relative',
                width: '100%',
                maxHeight: 520,
                background: '#0f172a',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 8,
                overflow: 'hidden',
                padding: 16,
              }}
            >
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={resolveAssetUrl(inspectingFrame.frameUrl)}
                  alt={inspectingFrame.name}
                  style={{ maxHeight: 460, display: 'block', zIndex: 2, position: 'relative' }}
                />
                {/* Overlay visual boxes based on holes coordinates (relative scale) */}
                {inspectingFrame.holes?.map((hole, idx) => {
                  const targetLayout = layouts.find((l) => l.id === inspectingFrame.layoutId);
                  const lW = targetLayout?.widthPx || 1200;
                  const lH = targetLayout?.heightPx || 1800;

                  const leftPct = (hole.x / lW) * 100;
                  const topPct = (hole.y / lH) * 100;
                  const widthPct = (hole.w / lW) * 100;
                  const heightPct = (hole.h / lH) * 100;

                  return (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                        border: '2px dashed #f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.35)',
                        zIndex: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      }}
                    >
                      Hole #{idx + 1}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <Text strong>Tọa độ JSON thực tế:</Text>
              <pre
                style={{
                  background: '#f8fafc',
                  padding: 10,
                  borderRadius: 6,
                  maxHeight: 120,
                  overflow: 'auto',
                  fontSize: 12,
                  marginTop: 6,
                }}
              >
                {JSON.stringify(inspectingFrame.holes, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Upload Frame Modal */}
      <Modal
        title="Tải Lên Khung Ảnh PNG Mới"
        open={isUploadModalOpen}
        onOk={handleUploadSubmit}
        confirmLoading={submitting}
        onCancel={() => setIsUploadModalOpen(false)}
        okText="Tải Lên & Lưu"
        cancelText="Hủy"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="File Khung Ảnh (.PNG có Alpha Channel trong suốt)"
            required
            tooltip="Bắt buộc là file PNG 32-bit có các vùng trong suốt để lồng ảnh người chụp."
          >
            <Upload.Dragger
              accept=".png,image/png"
              fileList={fileList}
              beforeUpload={(file) => {
                const isPng = file.type === 'image/png' || file.name.endsWith('.png');
                if (!isPng) {
                  message.error('Chỉ chấp nhận file định dạng PNG!');
                  return Upload.LIST_IGNORE;
                }
                setFileList([file]);
                return false; // Prevent auto-upload
              }}
              onRemove={() => setFileList([])}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#f86fa5', fontSize: 40 }} />
              </p>
              <p className="ant-upload-text">Nhấn hoặc kéo thả file PNG vào đây để tải lên</p>
              <p className="ant-upload-hint">File sẽ được lưu vào Local Disk hoặc Cloudflare R2 theo cấu hình server</p>
            </Upload.Dragger>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="layoutId"
              label="Thuộc Khổ Ảnh (Layout)"
              rules={[{ required: true, message: 'Vui lòng chọn khổ ảnh' }]}
            >
              <Select
                placeholder="Chọn khổ ảnh"
                options={layouts.map((l) => ({ label: `${l.name} (${l.id})`, value: l.id }))}
              />
            </Form.Item>

            <Form.Item name="categoryId" label="Danh mục">
              <Select
                placeholder="Chọn danh mục"
                allowClear
                options={categories.map((c) => ({ label: c.name, value: c.id }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Form.Item
              name="name"
              label="Tên Khung Ảnh"
              rules={[{ required: true, message: 'Vui lòng đặt tên cho khung ảnh' }]}
            >
              <Input placeholder="ví dụ: Y2K Pastel Ribbon Frame" />
            </Form.Item>

            <Form.Item name="displayOrder" label="Thứ tự hiển thị">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontWeight: 500, fontSize: 14 }}>Tọa Độ Holes (JSON Array):</label>
            <Button size="small" type="link" onClick={handleGenerateTemplateHoles}>
              Tạo tọa độ mẫu theo Khổ
            </Button>
          </div>
          <Form.Item
            name="holesJson"
            rules={[{ required: true, message: 'Nhập tọa độ JSON holes' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder='[{"x": 100, "y": 80, "w": 400, "h": 280}, ...]'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>

          <Form.Item name="isActive" label="Kích hoạt trên Kiosk ngay" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
