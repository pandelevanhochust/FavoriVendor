import React, { useState, useEffect, useMemo } from 'react';
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
  Badge,
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
  EditOutlined,
  SaveOutlined,
  SearchOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/router';
import {
  PhotoFrame,
  PhotoLayout,
  PhotoCategory,
  HoleRect,
  getFrames,
  getLayouts,
  getCategories,
  createFrame,
  updateFrame,
  deleteFrame,
  resolveAssetUrl,
} from '../api/photoLayoutApi';
import {
  detectTransparentHoles,
  parseTemplateXml,
  generatePresetHoles,
  DetectedHole,
} from '../utils/frameDetector';
import VisualHoleEditor from '../components/frames/VisualHoleEditor';

const { Title, Text } = Typography;

export default function FramesPage() {
  const router = useRouter();
  const [frames, setFrames] = useState<PhotoFrame[]>([]);
  const [layouts, setLayouts] = useState<PhotoLayout[]>([]);
  const [categories, setCategories] = useState<PhotoCategory[]>([]);
  const [loading, setLoading] = useState(false);

  // HiHiBooth Filters
  const [activeLayoutTab, setActiveLayoutTab] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<number | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Upload & Frame Builder Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadActiveTab, setUploadActiveTab] = useState<'quick' | 'builder'>('quick');
  const [submitting, setSubmitting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [selectedXmlFile, setSelectedXmlFile] = useState<File | null>(null);
  const [hasXmlImported, setHasXmlImported] = useState<boolean>(false);
  const [previewPngUrl, setPreviewPngUrl] = useState<string | null>(null);
  const [builderHoles, setBuilderHoles] = useState<DetectedHole[]>([]);
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 2400, h: 3600 });
  const [form] = Form.useForm();

  // Visual Hole Editor & Inspector Modal for Existing Frame
  const [editingFrame, setEditingFrame] = useState<PhotoFrame | null>(null);
  const [editingHoles, setEditingHoles] = useState<DetectedHole[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [fData, lData, cData] = await Promise.all([
        getFrames(),
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
  }, []);

  // Sync query param from /layouts page if present (e.g. ?layout=1x4)
  useEffect(() => {
    if (router.query.layout && typeof router.query.layout === 'string') {
      setActiveLayoutTab(router.query.layout);
    }
  }, [router.query]);

  // Filtered frames based on tab, category and keyword
  const filteredFrames = useMemo(() => {
    return frames.filter((frame) => {
      if (activeLayoutTab !== 'all' && frame.layoutId.toLowerCase() !== activeLayoutTab.toLowerCase()) {
        return false;
      }
      if (filterCategory && frame.categoryId !== filterCategory) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        return frame.name.toLowerCase().includes(kw) || frame.layoutId.toLowerCase().includes(kw);
      }
      return true;
    });
  }, [frames, activeLayoutTab, filterCategory, searchKeyword]);

  const handleOpenUpload = () => {
    setFileList([]);
    setSelectedXmlFile(null);
    setHasXmlImported(false);
    setPreviewPngUrl(null);
    setBuilderHoles([]);
    setImageDims({ w: 2400, h: 3600 });
    setUploadActiveTab('quick');
    form.resetFields();
    form.setFieldsValue({
      layoutId: layouts[0]?.id || '2x2',
      categoryId: categories[0]?.id,
      displayOrder: frames.length + 1,
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

    // Gợi ý tên khung từ tên file nếu chưa nhập
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (!form.getFieldValue('name')) {
      form.setFieldsValue({ name: cleanName });
    }

    // Nếu đã nạp từ template.xml thì TUYỆT ĐỐI KHÔNG ghi đè tọa độ từ quét ảnh
    if (hasXmlImported && builderHoles.length > 0) {
      message.info('Đang giữ nguyên tọa độ chuẩn từ template.xml đã nạp!');
      return;
    }

    // Tự động chạy thuật toán quét ô trong suốt (Auto-Detect Transparent Holes)
    try {
      setDetecting(true);
      const res = await detectTransparentHoles(file);
      setImageDims({ w: res.imageWidth, h: res.imageHeight });

      if (res.holes.length > 0) {
        setBuilderHoles(res.holes);
        form.setFieldsValue({
          holesJson: JSON.stringify(res.holes, null, 2),
        });

        // Gợi ý layout phù hợp theo tỷ lệ ảnh
        if (res.imageWidth > res.imageHeight && layouts.some((l) => l.id.toLowerCase() === '6x4')) {
          form.setFieldsValue({ layoutId: '6x4' });
        } else if (res.imageHeight > res.imageWidth * 2.2 && layouts.some((l) => l.id.toLowerCase() === '1x4' || l.id.toLowerCase() === '2x6')) {
          form.setFieldsValue({ layoutId: '1x4' });
        } else if (layouts.some((l) => l.id.toLowerCase() === '2x2')) {
          form.setFieldsValue({ layoutId: '2x2' });
        }

        message.success(
          `Đã tự động nhận diện được ${res.holes.length} ô ảnh trong suốt (${res.imageWidth}x${res.imageHeight}px)!`
        );
      } else {
        message.info(
          'Chưa phát hiện được ô trong suốt rõ ràng. Bạn có thể bấm "Import template.xml" hoặc dùng tab "Visual Builder" để kéo thả.'
        );
      }
    } catch (err: any) {
      console.warn('Auto detect failed:', err);
    } finally {
      setDetecting(false);
    }
  };

  // Import từ template.xml (kho D:\WORK\Frames hoặc Tool_Create_Frame)
  const handleXmlImport = (file: File) => {
    setSelectedXmlFile(file);
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
          if (parsed.holes.length === 6) matchedLayout = '2x3';
          else if (parsed.holes.length === 4 && parsed.width < parsed.height * 0.4) matchedLayout = '1x4';
          else matchedLayout = '2x2';
        }

        form.setFieldsValue({
          name: parsed.name !== 'Untitled-Frame' && parsed.name !== 'Untitled Frame'
            ? parsed.name
            : form.getFieldValue('name') || parsed.name,
          layoutId: matchedLayout,
          holesJson: JSON.stringify(parsed.holes, null, 2),
        });

        setBuilderHoles(parsed.holes);
        setImageDims({ w: parsed.width, h: parsed.height });
        setHasXmlImported(true);

        message.success(
          `Đã nạp template.xml: Khổ ${parsed.layout} (${parsed.width}x${parsed.height}), ${parsed.holes.length} ô ảnh lồng!`
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
      formData.append('holesJson', JSON.stringify(builderHoles));
      formData.append('displayOrder', (vals.displayOrder || 0).toString());
      formData.append('isActive', (vals.isActive ?? true).toString());

      // Gửi kèm file XML nếu có để backend lưu vết và phân tích trực tiếp
      if (selectedXmlFile) {
        formData.append('xmlFile', selectedXmlFile);
      }

      await createFrame(formData);
      message.success('Đã tạo và lưu khung ảnh thành công!');
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

  // Mở modal Visual Inspector & Editor cho khung hiện có
  const handleOpenEditHoles = (frame: PhotoFrame) => {
    setEditingFrame(frame);
    setEditingHoles(frame.holes || []);
  };

  // Lưu tọa độ đã sửa cho khung hiện có
  const handleSaveEditedHoles = async () => {
    if (!editingFrame) return;
    try {
      setIsSavingEdit(true);
      const formData = new FormData();
      formData.append('layoutId', editingFrame.layoutId);
      formData.append('name', editingFrame.name);
      if (editingFrame.categoryId) formData.append('categoryId', editingFrame.categoryId.toString());
      formData.append('holesJson', JSON.stringify(editingHoles));
      formData.append('displayOrder', editingFrame.displayOrder.toString());
      formData.append('isActive', editingFrame.isActive.toString());

      await updateFrame(editingFrame.id, formData);
      message.success(`Đã cập nhật tọa độ cho khung '${editingFrame.name}' thành công!`);
      setEditingFrame(null);
      loadAll();
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể lưu tọa độ mới.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteFrame = async (id: number) => {
    try {
      await deleteFrame(id);
      message.success('Đã xoá khung ảnh khỏi hệ thống!');
      loadAll();
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.message || 'Không thể xoá khung ảnh.');
    }
  };

  const handleToggleFrameActive = async (frame: PhotoFrame, checked: boolean) => {
    try {
      const formData = new FormData();
      formData.append('layoutId', frame.layoutId);
      formData.append('name', frame.name);
      formData.append('isActive', checked.toString());
      await updateFrame(frame.id, formData);
      message.success(`Đã ${checked ? 'bật' : 'tắt'} khung ${frame.name}!`);
      loadAll();
    } catch {
      message.error('Không thể cập nhật trạng thái khung.');
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            Kho Khung Ảnh & Tọa Độ Lồng Ảnh (Frames)
          </Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Quản lý viền khung PNG, định vị lỗ đục lồng ảnh (Holes) và dựng khung trực quan theo chuẩn HiHiBooth CMS
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

      {/* HiHiBooth Horizontal Layout Tabs Bar */}
      <div
        style={{
          background: '#ffffff',
          padding: '4px 16px',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          marginBottom: 16,
        }}
      >
        <Tabs
          activeKey={activeLayoutTab}
          onChange={setActiveLayoutTab}
          style={{ marginBottom: 0 }}
          items={[
            {
              key: 'all',
              label: (
                <Space>
                  <span>Tất cả các khổ</span>
                  <Badge count={frames.length} style={{ backgroundColor: '#94a3b8' }} />
                </Space>
              ),
            },
            ...layouts.map((l) => {
              const count = frames.filter((f) => f.layoutId.toLowerCase() === l.id.toLowerCase()).length;
              return {
                key: l.id,
                label: (
                  <Space>
                    <b>{l.name}</b>
                    <Tag color="magenta" style={{ margin: 0, fontSize: 11, padding: '0 5px' }}>
                      {l.id}
                    </Tag>
                    <Badge count={count} style={{ backgroundColor: count > 0 ? '#f86fa5' : '#cbd5e1' }} />
                  </Space>
                ),
              };
            }),
          ]}
        />
      </div>

      {/* Secondary Filter & Search Bar */}
      <Card
        style={{ marginBottom: 20, borderRadius: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} md={8}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Tìm kiếm khung theo tên..."
              allowClear
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </Col>
          <Col xs={24} md={8}>
            <Space align="center" style={{ width: '100%' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#475569', whiteSpace: 'nowrap' }}>
                Lọc Chủ Đề:
              </span>
              <Select
                style={{ minWidth: 200 }}
                placeholder="Tất cả chủ đề / danh mục"
                allowClear
                value={filterCategory}
                onChange={(val) => setFilterCategory(val)}
                options={categories.map((c) => ({ label: c.name, value: c.id }))}
              />
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Hiển thị <b>{filteredFrames.length}</b> / {frames.length} khung ảnh
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Frame Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : filteredFrames.length === 0 ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Empty description="Không tìm thấy khung ảnh nào phù hợp. Hãy nhấn 'Tạo Khung Mới' để thêm từ PNG hoặc kho template.xml!" />
        </Card>
      ) : (
        <Row gutter={[20, 20]}>
          {filteredFrames.map((frame) => {
            const fullUrl = resolveAssetUrl(frame.frameUrl);
            const holeCount = frame.holes?.length || 0;
            const targetLayout = layouts.find((l) => l.id.toLowerCase() === frame.layoutId.toLowerCase());
            const isTallStrip = frame.layoutId.toLowerCase() === '1x4' || frame.layoutId.toLowerCase() === '2x6';

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={frame.id}>
                <Card
                  hoverable
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                  cover={
                    <div
                      style={{
                        height: 280,
                        backgroundColor: '#1e293b',
                        backgroundImage:
                          'linear-gradient(45deg, #0f172a 25%, transparent 25%), linear-gradient(-45deg, #0f172a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0f172a 75%), linear-gradient(-45deg, transparent 75%, #0f172a 75%)',
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        padding: 12,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleOpenEditHoles(frame)}
                      title="Bấm để xem và sửa tọa độ các ô lồng ảnh"
                    >
                      {/* Frame image preview on transparency checkerboard */}
                      <img
                        alt={frame.name}
                        src={fullUrl}
                        style={{
                          maxHeight: '100%',
                          maxWidth: '100%',
                          objectFit: 'contain',
                          filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.3))',
                          transition: 'transform 0.2s',
                        }}
                      />
                      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 4 }}>
                        <Tag color="magenta" style={{ margin: 0, fontWeight: 700 }}>
                          {frame.layoutId}
                        </Tag>
                        {frame.categoryName && (
                          <Tag color="blue" style={{ margin: 0 }}>
                            {frame.categoryName}
                          </Tag>
                        )}
                      </div>
                      <div style={{ position: 'absolute', top: 10, right: 10 }}>
                        <Switch
                          size="small"
                          checked={frame.isActive}
                          onChange={(checked) => handleToggleFrameActive(frame, checked)}
                          onClick={(_, e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  }
                  actions={[
                    <Tooltip title="Xem chi tiết và chỉnh sửa tọa độ ô lồng">
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => handleOpenEditHoles(frame)}
                        style={{ color: '#0284c7', fontWeight: 600 }}
                      >
                        Holes ({holeCount})
                      </Button>
                    </Tooltip>,
                    <Tooltip title="Mở Visual Frame Builder">
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEditHoles(frame)}
                        style={{ color: '#f86fa5' }}
                      >
                        Sửa Tọa Độ
                      </Button>
                    </Tooltip>,
                    <Popconfirm
                      title="Xóa khung ảnh này?"
                      description="Khung ảnh sẽ bị xóa khỏi hệ thống và lưu trữ R2!"
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
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                          {frame.name}
                        </span>
                        <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                          #{frame.displayOrder}
                        </Tag>
                      </div>
                    }
                    description={
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        <span>Khổ in: {targetLayout ? `${targetLayout.widthPx}x${targetLayout.heightPx}` : '2400x3600'}</span>
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

      {/* Visual Hole Editor & Inspector Modal for Existing Frame */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>
              Trình Chỉnh Sửa Tọa Độ Khung: {editingFrame?.name} ({editingFrame?.layoutId})
            </span>
            <Tag color="magenta">ID #{editingFrame?.id}</Tag>
          </div>
        }
        open={!!editingFrame}
        onCancel={() => setEditingFrame(null)}
        footer={[
          <Button key="cancel" onClick={() => setEditingFrame(null)}>
            Hủy
          </Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            style={{ background: '#f86fa5', borderColor: '#f86fa5' }}
            loading={isSavingEdit}
            onClick={handleSaveEditedHoles}
          >
            Lưu Tọa Độ Mới
          </Button>,
        ]}
        width={820}
        destroyOnClose
      >
        {editingFrame && (
          <div>
            <Alert
              type="info"
              showIcon
              message="Chỉnh sửa ô chụp ảnh trực quan"
              description="Bạn có thể kéo thả để di chuyển, kéo 4 góc/cạnh để thay đổi kích thước từng ô hoặc bật 'Mô phỏng ảnh chụp' để kiểm tra kết quả lồng ảnh trước khi lưu."
              style={{ marginBottom: 16 }}
            />
            <VisualHoleEditor
              imageUrl={resolveAssetUrl(editingFrame.frameUrl)}
              canvasWidth={
                layouts.find((l) => l.id.toLowerCase() === editingFrame.layoutId.toLowerCase())?.widthPx || 2400
              }
              canvasHeight={
                layouts.find((l) => l.id.toLowerCase() === editingFrame.layoutId.toLowerCase())?.heightPx || 3600
              }
              holes={editingHoles}
              layoutId={editingFrame.layoutId}
              onChange={setEditingHoles}
            />
          </div>
        )}
      </Modal>

      {/* Upload Frame & Builder Modal */}
      <Modal
        title="Tạo Khung Ảnh Mới (Hỗ Trợ XML, Tự Quét Kênh Alpha & Visual Builder)"
        open={isUploadModalOpen}
        onOk={handleUploadSubmit}
        confirmLoading={submitting}
        onCancel={() => setIsUploadModalOpen(false)}
        okText="Lưu Khung Ảnh"
        cancelText="Hủy"
        width={840}
        destroyOnClose
      >
        <Tabs
          activeKey={uploadActiveTab}
          onChange={(k: any) => setUploadActiveTab(k)}
          items={[
            {
              key: 'quick',
              label: '1. Nạp File & Nhập Dữ Liệu (Quick Import)',
              children: (
                <div style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Upload
                      accept=".xml"
                      showUploadList={false}
                      beforeUpload={(file) => handleXmlImport(file)}
                    >
                      <Button icon={<FileTextOutlined />} style={{ borderRadius: 6 }}>
                        {selectedXmlFile ? `Đã chọn: ${selectedXmlFile.name}` : 'Nạp file template.xml (Kho Frames)'}
                      </Button>
                    </Upload>
                    {hasXmlImported && (
                      <Tag color="success" icon={<CheckCircleOutlined />}>
                        Đã nạp {builderHoles.length} ô Holes từ XML
                      </Tag>
                    )}
                  </div>

                  <Form form={form} layout="vertical">
                    <Form.Item
                      label="File Khung Viền PNG (Trong suốt các ô chụp ảnh)"
                      required
                      tooltip="File PNG viền trang trí. Hệ thống sẽ giữ nguyên tọa độ XML nếu có, hoặc quét kênh trong suốt."
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
                          if (!hasXmlImported) setBuilderHoles([]);
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
                          Chuẩn kích thước photobooth: 2400x3600 (4x6 / 2x2) hoặc 1200x3600 (1x4 dải dọc)
                        </p>
                      </Upload.Dragger>
                    </Form.Item>

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

                      <Form.Item name="categoryId" label="Chủ Đề / Danh Mục">
                        <Select
                          placeholder="Chọn chủ đề"
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
                        <Input placeholder="ví dụ: Vintage Film Strip 4 Ô" />
                      </Form.Item>

                      <Form.Item name="displayOrder" label="Thứ tự hiển thị">
                        <InputNumber style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    </div>

                    <div style={{ display: 'flex', gap: 24 }}>
                      <Form.Item name="isActive" label="Kích hoạt trên Kiosk ngay" valuePropName="checked">
                        <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                      </Form.Item>
                    </div>
                  </Form>
                </div>
              ),
            },
            {
              key: 'builder',
              label: `2. Trình Dựng Tọa Độ Trực Quan (${builderHoles.length} Ô Holes)`,
              children: (
                <div style={{ marginTop: 8 }}>
                  {previewPngUrl ? (
                    <VisualHoleEditor
                      imageUrl={previewPngUrl}
                      canvasWidth={imageDims.w}
                      canvasHeight={imageDims.h}
                      holes={builderHoles}
                      layoutId={form.getFieldValue('layoutId') || '2x2'}
                      onChange={(next) => {
                        setBuilderHoles(next);
                        form.setFieldsValue({ holesJson: JSON.stringify(next) });
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 40, background: '#f8fafc', borderRadius: 8 }}>
                      <PictureOutlined style={{ fontSize: 36, color: '#94a3b8', marginBottom: 12 }} />
                      <Text style={{ display: 'block', color: '#64748b' }}>
                        Vui lòng chọn hoặc kéo thả file ảnh PNG viền khung ở Tab 1 trước khi mở Trình Dựng Tọa Độ!
                      </Text>
                      <Button style={{ marginTop: 12 }} onClick={() => setUploadActiveTab('quick')}>
                        Chuyển về Tab 1 để chọn ảnh
                      </Button>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
