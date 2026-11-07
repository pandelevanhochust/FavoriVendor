import React, { useState, useEffect, useRef } from 'react';
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
  Slider,
  Switch,
  message,
  Popconfirm,
  Spin,
  Empty,
  Tooltip,
  Radio,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import {
  PhotoFilter,
  getFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  resolveAssetUrl,
} from '../api/photoFilterApi';

const { Title, Text } = Typography;

const SAMPLE_IMAGE_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';

export default function FiltersPage() {
  const [filters, setFilters] = useState<PhotoFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<PhotoFilter | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<'LUT' | 'Preset'>('LUT');

  const [lutFileList, setLutFileList] = useState<any[]>([]);
  const [thumbFileList, setThumbFileList] = useState<any[]>([]);
  const [intensityValue, setIntensityValue] = useState<number>(100);

  // Preview Modal
  const [previewingFilter, setPreviewingFilter] = useState<PhotoFilter | null>(null);

  const [form] = Form.useForm();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getFilters({ category: categoryFilter });
      setFilters(data);
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể tải danh sách bộ lọc.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [categoryFilter]);

  const handleOpenModal = (filter?: PhotoFilter) => {
    setLutFileList([]);
    setThumbFileList([]);
    if (filter) {
      setEditingFilter(filter);
      setFilterType(filter.type);
      setIntensityValue(Math.round(filter.intensityDefault * 100));
      form.setFieldsValue({
        code: filter.code,
        name: filter.name,
        category: filter.category,
        type: filter.type,
        intensityDefault: Math.round(filter.intensityDefault * 100),
        displayOrder: filter.displayOrder,
        isActive: filter.isActive,
        configJson: filter.configJson,
      });
    } else {
      setEditingFilter(null);
      setFilterType('LUT');
      setIntensityValue(100);
      form.resetFields();
      form.setFieldsValue({
        code: '',
        name: '',
        category: 'Film',
        type: 'LUT',
        intensityDefault: 100,
        displayOrder: 1,
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      if (!editingFilter && filterType === 'LUT' && lutFileList.length === 0) {
        message.error('Vui lòng tải lên file ảnh LUT PNG!');
        return;
      }

      setSubmitting(true);
      const formData = new FormData();
      formData.append('name', vals.name);
      formData.append('category', vals.category || 'General');
      formData.append('type', vals.type);
      formData.append('intensityDefault', ((vals.intensityDefault || 100) / 100).toString());
      formData.append('displayOrder', (vals.displayOrder || 0).toString());
      formData.append('isActive', (vals.isActive ?? true).toString());
      if (vals.configJson) formData.append('configJson', vals.configJson);

      if (lutFileList.length > 0) {
        formData.append('lutFile', lutFileList[0].originFileObj || lutFileList[0]);
      }
      if (thumbFileList.length > 0) {
        formData.append('thumbnailFile', thumbFileList[0].originFileObj || thumbFileList[0]);
      }

      if (editingFilter) {
        await updateFilter(editingFilter.id, formData);
        message.success(`Đã cập nhật bộ lọc '${editingFilter.name}'!`);
      } else {
        formData.append('code', vals.code);
        await createFilter(formData);
        message.success(`Đã thêm bộ lọc mới '${vals.name}'!`);
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err?.errorFields) return;
      console.error(err);
      message.error(err?.response?.data?.message || 'Lỗi khi lưu bộ lọc.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFilter(id);
      message.success('Đã xóa bộ lọc!');
      loadData();
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể xóa bộ lọc.');
    }
  };

  const handleToggleActive = async (filter: PhotoFilter, checked: boolean) => {
    try {
      const formData = new FormData();
      formData.append('name', filter.name);
      formData.append('isActive', checked.toString());
      await updateFilter(filter.id, formData);
      setFilters((prev) =>
        prev.map((f) => (f.id === filter.id ? { ...f, isActive: checked } : f))
      );
      message.success(`Đã ${checked ? 'bật' : 'tắt'} bộ lọc '${filter.name}'`);
    } catch (err) {
      message.error('Không thể cập nhật trạng thái.');
    }
  };

  // Render Live Canvas Preview khi chọn ảnh LUT
  useEffect(() => {
    if (!isModalOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = SAMPLE_IMAGE_URL;
    img.onload = () => {
      canvas.width = 240;
      canvas.height = 320;
      ctx.drawImage(img, 0, 0, 240, 320);

      // Nếu có hiệu ứng Preset CSS hoặc demo filter
      if (filterType === 'Preset') {
        const code = form.getFieldValue('code');
        if (code === 'classic_bw') {
          ctx.filter = `grayscale(${intensityValue}%) contrast(${100 + intensityValue * 0.2}%)`;
        } else if (code === 'vintage_warm') {
          ctx.filter = `sepia(${intensityValue * 0.4}%) contrast(105%)`;
        } else if (code === 'korean_soft') {
          ctx.filter = `brightness(105%) saturate(${100 + intensityValue * 0.15}%)`;
        }
        ctx.drawImage(img, 0, 0, 240, 320);
        ctx.filter = 'none';
      }
    };
  }, [isModalOpen, filterType, intensityValue]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Quản Lý Bộ Lọc Màu (Photo Filters & LUTs)</Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Quản lý các bảng màu 3D LUT PNG và Presets màu cho khách hàng chọn trước khi in tại máy Kiosk
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
            Thêm Bộ Lọc Mới
          </Button>
        </Space>
      </div>

      {/* Filter Bar */}
      <Card style={{ marginBottom: 20, borderRadius: 12, border: 'none' }} bodyStyle={{ padding: 14 }}>
        <Space direction="horizontal" size={16} wrap>
          <span><b>Lọc theo Danh mục:</b></span>
          <Select
            style={{ width: 200 }}
            placeholder="Tất cả danh mục"
            allowClear
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            options={[
              { label: 'Tất cả danh mục', value: undefined as any },
              { label: 'General (Mặc định)', value: 'General' },
              { label: 'Film (Màu phim)', value: 'Film' },
              { label: 'Black & White (Đen trắng)', value: 'Black & White' },
              { label: 'Natural (Tự nhiên)', value: 'Natural' },
              { label: 'Vintage (Hoài niệm)', value: 'Vintage' },
            ]}
          />
        </Space>
      </Card>

      {/* Filter Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : filters.length === 0 ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
          <Empty description="Chưa có bộ lọc nào. Hãy nhấn 'Thêm Bộ Lọc Mới' để bắt đầu!" />
        </Card>
      ) : (
        <Row gutter={[20, 20]}>
          {filters.map((filter) => {
            const thumbUrl = resolveAssetUrl(filter.thumbnailUrl);
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={filter.id}>
                <Card
                  hoverable
                  style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #f1f5f9' }}
                  cover={
                    <div
                      style={{
                        height: 200,
                        background: '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {thumbUrl ? (
                        <img
                          alt={filter.name}
                          src={thumbUrl}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                          <FilterOutlined style={{ fontSize: 36, marginBottom: 8, color: '#f86fa5' }} />
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{filter.name}</div>
                          <div style={{ fontSize: 11 }}>Type: {filter.type}</div>
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 4 }}>
                        <Tag color={filter.type === 'LUT' ? 'magenta' : 'blue'} style={{ margin: 0, fontWeight: 600 }}>
                          {filter.type}
                        </Tag>
                        <Tag color="cyan" style={{ margin: 0 }}>{filter.category}</Tag>
                      </div>
                      <div style={{ position: 'absolute', top: 10, right: 10 }}>
                        <Switch
                          size="small"
                          checked={filter.isActive}
                          onChange={(checked) => handleToggleActive(filter, checked)}
                        />
                      </div>
                    </div>
                  }
                  actions={[
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => handleOpenModal(filter)}
                      style={{ color: '#0284c7' }}
                    >
                      Sửa
                    </Button>,
                    <Popconfirm
                      title="Xóa bộ lọc màu này?"
                      description="Tệp tin lưu trữ và cấu hình sẽ bị xóa!"
                      onConfirm={() => handleDelete(filter.id)}
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
                    title={<span style={{ fontSize: 15, fontWeight: 600 }}>{filter.name}</span>}
                    description={
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
                          Code: {filter.code}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                          <span>Độ đậm: <b>{Math.round(filter.intensityDefault * 100)}%</b></span>
                          <span>Thứ tự: #{filter.displayOrder}</span>
                        </div>
                      </div>
                    }
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Modal Thêm / Chỉnh Sửa Filter */}
      <Modal
        title={editingFilter ? `Sửa Bộ Lọc: ${editingFilter.name}` : 'Thêm Bộ Lọc Màu Mới'}
        open={isModalOpen}
        onOk={handleSave}
        confirmLoading={submitting}
        onCancel={() => setIsModalOpen(false)}
        okText="Lưu Bộ Lọc"
        cancelText="Hủy"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="code"
              label="Mã Bộ Lọc (Code Key)"
              rules={[{ required: true, message: 'Nhập mã code duy nhất (vd: fuji_film)' }]}
            >
              <Input placeholder="ví dụ: fuji_pro_400h" disabled={!!editingFilter} />
            </Form.Item>

            <Form.Item
              name="name"
              label="Tên Hiển Thị Trên Kiosk"
              rules={[{ required: true, message: 'Vui lòng nhập tên bộ lọc' }]}
            >
              <Input placeholder="ví dụ: Tone Phim Fuji Hoài Niệm" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="category" label="Danh mục phân loại">
              <Select
                options={[
                  { label: 'General (Mặc định)', value: 'General' },
                  { label: 'Film (Tone màu phim)', value: 'Film' },
                  { label: 'Black & White (Đen trắng)', value: 'Black & White' },
                  { label: 'Natural (Trong trẻo, mịn da)', value: 'Natural' },
                  { label: 'Vintage (Hoài niệm, ấm)', value: 'Vintage' },
                ]}
              />
            </Form.Item>

            <Form.Item name="type" label="Loại Bộ Lọc">
              <Radio.Group
                onChange={(e) => setFilterType(e.target.value)}
                value={filterType}
              >
                <Radio.Button value="LUT">3D LUT PNG (Studio)</Radio.Button>
                <Radio.Button value="Preset">Tham Số (Preset)</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </div>

          {filterType === 'LUT' && (
            <Form.Item
              label="File Ảnh 3D LUT PNG (Chuẩn Neutral HALD)"
              required={!editingFilter}
              tooltip="File ảnh PNG 512x512 hoặc 256x16 chứa bảng tra cứu màu sắc xuất từ Photoshop / Lightroom"
            >
              <Upload.Dragger
                accept=".png,image/png,.cube"
                fileList={lutFileList}
                beforeUpload={(file) => {
                  setLutFileList([file]);
                  return false;
                }}
                onRemove={() => setLutFileList([])}
                maxCount={1}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: '#f86fa5', fontSize: 36 }} />
                </p>
                <p className="ant-upload-text">Kéo thả file LUT PNG vào đây để tải lên</p>
                <p className="ant-upload-hint">Được lưu trực tiếp vào Cloudflare R2 / Local Storage</p>
              </Upload.Dragger>
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Form.Item
              name="intensityDefault"
              label={`Độ Đậm Mặc Định (Intensity): ${intensityValue}%`}
            >
              <Slider
                min={10}
                max={100}
                value={intensityValue}
                onChange={(val) => setIntensityValue(val)}
              />
            </Form.Item>

            <Form.Item name="displayOrder" label="Thứ tự hiển thị">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </div>

          {/* Live Preview Canvas */}
          <Divider orientation="left" style={{ margin: '12px 0', fontSize: 13, color: '#f86fa5' }}>
            Xem Trước Trên Ảnh Chân Dung Mẫu (Live Preview)
          </Divider>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', background: '#f8fafc', padding: 12, borderRadius: 8 }}>
            <canvas
              ref={canvasRef}
              style={{
                width: 120,
                height: 160,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                objectFit: 'cover',
              }}
            />
            <div>
              <Text strong style={{ fontSize: 13 }}>Hiển thị mô phỏng trực quan</Text>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Khi áp dụng lên máy Kiosk, màu sắc của ảnh chụp sẽ được GPU Shader tính toán nội suy theo mức độ <b>{intensityValue}%</b> này.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Form.Item name="isActive" label="Kích hoạt trên Kiosk ngay" valuePropName="checked">
              <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
