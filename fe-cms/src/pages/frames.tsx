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
  Alert,
  Tabs,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  ReloadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  PictureOutlined,
  EditOutlined,
  SaveOutlined,
  SearchOutlined,
  AimOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/router';
import {
  PhotoFrame,
  PhotoLayout,
  PhotoCategory,
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
  DetectedHole,
} from '../utils/frameDetector';
import VisualHoleEditor from '../components/frames/VisualHoleEditor';

const { Text } = Typography;

const BULK_CONCURRENCY = 4;

const errorMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.error || fallback;

type FrameMeta = Pick<PhotoFrame, 'layoutId' | 'name' | 'categoryId' | 'displayOrder' | 'isActive'>;

/**
 * FormData đầy đủ cho PUT /api/frames/{id}. Backend ghi đè categoryId, displayOrder và isActive
 * bằng mặc định nếu thiếu, nên mọi lần cập nhật đều phải gửi lại toàn bộ metadata.
 * Không truyền holes = giữ nguyên toạ độ lỗ.
 */
function buildFrameFormData(meta: FrameMeta, holes?: DetectedHole[]): FormData {
  const formData = new FormData();
  formData.append('layoutId', meta.layoutId);
  formData.append('name', meta.name);
  if (meta.categoryId != null) formData.append('categoryId', meta.categoryId.toString());
  formData.append('displayOrder', (meta.displayOrder ?? 0).toString());
  formData.append('isActive', meta.isActive.toString());
  if (holes) formData.append('holesJson', JSON.stringify(holes));
  return formData;
}

