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
  Switch,
  message,
  Popconfirm,
  Spin,
  Empty,
  Tooltip,
  Alert,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  ScanOutlined,
  FileTextOutlined,
  PictureOutlined,
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
import {
  detectTransparentHoles,
  parseTemplateXml,
  DetectedHole,
} from '../utils/frameDetector';

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
  const [detecting, setDetecting] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [previewPngUrl, setPreviewPngUrl] = useState<string | null>(null);
  const [parsedHoles, setParsedHoles] = useState<DetectedHole[]>([]);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
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
    setPreviewPngUrl(null);
    setParsedHoles([]);
    setImageDims(null);
    form.resetFields();
    form.setFieldsValue({
      layoutId: layouts[0]?.id || '4x6',
      categoryId: categories[0]?.id,
      displayOrder: 1,
      isActive: true,
      holesJson: '[]',
    });
    setIsUploadModalOpen(true);
  };

  // Tự động phân tích file PNG khi người dùng chọn
  const handlePngFileSelect = async (file: File) => {
    const isPng = file.type === 'image/png' || file.name.endsWith('.png');
    if (!isPng) {
      message.error('Vui lòng chọn file hình ảnh PNG có nền trong suốt!');
      return;
    }

    setFileList([file]);
    const objUrl = URL.createObjectURL(file);
    setPreviewPngUrl(objUrl);

    // Gợi ý tên khung từ tên file
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (!form.getFieldValue('name')) {
      form.setFieldsValue({ name: cleanName });
    }

    // Tự động chạy thuật toán quét ô trong suốt (Auto-Detect Transparent Holes)
    try {
      setDetecting(true);
      const res = await detectTransparentHoles(file);
      setImageDims({ w: res.imageWidth, h: res.imageHeight });

      if (res.holes.length > 0) {
        setParsedHoles(res.holes);
        form.setFieldsValue({
          holesJson: JSON.stringify(res.holes, null, 2),
        });

        // Gợi ý layout phù hợp
        if (res.imageWidth > res.imageHeight && layouts.some((l) => l.id === '6x4')) {
          form.setFieldsValue({ layoutId: '6x4' });
        } else if (res.imageHeight > res.imageWidth * 2.2 && layouts.some((l) => l.id === '2x6' || l.id === '1x4')) {
          form.setFieldsValue({ layoutId: layouts.find((l) => l.id === '2x6' || l.id === '1x4')?.id });
        } else if (layouts.some((l) => l.id === '4x6')) {
          form.setFieldsValue({ layoutId: '4x6' });
        }

        message.success(
          `Đã tự động nhận diện được ${res.holes.length} ô ảnh trong suốt (${res.imageWidth}x${res.imageHeight}px)!`
        );
      } else {
        message.info(
          'Không tìm thấy ô trong suốt rõ ràng. Bạn có thể tự tạo tọa độ mẫu hoặc nhập template.xml.'
        );
      }
    } catch (err: any) {
      console.warn('Auto detect failed:', err);
    } finally {
      setDetecting(false);
    }
  };

  // Import từ template.xml (kho D:\WORK\Frames)
  const handleXmlImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseTemplateXml(text);

        // Map layout
        let matchedLayout = layouts.find(
          (l) => l.id.toLowerCase() === parsed.layout.toLowerCase()
        )?.id;
        if (!matchedLayout) {
          if (parsed.width > parsed.height) matchedLayout = '6x4';
          else matchedLayout = '4x6';
        }

        form.setFieldsValue({
          name: parsed.name !== 'Untitled-Frame' ? parsed.name : form.getFieldValue('name') || parsed.name,
          layoutId: matchedLayout,
          holesJson: JSON.stringify(parsed.holes, null, 2),
        });

        setParsedHoles(parsed.holes);
        setImageDims({ w: parsed.width, h: parsed.height });

        message.success(
          `Đã import template.xml thành công: Khổ ${parsed.layout} (${parsed.width}x${parsed.height}), ${parsed.holes.length} ô ảnh!`
        );
      } catch (err: any) {
        message.error('Lỗi khi đọc file template.xml: ' + (err.message || 'File không hợp lệ'));
      }
    };
    reader.readAsText(file);
    return false;
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
    const w = layout ? layout.widthPx : 2400;
    const h = layout ? layout.heightPx : 3600;

    const holes: HoleRect[] = [];
    const itemHeight = Math.floor((h - 400) / count);
    const itemWidth = Math.floor(w * 0.75);
    const x = Math.floor((w - itemWidth) / 2);

    for (let i = 0; i < count; i++) {
      holes.push({
        x,
        y: 160 + i * itemHeight,
        w: itemWidth,
        h: itemHeight - 60,
      });
    }

    form.setFieldsValue({
      holesJson: JSON.stringify(holes, null, 2),
    });
    setParsedHoles(holes);
    setImageDims({ w, h });
    message.info(`Đã tạo mẫu ${count} ô holes cho khổ ${selectedLayoutId}!`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Kho Khung Ảnh & Tọa Độ Lồng Ảnh (Frames)</Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Hệ thống quản lý viền khung PNG, tự động nhận diện lỗ đục (Holes) và import chuẩn XML từ kho Photobooth
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
            Tạo Khung Mới
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
          <Empty description="Chưa có khung ảnh nào. Hãy nhấn 'Tạo Khung Mới' để thêm từ PNG hoặc kho template.xml!" />
        </Card>
      ) : (
        <Row gutter={[20, 20]}>
          {frames.map((frame) => {
            const fullUrl = resolveAssetUrl(frame.frameUrl);
            const holeCount = frame.holes?.length || 0;

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
                        cursor: 'pointer',
                      }}
                      onClick={() => setInspectingFrame(frame)}
                    >
                      {/* Frame image preview with graceful fallback */}
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
                          const target = e.target as HTMLElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.frame-fallback-box')) {
                            const fallback = document.createElement('div');
                            fallback.className = 'frame-fallback-box';
                            fallback.style.textAlign = 'center';
                            fallback.style.padding = '20px';
                            fallback.innerHTML = `
                              <div style="font-size: 32px; color: #94a3b8; margin-bottom: 8px;">🖼️</div>
                              <div style="font-weight: 600; color: #334155; font-size: 13px;">${frame.name}</div>
                              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">(${holeCount} ô ảnh lồng)</div>
                              <div style="font-size: 10px; color: #e11d48; margin-top: 6px; background: #ffe4e6; padding: 2px 6px; border-radius: 4px;">R2 Access Private</div>
                            `;
                            parent.appendChild(fallback);
                          }
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
                    <Tooltip title="Xem chi tiết các ô Holes lồng ảnh">
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => setInspectingFrame(frame)}
                        style={{ color: '#0284c7' }}
                      >
                        Holes ({holeCount})
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
        title={`Chi Tiết Khung & Ô Holes: ${inspectingFrame?.name} (${inspectingFrame?.layoutId})`}
        open={!!inspectingFrame}
        onCancel={() => setInspectingFrame(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setInspectingFrame(null)}>
            Đóng
          </Button>,
        ]}
        width={760}
        destroyOnClose
      >
        {inspectingFrame && (
          <div>
            <Alert
              type="info"
              showIcon
              message="Cấu trúc Layer Khung Photobooth"
              description="Các ô màu hồng bên dưới là vùng đục lỗ (Holes) mà máy Kiosk sẽ tự động crop và lồng ảnh chụp của khách hàng vào, sau đó phủ viền PNG lên trên."
              style={{ marginBottom: 16 }}
            />

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
                  onError={(e) => {
                    const el = e.target as HTMLElement;
                    el.style.opacity = '0.3';
                  }}
                />
                {inspectingFrame.holes?.map((hole, idx) => {
                  const targetLayout = layouts.find((l) => l.id === inspectingFrame.layoutId);
                  const lW = targetLayout?.widthPx || 2400;
                  const lH = targetLayout?.heightPx || 3600;

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
                        backgroundColor: 'rgba(244, 63, 94, 0.4)',
                        zIndex: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 13,
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      }}
                    >
                      Photo #{idx + 1}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <Text strong>Tọa độ JSON định cấu hình ({inspectingFrame.holes?.length || 0} ô):</Text>
              <pre
                style={{
                  background: '#f8fafc',
                  padding: 10,
                  borderRadius: 6,
                  maxHeight: 120,
                  overflow: 'auto',
                  fontSize: 12,
                  marginTop: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                {JSON.stringify(inspectingFrame.holes, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* Upload Frame Modal with Auto-Detect & Template.xml Import */}
      <Modal
        title="Tạo Khung Ảnh Mới (Tự Động Nhận Diện Lỗ & Hỗ Trợ XML)"
        open={isUploadModalOpen}
        onOk={handleUploadSubmit}
        confirmLoading={submitting}
        onCancel={() => setIsUploadModalOpen(false)}
        okText="Lưu Khung Ảnh"
        cancelText="Hủy"
        width={800}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <Upload
              accept=".xml"
              showUploadList={false}
              beforeUpload={(file) => handleXmlImport(file)}
            >
              <Button icon={<FileTextOutlined />} style={{ borderRadius: 6 }}>
                Import từ file template.xml (Kho Frames)
              </Button>
            </Upload>
            <Button
              icon={<ScanOutlined />}
              onClick={() => {
                if (fileList.length > 0) {
                  handlePngFileSelect(fileList[0].originFileObj || fileList[0]);
                } else {
                  message.warning('Vui lòng chọn file PNG trước khi quét!');
                }
              }}
              loading={detecting}
            >
              Quét lại lỗ trong suốt (Auto Detect)
            </Button>
          </Space>
        </div>

        <Form form={form} layout="vertical">
          <Form.Item
            label="File Khung Viền PNG (Trong suốt các ô chụp ảnh)"
            required
            tooltip="Hệ thống sẽ tự động quét các vùng trong suốt trên file PNG để định vị ô chụp ảnh."
          >
            <Upload.Dragger
              accept=".png,image/png"
              fileList={fileList}
              beforeUpload={(file) => {
                handlePngFileSelect(file);
                return false;
              }}
              onRemove={() => {
                setFileList([]);
                setPreviewPngUrl(null);
                setParsedHoles([]);
              }}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#f86fa5', fontSize: 36 }} />
              </p>
              <p className="ant-upload-text" style={{ fontSize: 14 }}>
                Kéo thả file ảnh PNG viền khung vào đây
              </p>
              <p className="ant-upload-hint" style={{ fontSize: 12 }}>
                Chuẩn kích thước photobooth: 2400x3600 (4x6) hoặc 3600x2400 (6x4). Hệ thống sẽ tự động tìm lỗ thủng!
              </p>
            </Upload.Dragger>
          </Form.Item>

          {/* Live Preview Canvas with detected holes */}
          {previewPngUrl && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <Text strong style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 8 }}>
                Live Canvas Preview (Đã phát hiện {parsedHoles.length} ô ảnh lồng):
              </Text>
              <div
                style={{
                  display: 'inline-block',
                  position: 'relative',
                  maxHeight: 280,
                  maxWidth: '100%',
                  background: '#f1f5f9',
                  backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                  backgroundSize: '12px 12px',
                  borderRadius: 8,
                  padding: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={previewPngUrl}
                    alt="Preview"
                    style={{ maxHeight: 240, maxWidth: '100%', display: 'block' }}
                  />
                  {parsedHoles.map((hole, i) => {
                    const totalW = imageDims?.w || 2400;
                    const totalH = imageDims?.h || 3600;
                    return (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          left: `${(hole.x / totalW) * 100}%`,
                          top: `${(hole.y / totalH) * 100}%`,
                          width: `${(hole.w / totalW) * 100}%`,
                          height: `${(hole.h / totalH) * 100}%`,
                          border: '2px solid #10b981',
                          backgroundColor: 'rgba(16, 185, 129, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 11,
                          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                        }}
                      >
                        #{i + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="layoutId"
              label="Khổ Ảnh (Layout)"
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
              <Input placeholder="ví dụ: Summer Vibes 4 Ô" />
            </Form.Item>

            <Form.Item name="displayOrder" label="Thứ tự hiển thị">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontWeight: 500, fontSize: 13 }}>
              Tọa độ Holes (Tự động cập nhật khi quét ảnh hoặc import XML):
            </label>
            <Button size="small" type="link" onClick={handleGenerateTemplateHoles}>
              Tạo mẫu theo Khổ
            </Button>
          </div>
          <Form.Item
            name="holesJson"
            rules={[{ required: true, message: 'Tọa độ holes không được để trống' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder='[{"x": 100, "y": 80, "w": 400, "h": 280}, ...]'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  if (Array.isArray(parsed)) setParsedHoles(parsed);
                } catch {}
              }}
            />
          </Form.Item>

          <Form.Item name="isActive" label="Kích hoạt trên máy Kiosk ngay" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