/** Ảnh frame thu nhỏ kèm vùng lỗ lồng ảnh, vẽ theo hệ toạ độ pixel của khổ in. */
const FrameHolePreview: React.FC<{ frame: PhotoFrame; width: number; height: number }> = ({
  frame,
  width,
  height,
}) => {
  const holes = frame.holes || [];
  const stroke = Math.max(width, height) / 220;
  const fontSize = Math.max(width, height) / 22;
  const rotate = (h: DetectedHole) =>
    h.rotation ? `rotate(${h.rotation} ${h.x + h.w / 2} ${h.y + h.h / 2})` : undefined;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={frame.name}>
      {holes.map((h, i) => (
        <rect
          key={`fill-${i}`}
          x={h.x}
          y={h.y}
          width={h.w}
          height={h.h}
          transform={rotate(h)}
          fill="rgba(248,111,165,0.4)"
        />
      ))}
      <image href={resolveAssetUrl(frame.frameUrl)} width={width} height={height} preserveAspectRatio="none" />
      {holes.map((h, i) => (
        <g key={`mark-${i}`} transform={rotate(h)}>
          <rect
            x={h.x}
            y={h.y}
            width={h.w}
            height={h.h}
            fill="none"
            stroke="#f86fa5"
            strokeWidth={stroke}
            strokeDasharray={`${stroke * 4} ${stroke * 3}`}
          />
          <text
            x={h.x + h.w / 2}
            y={h.y + h.h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontWeight={700}
            fill="#ffffff"
            stroke="#be185d"
            strokeWidth={stroke / 2}
            paintOrder="stroke"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
};

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

  // Bulk toggle + metadata edit modal
  const [bulkBusy, setBulkBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [metaFrame, setMetaFrame] = useState<PhotoFrame | null>(null);
  const [metaFile, setMetaFile] = useState<File | null>(null);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaForm] = Form.useForm();

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
      message.error(errorMessage(err, 'Không thể tải danh sách khung ảnh.'));
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

      const created = await createFrame(formData);
      setIsUploadModalOpen(false);
      loadAll();

      // Mở ngay trình sửa toạ độ nếu số lỗ nhận diện được chưa khớp với khổ ảnh
      const createdHoles = created.holes || [];
      const expected = layouts.find((l) => l.id.toLowerCase() === created.layoutId.toLowerCase())?.holeCount;
      const needsReview = createdHoles.length === 0 || (expected != null && createdHoles.length !== expected);
      if (needsReview) {
        message.warning(
          createdHoles.length === 0
            ? 'Đã lưu frame nhưng chưa có toạ độ lỗ. Hãy đặt các ô lồng ảnh.'
            : `Đã lưu frame với ${createdHoles.length} lỗ, khổ ${created.layoutId} cần ${expected}. Hãy kiểm tra lại.`
        );
        handleOpenEditHoles(created);
      } else {
        message.success('Đã tạo và lưu khung ảnh thành công!');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      console.error(err);
      message.error(errorMessage(err, 'Lỗi khi tải khung ảnh lên máy chủ.'));
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
      await updateFrame(editingFrame.id, buildFrameFormData(editingFrame, editingHoles));
      message.success(`Đã cập nhật tọa độ cho khung '${editingFrame.name}' thành công!`);
      setEditingFrame(null);
      loadAll();
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể lưu tọa độ mới.'));
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
      message.error(errorMessage(err, 'Không thể xoá khung ảnh.'));
    }
  };

  const handleToggleFrameActive = async (frame: PhotoFrame, checked: boolean) => {
    setTogglingId(frame.id);
    try {
      await updateFrame(frame.id, buildFrameFormData({ ...frame, isActive: checked }));
      setFrames((prev) => prev.map((f) => (f.id === frame.id ? { ...f, isActive: checked } : f)));
      message.success(`Đã ${checked ? 'bật' : 'tắt'} khung ${frame.name}!`);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể cập nhật trạng thái khung.'));
    } finally {
      setTogglingId(null);
    }
  };

  // Bật/tắt hàng loạt các frame đang hiển thị theo bộ lọc hiện tại
  const allVisibleActive = filteredFrames.length > 0 && filteredFrames.every((f) => f.isActive);
  const bulkNextState = !allVisibleActive;
  const bulkTargets = filteredFrames.filter((f) => f.isActive !== bulkNextState);

  const handleBulkToggle = async () => {
    if (bulkTargets.length === 0) return;
    setBulkBusy(true);
    const succeeded = new Set<number>();
    let failed = 0;
    try {
      for (let i = 0; i < bulkTargets.length; i += BULK_CONCURRENCY) {
        const batch = bulkTargets.slice(i, i + BULK_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((f) => updateFrame(f.id, buildFrameFormData({ ...f, isActive: bulkNextState })))
        );
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') succeeded.add(batch[idx].id);
          else {
            failed += 1;
            console.error(r.reason);
          }
        });
      }
      setFrames((prev) => prev.map((f) => (succeeded.has(f.id) ? { ...f, isActive: bulkNextState } : f)));
      const verb = bulkNextState ? 'bật' : 'tắt';
      if (failed === 0) message.success(`Đã ${verb} ${succeeded.size} khung.`);
      else message.warning(`Đã ${verb} ${succeeded.size} khung, ${failed} khung cập nhật thất bại.`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleOpenEditMeta = (frame: PhotoFrame) => {
    setMetaFrame(frame);
    setMetaFile(null);
    metaForm.setFieldsValue({
      name: frame.name,
      layoutId: frame.layoutId,
      categoryId: frame.categoryId ?? undefined,
      displayOrder: frame.displayOrder,
      isActive: frame.isActive,
    });
  };

  const handleSaveMeta = async () => {
    if (!metaFrame) return;
    let vals: any;
    try {
      vals = await metaForm.validateFields();
    } catch {
      return;
    }
    setIsSavingMeta(true);
    try {
      const formData = buildFrameFormData({
        name: vals.name.trim(),
        layoutId: vals.layoutId,
        categoryId: vals.categoryId ?? undefined,
        displayOrder: vals.displayOrder ?? 0,
        isActive: !!vals.isActive,
      });
      if (metaFile) formData.append('file', metaFile);
      await updateFrame(metaFrame.id, formData);
      message.success(`Đã cập nhật khung '${vals.name.trim()}'.`);
      setMetaFrame(null);
      loadAll();
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể cập nhật khung ảnh.'));
    } finally {
      setIsSavingMeta(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="hb-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="hb-page-title">Quản Lý Khung Ảnh (Frames)</h1>
          <div className="hb-page-subtitle">
            Quản lý viền khung PNG theo khổ ảnh và danh mục, bật/tắt hàng loạt và chỉnh toạ độ lỗ lồng ảnh.
          </div>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>
            Làm mới
          </Button>
          <Popconfirm
            title={`${bulkNextState ? 'Bật' : 'Tắt'} ${bulkTargets.length} khung đang hiển thị?`}
            description="Áp dụng cho các khung khớp tab, danh mục và từ khoá hiện tại."
            onConfirm={handleBulkToggle}
            okText={bulkNextState ? 'Bật tất cả' : 'Tắt tất cả'}
            cancelText="Hủy"
            okButtonProps={{ danger: !bulkNextState }}
            disabled={bulkTargets.length === 0}
          >
            <Button icon={<PoweroffOutlined />} loading={bulkBusy} disabled={bulkTargets.length === 0}>
              {bulkNextState ? 'Bật Tất Cả' : 'Tắt Tất Cả'}
            </Button>
          </Popconfirm>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenUpload}>
            Tải Lên Frame Mới
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
                  <span>Tất cả</span>
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
                Danh mục:
              </span>
              <Select
                style={{ minWidth: 200 }}
                placeholder="Tất cả danh mục"
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
              {filteredFrames.length > 0 && (
                <> · <b>{filteredFrames.filter((f) => f.isActive).length}</b> đang bật</>
              )}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Frame Cards Grid */}
      {loading && frames.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : filteredFrames.length === 0 ? (
        <div className="hb-card" style={{ textAlign: 'center', padding: 40 }}>
          <Empty
            description={
              frames.length === 0
                ? "Chưa có khung ảnh nào. Nhấn 'Tải Lên Frame Mới' để thêm từ PNG hoặc template.xml."
                : 'Không có khung ảnh nào khớp bộ lọc hiện tại.'
            }
          />
        </div>
      ) : (
        <Row gutter={[20, 20]}>
          {filteredFrames.map((frame) => {
            const holeCount = frame.holes?.length || 0;
            const targetLayout = layouts.find((l) => l.id.toLowerCase() === frame.layoutId.toLowerCase());
            const canvasW = targetLayout?.widthPx || 2400;
            const canvasH = targetLayout?.heightPx || 3600;
            const holeMismatch = targetLayout != null && holeCount !== targetLayout.holeCount;

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={frame.id}>
                <div className={`hb-hover-card${frame.isActive ? '' : ' is-inactive'}`}>
                  <div
                    className="frame-card-media hb-checkerboard"
                    onClick={() => handleOpenEditHoles(frame)}
                    title="Bấm để xem và sửa toạ độ các ô lồng ảnh"
                  >
                    <div className="hb-card-media" style={{ width: '100%', height: '100%' }}>
                      <FrameHolePreview frame={frame} width={canvasW} height={canvasH} />
                    </div>
                    <div className="hb-card-badges">
                      <Tag color="magenta" style={{ margin: 0, fontWeight: 700 }}>
                        {frame.layoutId}
                      </Tag>
                      {frame.categoryName && (
                        <Tag color="blue" style={{ margin: 0 }}>
                          {frame.categoryName}
                        </Tag>
                      )}
                    </div>
                    <div className="hb-card-switch">
                      <Switch
                        size="small"
                        checked={frame.isActive}
                        loading={togglingId === frame.id}
                        aria-label={`Bật/tắt khung ${frame.name}`}
                        onChange={(checked) => handleToggleFrameActive(frame, checked)}
                        onClick={(_, e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  <div className="hb-card-body">
                    <div className="hb-card-name" title={frame.name}>
                      {frame.name}
                    </div>
                    <div className="hb-card-meta">
                      <Tag
                        color={holeCount === 0 ? 'error' : holeMismatch ? 'warning' : 'success'}
                        style={{ margin: 0 }}
                      >
                        {holeCount === 0 ? 'Chưa có toạ độ lỗ' : `${holeCount} toạ độ lỗ`}
                      </Tag>
                      <span>{canvasW}x{canvasH} px</span>
                    </div>
                  </div>

                  <div className="hb-card-actions">
                    <Button
                      type="text"
                      size="small"
                      icon={<AimOutlined />}
                      onClick={() => handleOpenEditHoles(frame)}
                      style={{ color: '#ec4899' }}
                    >
                      Sửa toạ độ lỗ
                    </Button>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleOpenEditMeta(frame)}
                    >
                      Sửa
                    </Button>
                    <Popconfirm
                      title="Xóa khung ảnh này?"
                      description="Khung ảnh sẽ bị xóa khỏi hệ thống và kho lưu trữ. Không thể hoàn tác."
                      onConfirm={() => handleDeleteFrame(frame.id)}
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                        Xóa
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Frame metadata edit modal */}
      <Modal
        title={`Chỉnh Sửa Khung: ${metaFrame?.name ?? ''}`}
        open={!!metaFrame}
        onCancel={() => setMetaFrame(null)}
        onOk={handleSaveMeta}
        confirmLoading={isSavingMeta}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        width={560}
        forceRender
      >
        <Form form={metaForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label="Tên khung ảnh"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng đặt tên cho khung ảnh' }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="layoutId"
              label="Khổ ảnh (Layout)"
              rules={[{ required: true, message: 'Vui lòng chọn khổ ảnh' }]}
            >
              <Select options={layouts.map((l) => ({ label: `${l.name} (${l.id})`, value: l.id }))} />
            </Form.Item>
            <Form.Item name="categoryId" label="Danh mục">
              <Select
                allowClear
                placeholder="Không có danh mục"
                options={categories.map((c) => ({ label: c.name, value: c.id }))}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="displayOrder" label="Thứ tự hiển thị">
              <InputNumber style={{ width: '100%' }} min={0} precision={0} />
            </Form.Item>
            <Form.Item name="isActive" label="Hiển thị trên Kiosk" valuePropName="checked">
              <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
            </Form.Item>
          </div>
          <Form.Item
            label="Thay file PNG (tuỳ chọn)"
            extra="Toạ độ lỗ hiện tại được giữ nguyên. Hãy kiểm tra lại bằng 'Sửa toạ độ lỗ' nếu bố cục thay đổi."
            style={{ marginBottom: 0 }}
          >
            <Upload
              accept=".png,image/png"
              maxCount={1}
              fileList={metaFile ? [{ uid: 'meta-file', name: metaFile.name, status: 'done' as const }] : []}
              beforeUpload={(file) => {
                if (!file.name.toLowerCase().endsWith('.png')) {
                  message.error('Khung ảnh phải là file PNG trong suốt.');
                  return false;
                }
                setMetaFile(file);
                return false;
              }}
              onRemove={() => setMetaFile(null)}
            >
              <Button icon={<UploadOutlined />}>Chọn file PNG mới</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

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
        title="Tải Lên Frame Mới (PNG, template.xml, tự quét vùng trong suốt)"
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
