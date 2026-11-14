import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  AimOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/router';
import {
  PhotoCategory,
  PhotoFrame,
  PhotoLayout,
  QrPlacement,
  appendQr,
  bulkFrameVisibility,
  createFrame,
  deleteFrame,
  getCategories,
  getFrames,
  getLayouts,
  holesMetadataJson,
  qrOfFrame,
  resolveAssetUrl,
  updateFrame,
} from '../api/photoLayoutApi';
import { DetectedHole, detectTransparentHoles, parseTemplateXml } from '../utils/frameDetector';
import VisualHoleEditor from '../components/frames/VisualHoleEditor';

const MAX_FRAME_BYTES = 30 * 1024 * 1024;

/** Khổ file PNG khuyến nghị (rộng × cao), giống hướng dẫn trên HiHiBooth. */
const FRAME_SIZE_GUIDE = [
  { label: 'Dải dọc', size: '1200 × 3600 px', w: 1200, h: 3600 },
  { label: 'Nguyên khổ dọc', size: '2400 × 3600 px', w: 2400, h: 3600 },
  { label: 'Nguyên khổ ngang', size: '3600 × 2400 px', w: 3600, h: 2400 },
];

const OVERLAY_CONFIRM =
  'Frame sẽ hiện đè lên màn hình Live View để khách căn vị trí trước khi chụp, và vẫn được ghép vào ảnh kết quả. ' +
  'Chỉ nên bật với frame cần căn khuôn mặt hoặc bố cục, vì frame có thể che một phần ảnh xem trước.';

type StatusFilter = 'all' | 'visible' | 'hidden';

const errorMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.error || fallback;

const frameSize = (frame: PhotoFrame, layout?: PhotoLayout) => ({
  w: frame.frameWidth || layout?.widthPx || 2400,
  h: frame.frameHeight || layout?.heightPx || 3600,
});

function confirmOverlay(onOk: () => void) {
  Modal.confirm({
    title: 'Bật frame trên Live View?',
    content: OVERLAY_CONFIRM,
    okText: 'Tôi hiểu, bật overlay',
    cancelText: 'Hủy',
    onOk,
  });
}

/** Chọn layout khớp nhất theo tỉ lệ ảnh và số ô (khi người dùng chưa chọn tay). */
function suggestLayout(layouts: PhotoLayout[], w: number, h: number, holeCount: number): PhotoLayout | undefined {
  if (layouts.length === 0 || !w || !h) return undefined;
  const ratio = w / h;
  const score = (l: PhotoLayout) =>
    Math.abs(Math.log(l.widthPx / l.heightPx / ratio)) * 4 + (holeCount > 0 && l.holeCount !== holeCount ? 1 : 0);
  return [...layouts].sort((a, b) => score(a) - score(b))[0];
}

/** Ảnh frame thu nhỏ kèm vùng ô và QR, vẽ theo hệ toạ độ pixel của PNG. */
const FrameHolePreview: React.FC<{ frame: PhotoFrame; width: number; height: number }> = ({ frame, width, height }) => {
  const holes = frame.holes || [];
  const stroke = Math.max(width, height) / 220;
  const fontSize = Math.max(width, height) / 22;
  const qr = qrOfFrame(frame);
  const qrSide = qr ? (qr.size / 100) * width : 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={frame.name}>
      {holes.map((h, i) => (
        <rect key={`fill-${i}`} x={h.x} y={h.y} width={h.w} height={h.h} fill="rgba(248,111,165,0.4)" />
      ))}
      <image href={resolveAssetUrl(frame.frameUrl)} width={width} height={height} preserveAspectRatio="none" />
      {holes.map((h, i) => (
        <g key={`mark-${i}`}>
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
      {qr && (
        <rect
          x={(qr.x / 100) * width - qrSide / 2}
          y={(qr.y / 100) * height - qrSide / 2}
          width={qrSide}
          height={qrSide}
          fill="rgba(59,130,246,0.6)"
          stroke="#ffffff"
          strokeWidth={stroke}
        />
      )}
    </svg>
  );
};

/** Trạng thái của phiên tải frame mới. */
interface UploadDraft {
  file: File;
  objectUrl: string;
  width: number;
  height: number;
  autoHoles: DetectedHole[] | null;
  ignoredEdgeRegions: number;
  xmlFile: File | null;
}

export default function FramesPage() {
  const router = useRouter();
  const [frames, setFrames] = useState<PhotoFrame[]>([]);
  const [layouts, setLayouts] = useState<PhotoLayout[]>([]);
  const [categories, setCategories] = useState<PhotoCategory[]>([]);
  const [loading, setLoading] = useState(false);

  // Bộ lọc thư viện
  const [activeLayoutTab, setActiveLayoutTab] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<number | 'none' | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Tải frame mới
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [draft, setDraft] = useState<UploadDraft | null>(null);
  const [draftHoles, setDraftHoles] = useState<DetectedHole[]>([]);
  const [draftQr, setDraftQr] = useState<QrPlacement | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [layoutTouched, setLayoutTouched] = useState(false);
  const [uploadForm] = Form.useForm();
  const watchedUploadLayout: string | undefined = Form.useWatch('layoutId', uploadForm);

  // Sửa toạ độ ô + QR của frame có sẵn
  const [editingFrame, setEditingFrame] = useState<PhotoFrame | null>(null);
  const [editingHoles, setEditingHoles] = useState<DetectedHole[]>([]);
  const [editingQr, setEditingQr] = useState<QrPlacement | null>(null);
  const [isSavingHoles, setIsSavingHoles] = useState(false);

  // Sửa thông tin frame
  const [metaFrame, setMetaFrame] = useState<PhotoFrame | null>(null);
  const [metaFile, setMetaFile] = useState<File | null>(null);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaForm] = Form.useForm();

  const [bulkBusy, setBulkBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const layoutById = useMemo(() => {
    const map = new Map<string, PhotoLayout>();
    layouts.forEach((l) => map.set(l.id.toLowerCase(), l));
    return map;
  }, [layouts]);
  const findLayout = useCallback((id?: string) => (id ? layoutById.get(id.toLowerCase()) : undefined), [layoutById]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [fData, lData, cData] = await Promise.all([getFrames(), getLayouts(), getCategories()]);
      setFrames(fData);
      setLayouts(lData);
      setCategories(cData);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể tải danh sách khung ảnh.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ?layout=1x4 từ trang Layouts
  useEffect(() => {
    if (typeof router.query.layout === 'string') setActiveLayoutTab(router.query.layout);
  }, [router.query.layout]);

  // Giải phóng object URL khi đổi file hoặc rời trang (không chạy khi chỉ nạp thêm template.xml)
  const draftObjectUrl = draft?.objectUrl;
  useEffect(
    () => () => {
      if (draftObjectUrl) URL.revokeObjectURL(draftObjectUrl);
    },
    [draftObjectUrl]
  );

  // ------------------------------------------------------------------ Library filtering

  const tabFrames = useMemo(
    () =>
      activeLayoutTab === 'all'
        ? frames
        : frames.filter((f) => f.layoutId.toLowerCase() === activeLayoutTab.toLowerCase()),
    [frames, activeLayoutTab]
  );

  const filteredFrames = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return tabFrames.filter((f) => {
      if (filterCategory === 'none' && f.categoryId != null) return false;
      if (typeof filterCategory === 'number' && f.categoryId !== filterCategory) return false;
      if (statusFilter === 'visible' && !f.isActive) return false;
      if (statusFilter === 'hidden' && f.isActive) return false;
      if (kw && !f.name.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [tabFrames, filterCategory, statusFilter, searchKeyword]);

  // Nhóm theo danh mục như thư viện frame của HiHiBooth
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; frames: PhotoFrame[] }>();
    filteredFrames.forEach((f) => {
      const key = f.categoryId != null ? String(f.categoryId) : 'none';
      if (!map.has(key)) map.set(key, { key, label: f.categoryName || 'Chưa phân loại', frames: [] });
      map.get(key)!.frames.push(f);
    });
    return Array.from(map.values())
      .map((g) => {
        const layoutNames = Array.from(new Set(g.frames.map((f) => f.layoutName || f.layoutId)));
        return { ...g, layoutsText: layoutNames.length === 1 ? layoutNames[0] : `${layoutNames.length} layout` };
      })
      .sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.label.localeCompare(b.label, 'vi')));
  }, [filteredFrames]);

  const hasFilters = !!searchKeyword.trim() || filterCategory !== undefined || statusFilter !== 'all';
  const visibleCount = filteredFrames.filter((f) => f.isActive).length;
  const hiddenCount = filteredFrames.length - visibleCount;

  // ------------------------------------------------------------------ Upload flow

  const resetUpload = () => {
    setDraft(null);
    setDraftHoles([]);
    setDraftQr(null);
    setUploadPercent(null);
    setLayoutTouched(false);
    uploadForm.resetFields();
    uploadForm.setFieldsValue({
      layoutId: activeLayoutTab !== 'all' ? findLayout(activeLayoutTab)?.id : layouts[0]?.id,
      categoryId: typeof filterCategory === 'number' ? filterCategory : undefined,
      displayOrder: frames.length + 1,
      isActive: true,
      enableOverlay: false,
    });
  };

  const handleOpenUpload = () => {
    if (layouts.length === 0) {
      message.warning('Chưa có khổ ảnh nào. Hãy tạo layout trước khi thêm frame.');
      return;
    }
    resetUpload();
    setIsUploadOpen(true);
  };

  const handleCloseUpload = () => {
    if (uploadPercent !== null) return; // đang tải lên
    setIsUploadOpen(false);
    setDraft(null);
  };

  const handlePickPng = async (file: File) => {
    if (!/\.png$/i.test(file.name) || (file.type && file.type !== 'image/png')) {
      message.error('Frame phải là ảnh PNG có vùng trong suốt cho ô ảnh.');
      return;
    }
    if (file.size > MAX_FRAME_BYTES) {
      message.error('File frame tối đa 30 MB.');
      return;
    }

    setDetecting(true);
    try {
      const res = await detectTransparentHoles(file);
      const objectUrl = URL.createObjectURL(file);
      const keepXmlHoles = !!draft?.xmlFile;
      setDraft((prev) => ({
        file,
        objectUrl,
        width: res.imageWidth,
        height: res.imageHeight,
        autoHoles: res.holes,
        ignoredEdgeRegions: res.ignoredEdgeRegions,
        xmlFile: prev?.xmlFile ?? null,
      }));
      if (!keepXmlHoles) setDraftHoles(res.holes.map((h) => ({ ...h })));

      if (!uploadForm.getFieldValue('name')) {
        uploadForm.setFieldValue('name', file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim());
      }
      if (!layoutTouched) {
        const suggested = suggestLayout(layouts, res.imageWidth, res.imageHeight, res.holes.length);
        if (suggested) uploadForm.setFieldValue('layoutId', suggested.id);
      }

      if (res.holes.length > 0) {
        message.success(`Tìm thấy ${res.holes.length} ô trong suốt (${res.imageWidth}×${res.imageHeight}px).`);
      } else {
        message.warning('Không tìm thấy ô trong suốt. Hãy dùng chế độ "Vẽ ô" để tạo ô thủ công.');
      }
    } catch (err: any) {
      console.error(err);
      message.error(err?.message || 'Không phân tích được file PNG.');
    } finally {
      setDetecting(false);
    }
  };

  const handlePickXml = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseTemplateXml(String(reader.result || ''));
        // Quy đổi toạ độ template về kích thước PNG đang chọn
        const sx = draft && parsed.width ? draft.width / parsed.width : 1;
        const sy = draft && parsed.height ? draft.height / parsed.height : 1;
        setDraftHoles(
          parsed.holes.map((h) => ({
            x: Math.round(h.x * sx),
            y: Math.round(h.y * sy),
            w: Math.round(h.w * sx),
            h: Math.round(h.h * sy),
            rotation: h.rotation ?? 0,
          }))
        );
        if (parsed.qrCode && parsed.width && parsed.height) {
          setDraftQr({
            x: Math.round(((parsed.qrCode.x + parsed.qrCode.w / 2) / parsed.width) * 1000) / 10,
            y: Math.round(((parsed.qrCode.y + parsed.qrCode.h / 2) / parsed.height) * 1000) / 10,
            size: Math.max(5, Math.min(40, Math.round((parsed.qrCode.w / parsed.width) * 100))),
          });
        }
        if (parsed.name && !/untitled/i.test(parsed.name)) uploadForm.setFieldValue('name', parsed.name);
        const layout = findLayout(parsed.layout);
        if (layout) {
          uploadForm.setFieldValue('layoutId', layout.id);
          setLayoutTouched(true);
        }
        setDraft((prev) => (prev ? { ...prev, xmlFile: file } : prev));
        message.success(`Đã nạp template.xml: ${parsed.holes.length} ô ảnh${parsed.qrCode ? ' và vị trí QR' : ''}.`);
      } catch (err: any) {
        message.error('Không đọc được template.xml: ' + (err?.message || 'file không hợp lệ'));
      }
    };
    reader.readAsText(file);
    return false;
  };

  const handleUploadSubmit = async () => {
    if (!draft) {
      message.warning('Hãy chọn file PNG frame.');
      return;
    }
    let vals: any;
    try {
      vals = await uploadForm.validateFields();
    } catch {
      return;
    }
    if (draftHoles.length === 0) {
      message.warning('Frame chưa có ô ảnh nào. Hãy vẽ ít nhất một ô.');
      return;
    }

    const formData = new FormData();
    formData.append('file', draft.file);
    formData.append('name', vals.name.trim());
    formData.append('layoutId', vals.layoutId);
    if (vals.categoryId != null) formData.append('categoryId', String(vals.categoryId));
    formData.append('displayOrder', String(vals.displayOrder ?? 0));
    formData.append('isActive', String(!!vals.isActive));
    formData.append('enableOverlay', String(!!vals.enableOverlay));
    // Toạ độ đã chỉnh trên client gửi kèm fw/fh; server quy đổi về pixel PNG nếu cần.
    // Không gửi template.xml để server không ghi đè các chỉnh sửa thủ công.
    formData.append('holesJson', holesMetadataJson(draftHoles, draft.width, draft.height));
    if (draftQr) appendQr(formData, draftQr);

    setUploadPercent(0);
    try {
      const created = await createFrame(formData, setUploadPercent);
      setUploadPercent(100);
      message.success(`Đã tải lên "${created.name}" với ${created.holes.length} ô ảnh.`);
      setIsUploadOpen(false);
      setDraft(null);
      loadAll();
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Có lỗi khi tải khung ảnh lên máy chủ. Vui lòng thử lại.'));
    } finally {
      setUploadPercent(null);
    }
  };

  // ------------------------------------------------------------------ Existing frame actions

  const handleOpenEditHoles = (frame: PhotoFrame) => {
    setEditingFrame(frame);
    setEditingHoles((frame.holes || []).map((h) => ({ ...h })));
    setEditingQr(qrOfFrame(frame));
  };

  const handleSaveHoles = async () => {
    if (!editingFrame) return;
    const { w, h } = frameSize(editingFrame, findLayout(editingFrame.layoutId));
    const formData = new FormData();
    formData.append('holesJson', holesMetadataJson(editingHoles, w, h));
    appendQr(formData, editingQr);
    setIsSavingHoles(true);
    try {
      const saved = await updateFrame(editingFrame.id, formData);
      setFrames((prev) => prev.map((f) => (f.id === saved.id ? saved : f)));
      message.success(`Đã lưu toạ độ cho "${saved.name}".`);
      setEditingFrame(null);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể lưu toạ độ mới.'));
    } finally {
      setIsSavingHoles(false);
    }
  };

  const handleToggleActive = async (frame: PhotoFrame, checked: boolean) => {
    setTogglingId(frame.id);
    try {
      const formData = new FormData();
      formData.append('isActive', String(checked));
      const saved = await updateFrame(frame.id, formData);
      setFrames((prev) => prev.map((f) => (f.id === saved.id ? saved : f)));
      message.success(checked ? `Đã hiện "${frame.name}".` : `Đã ẩn "${frame.name}" khỏi màn chọn khung.`);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể cập nhật trạng thái frame.'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleBulk = (makeVisible: boolean) => {
    const targets = filteredFrames.filter((f) => f.isActive !== makeVisible);
    if (targets.length === 0) return;
    Modal.confirm({
      title: makeVisible ? `Hiện ${targets.length} frame đang ẩn?` : `Ẩn ${targets.length} frame đang hiển thị?`,
      content: `Áp dụng cho các frame khớp bộ lọc hiện tại. ${
        makeVisible ? 'Các frame này sẽ xuất hiện lại trên màn chọn khung.' : 'Các frame này sẽ bị ẩn khỏi màn chọn khung.'
      }`,
      okText: makeVisible ? 'Hiện tất cả' : 'Ẩn tất cả',
      cancelText: 'Hủy',
      okButtonProps: { danger: !makeVisible },
      async onOk() {
        setBulkBusy(true);
        try {
          const updated = await bulkFrameVisibility(makeVisible, targets.map((f) => f.id));
          const ids = new Set(targets.map((f) => f.id));
          setFrames((prev) => prev.map((f) => (ids.has(f.id) ? { ...f, isActive: makeVisible } : f)));
          message.success(makeVisible ? `Đã hiện ${updated} frame.` : `Đã ẩn ${updated} frame.`);
        } catch (err: any) {
          console.error(err);
          message.error(errorMessage(err, 'Cập nhật hàng loạt thất bại. Vui lòng thử lại.'));
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const handleOpenMeta = (frame: PhotoFrame) => {
    setMetaFrame(frame);
    setMetaFile(null);
    metaForm.setFieldsValue({
      name: frame.name,
      layoutId: findLayout(frame.layoutId)?.id ?? frame.layoutId,
      categoryId: frame.categoryId ?? undefined,
      displayOrder: frame.displayOrder,
      isActive: frame.isActive,
      enableOverlay: frame.enableOverlay,
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
    const formData = new FormData();
    formData.append('name', vals.name.trim());
    formData.append('layoutId', vals.layoutId);
    if (vals.categoryId != null) formData.append('categoryId', String(vals.categoryId));
    else formData.append('clearCategory', 'true');
    formData.append('displayOrder', String(vals.displayOrder ?? 0));
    formData.append('isActive', String(!!vals.isActive));
    formData.append('enableOverlay', String(!!vals.enableOverlay));
    if (metaFile) formData.append('file', metaFile);

    setIsSavingMeta(true);
    try {
      const saved = await updateFrame(metaFrame.id, formData);
      setMetaFrame(null);
      message.success(`Đã lưu thay đổi cho "${saved.name}".`);
      if (metaFile && metaFrame.frameWidth && saved.frameWidth !== metaFrame.frameWidth) {
        message.info('File PNG mới khác kích thước, toạ độ ô đã được co giãn theo. Hãy kiểm tra lại.');
      }
      loadAll();
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không lưu được thay đổi frame.'));
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleDelete = async (frame: PhotoFrame) => {
    try {
      await deleteFrame(frame.id);
      setFrames((prev) => prev.filter((f) => f.id !== frame.id));
      message.success(`Đã xoá "${frame.name}".`);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể xoá frame. Vui lòng thử lại.'));
    }
  };

  // ------------------------------------------------------------------ Derived values for modals

  const uploadLayout = findLayout(watchedUploadLayout);
  const aspectMismatch =
    draft && uploadLayout
      ? Math.abs(draft.width / draft.height - uploadLayout.widthPx / uploadLayout.heightPx) /
          (uploadLayout.widthPx / uploadLayout.heightPx) >
        0.02
      : false;

  const editingLayout = editingFrame ? findLayout(editingFrame.layoutId) : undefined;
  const editingSize = editingFrame ? frameSize(editingFrame, editingLayout) : { w: 2400, h: 3600 };

  return (
    <div>
      {/* Header */}
      <div className="hb-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="hb-page-title">Quản Lý Khung Ảnh (Frames)</h1>
          <div className="hb-page-subtitle">
            Tải PNG có vùng trong suốt, hệ thống tự đục ô ảnh; chỉnh ô, đặt QR rồi lưu lên máy chụp.
          </div>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadAll} loading={loading}>
            Làm mới
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenUpload}>
            Tải Lên Frame Mới
          </Button>
        </Space>
      </div>

      {/* Tóm tắt */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Frame trong danh sách', value: filteredFrames.length },
          { label: 'Đang hiển thị', value: visibleCount },
          { label: 'Đang ẩn', value: hiddenCount },
          { label: 'Layout khác nhau', value: new Set(filteredFrames.map((f) => f.layoutId)).size },
        ].map((s) => (
          <Col xs={12} md={6} key={s.label}>
            <div className="hb-card" style={{ padding: '12px 16px' }}>
              <div className="hb-hint">{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{s.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Tabs theo khổ ảnh */}
      <div className="hb-card" style={{ padding: '4px 16px', marginBottom: 12 }}>
        <Tabs
          activeKey={activeLayoutTab}
          onChange={setActiveLayoutTab}
          items={[
            {
              key: 'all',
              label: (
                <Space>
                  <span>Tất cả</span>
                  <Badge count={frames.length} showZero style={{ backgroundColor: '#94a3b8' }} />
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
                    <Badge count={count} showZero style={{ backgroundColor: count > 0 ? '#f86fa5' : '#cbd5e1' }} />
                  </Space>
                ),
              };
            }),
          ]}
        />
      </div>

      {/* Bộ lọc + thao tác hàng loạt */}
      <div className="hb-card" style={{ padding: '12px 16px', marginBottom: 20 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={7}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Tìm tên frame..."
              allowClear
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select<number | 'none'>
              style={{ width: '100%' }}
              placeholder="Danh mục"
              allowClear
              value={filterCategory}
              onChange={(v) => setFilterCategory(v)}
              options={[
                ...categories.map((c) => ({ label: c.name, value: c.id as number | 'none' })),
                { label: 'Chưa phân loại', value: 'none' as const },
              ]}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select<StatusFilter>
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'Mọi trạng thái', value: 'all' },
                { label: 'Đang hiển thị', value: 'visible' },
                { label: 'Đang ẩn', value: 'hidden' },
              ]}
            />
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space wrap>
              {hasFilters && (
                <Button
                  type="link"
                  onClick={() => {
                    setSearchKeyword('');
                    setFilterCategory(undefined);
                    setStatusFilter('all');
                  }}
                >
                  Xoá lọc
                </Button>
              )}
              <Button icon={<PoweroffOutlined />} loading={bulkBusy} disabled={hiddenCount === 0} onClick={() => handleBulk(true)}>
                Hiện tất cả
              </Button>
              <Button danger loading={bulkBusy} disabled={visibleCount === 0} onClick={() => handleBulk(false)}>
                Ẩn tất cả
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Thư viện frame */}
      {loading && frames.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : filteredFrames.length === 0 ? (
        <div className="hb-card" style={{ textAlign: 'center', padding: 40 }}>
          <Empty
            description={
              frames.length === 0
                ? "Chưa có khung ảnh nào. Nhấn 'Tải Lên Frame Mới' để thêm frame PNG."
                : 'Không tìm thấy khung ảnh nào phù hợp.'
            }
          />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{group.label}</h2>
              <span className="hb-hint">
                {group.frames.length} frame · {group.layoutsText}
              </span>
            </div>
            <Row gutter={[20, 20]}>
              {group.frames.map((frame) => {
                const layout = findLayout(frame.layoutId);
                const { w, h } = frameSize(frame, layout);
                const holeCount = frame.holes?.length || 0;
                const mismatch = layout != null && holeCount !== layout.holeCount;
                return (
                  <Col xs={24} sm={12} md={8} xl={6} key={frame.id}>
                    <div className={`hb-hover-card${frame.isActive ? '' : ' is-inactive'}`}>
                      <div
                        className="frame-card-media hb-checkerboard"
                        onClick={() => handleOpenEditHoles(frame)}
                        title="Bấm để chỉnh ô ảnh và vị trí QR"
                      >
                        <div className="hb-card-media" style={{ width: '100%', height: '100%' }}>
                          <FrameHolePreview frame={frame} width={w} height={h} />
                        </div>
                        <div className="hb-card-badges">
                          <Tag color="magenta" style={{ margin: 0, fontWeight: 700 }}>
                            {layout?.name || frame.layoutId}
                          </Tag>
                          {!frame.isActive && (
                            <Tag color="default" style={{ margin: 0 }}>
                              Đang ẩn
                            </Tag>
                          )}
                          {frame.enableOverlay && (
                            <Tag color="purple" icon={<VideoCameraOutlined />} style={{ margin: 0 }}>
                              Overlay
                            </Tag>
                          )}
                        </div>
                        <div className="hb-card-switch">
                          <Switch
                            size="small"
                            checked={frame.isActive}
                            loading={togglingId === frame.id}
                            aria-label={`Hiện/ẩn frame ${frame.name}`}
                            onChange={(checked) => handleToggleActive(frame, checked)}
                            onClick={(_, e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      <div className="hb-card-body">
                        <div className="hb-card-name" title={frame.name}>
                          {frame.name}
                        </div>
                        <div className="hb-card-meta">
                          <Tag color={holeCount === 0 ? 'error' : mismatch ? 'warning' : 'success'} style={{ margin: 0 }}>
                            {holeCount === 0
                              ? 'Chưa có ô ảnh'
                              : `${holeCount} ô ảnh${mismatch && layout ? ` / cần ${layout.holeCount}` : ''}`}
                          </Tag>
                          <span>
                            {w}×{h}px{qrOfFrame(frame) ? ' · QR' : ''}
                          </span>
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
                          Ô &amp; QR
                        </Button>
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleOpenMeta(frame)}>
                          Sửa
                        </Button>
                        <Popconfirm
                          title={`Xoá frame "${frame.name}"?`}
                          description="Frame bị xoá khỏi hệ thống và kho lưu trữ. Không thể hoàn tác."
                          onConfirm={() => handleDelete(frame)}
                          okText="Xoá"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                            Xoá
                          </Button>
                        </Popconfirm>
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </section>
        ))
      )}

      {/* ------------------------------------------------------------------ Upload modal */}
      <Modal
        title="Tải lên khung ảnh"
        open={isUploadOpen}
        onCancel={handleCloseUpload}
        width={draft ? 1120 : 720}
        maskClosable={false}
        footer={
          draft
            ? [
                <Button key="cancel" onClick={handleCloseUpload} disabled={uploadPercent !== null}>
                  Hủy bỏ
                </Button>,
                <Button
                  key="submit"
                  type="primary"
                  icon={<UploadOutlined />}
                  loading={uploadPercent !== null}
                  onClick={handleUploadSubmit}
                >
                  {uploadPercent !== null ? `Đang tải lên ${uploadPercent}%` : 'Lưu và tải lên hệ thống'}
                </Button>,
              ]
            : null
        }
        forceRender
      >
        {!draft && (
          <div>
            <div className="hb-hint" style={{ marginBottom: 10 }}>
              Dùng ảnh PNG có vùng trong suốt cho ô ảnh. Chọn kích thước file theo bố cục bạn dùng (rộng × cao):
            </div>
            <Row gutter={12} style={{ marginBottom: 16 }}>
              {FRAME_SIZE_GUIDE.map((g) => (
                <Col span={8} key={g.label}>
                  <div className="hb-card" style={{ padding: 12, textAlign: 'center' }}>
                    <div
                      style={{
                        margin: '0 auto 8px',
                        width: (g.w / Math.max(g.w, g.h)) * 48,
                        height: (g.h / Math.max(g.w, g.h)) * 48,
                        border: '2px solid #f86fa5',
                        borderRadius: 3,
                        background: '#fdf2f8',
                      }}
                    />
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{g.label}</div>
                    <div className="hb-hint">{g.size}</div>
                  </div>
                </Col>
              ))}
            </Row>
            <Spin spinning={detecting} tip="Đang phân tích ô trong suốt...">
              <Upload.Dragger
                accept=".png,image/png"
                showUploadList={false}
                beforeUpload={(file) => {
                  handlePickPng(file);
                  return false;
                }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ fontSize: 36 }} />
                </p>
                <p className="ant-upload-text">Kéo thả hoặc bấm để chọn file PNG frame</p>
                <p className="ant-upload-hint">Hệ thống tự tìm các ô trong suốt ngay sau khi chọn file. Tối đa 30 MB.</p>
              </Upload.Dragger>
            </Spin>
          </div>
        )}

        {/* Form luôn được mount (forceRender) để useForm/useWatch hoạt động; chỉ hiện khi đã có file */}
        <Row gutter={20} style={{ display: draft ? undefined : 'none' }}>
          <Col xs={24} lg={15}>
            {draft && (
              <VisualHoleEditor
                key={draft.objectUrl}
                imageUrl={draft.objectUrl}
                canvasWidth={draft.width}
                canvasHeight={draft.height}
                holes={draftHoles}
                onChange={setDraftHoles}
                autoHoles={draft.autoHoles}
                layoutId={uploadLayout?.id || '2x2'}
                expectedHoleCount={uploadLayout?.holeCount}
                qr={draftQr}
                onQrChange={setDraftQr}
              />
            )}
          </Col>
          <Col xs={24} lg={9}>
            {draft && (
              <div className="hb-card" style={{ padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="hb-card-name" title={draft.file.name}>
                      {draft.file.name}
                    </div>
                    <div className="hb-hint">
                      {draft.width}×{draft.height}px · {(draft.file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <Upload
                    accept=".png,image/png"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      handlePickPng(file);
                      return false;
                    }}
                  >
                    <Button size="small" loading={detecting}>
                      Đổi file
                    </Button>
                  </Upload>
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {draft.autoHoles && draft.autoHoles.length > 0 ? (
                    <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
                      Tự động tìm thấy {draft.autoHoles.length} ô
                    </Tag>
                  ) : (
                    <Tag color="warning" style={{ margin: 0 }}>
                      Không tìm thấy vùng trong suốt
                    </Tag>
                  )}
                  {draft.ignoredEdgeRegions > 0 && (
                    <Tag style={{ margin: 0 }}>Bỏ qua {draft.ignoredEdgeRegions} vùng trong suốt chạm mép ảnh</Tag>
                  )}
                </div>
                <Upload accept=".xml" showUploadList={false} beforeUpload={handlePickXml}>
                  <Button size="small" type="link" icon={<FileTextOutlined />} style={{ paddingLeft: 0, marginTop: 4 }}>
                    {draft.xmlFile ? `Đã nạp ${draft.xmlFile.name}` : 'Nạp toạ độ từ template.xml (tuỳ chọn)'}
                  </Button>
                </Upload>
              </div>
            )}

            {draft && aspectMismatch && uploadLayout && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Tỉ lệ file khác khổ ảnh"
                description={`File ${draft.width}×${draft.height}px nhưng khổ "${uploadLayout.name}" là ${uploadLayout.widthPx}×${uploadLayout.heightPx}px. Ảnh in có thể bị co giãn.`}
              />
            )}

            <Form form={uploadForm} layout="vertical" requiredMark={false}>
              <Form.Item name="name" label="Tên khung" rules={[{ required: true, whitespace: true, message: 'Đặt tên cho khung' }]}>
                <Input placeholder="Đặt tên cho khung..." maxLength={100} />
              </Form.Item>
              <Form.Item name="layoutId" label="Hình dáng (Layout)" rules={[{ required: true, message: 'Chọn layout' }]}>
                <Select
                  options={layouts.map((l) => ({ label: `${l.name} · ${l.holeCount} ô`, value: l.id }))}
                  onChange={() => setLayoutTouched(true)}
                />
              </Form.Item>
              <Row gutter={10}>
                <Col span={14}>
                  <Form.Item name="categoryId" label="Danh mục">
                    <Select allowClear placeholder="Chọn danh mục" options={categories.map((c) => ({ label: c.name, value: c.id }))} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="displayOrder" label="Thứ tự">
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={10}>
                <Col span={12}>
                  <Form.Item name="isActive" label="Hiển thị ngay" valuePropName="checked">
                    <Switch checkedChildren="Hiện" unCheckedChildren="Ẩn" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="enableOverlay"
                    label="Overlay Live View"
                    valuePropName="checked"
                    tooltip="Hiện frame đè lên màn hình xem trước khi chụp"
                  >
                    <Switch
                      onChange={(on) => {
                        if (on) {
                          uploadForm.setFieldValue('enableOverlay', false);
                          confirmOverlay(() => uploadForm.setFieldValue('enableOverlay', true));
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            {uploadPercent !== null && <Progress percent={uploadPercent} size="small" status="active" />}
          </Col>
        </Row>
      </Modal>

      {/* ------------------------------------------------------------------ Hole + QR editor for existing frame */}
      <Modal
        title={editingFrame ? `Ô ảnh & QR: ${editingFrame.name}` : ''}
        open={!!editingFrame}
        onCancel={() => setEditingFrame(null)}
        width={900}
        maskClosable={false}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={() => setEditingFrame(null)}>
            Hủy
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} loading={isSavingHoles} onClick={handleSaveHoles}>
            Lưu toạ độ
          </Button>,
        ]}
      >
        {editingFrame && (
          <VisualHoleEditor
            imageUrl={resolveAssetUrl(editingFrame.frameUrl)}
            canvasWidth={editingSize.w}
            canvasHeight={editingSize.h}
            holes={editingHoles}
            onChange={setEditingHoles}
            autoHoles={editingFrame.holes}
            restoreLabel="Hoàn tác"
            restoreTooltip="Khôi phục toạ độ đã lưu"
            layoutId={editingLayout?.id || editingFrame.layoutId}
            expectedHoleCount={editingLayout?.holeCount}
            qr={editingQr}
            onQrChange={setEditingQr}
          />
        )}
      </Modal>

      {/* ------------------------------------------------------------------ Metadata modal */}
      <Modal
        title={metaFrame ? `Sửa frame: ${metaFrame.name}` : ''}
        open={!!metaFrame}
        onCancel={() => setMetaFrame(null)}
        onOk={handleSaveMeta}
        confirmLoading={isSavingMeta}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        width={560}
        forceRender
      >
        <Form form={metaForm} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Tên khung" rules={[{ required: true, whitespace: true, message: 'Nhập tên frame' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="layoutId" label="Hình dáng (Layout)" rules={[{ required: true, message: 'Chọn layout' }]}>
                <Select options={layouts.map((l) => ({ label: `${l.name} · ${l.holeCount} ô`, value: l.id }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoryId" label="Danh mục">
                <Select allowClear placeholder="Chưa phân loại" options={categories.map((c) => ({ label: c.name, value: c.id }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="displayOrder" label="Thứ tự">
                <InputNumber style={{ width: '100%' }} min={0} precision={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isActive" label="Hiển thị" valuePropName="checked">
                <Switch checkedChildren="Hiện" unCheckedChildren="Ẩn" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="enableOverlay" label="Overlay Live View" valuePropName="checked">
                <Switch
                  onChange={(on) => {
                    if (on) {
                      metaForm.setFieldValue('enableOverlay', false);
                      confirmOverlay(() => metaForm.setFieldValue('enableOverlay', true));
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="Thay file PNG (tuỳ chọn)"
            extra="Nếu file mới khác kích thước, toạ độ ô được co giãn theo tỉ lệ. Kiểm tra lại bằng nút 'Ô & QR'."
            style={{ marginBottom: 0 }}
          >
            <Upload
              accept=".png,image/png"
              maxCount={1}
              fileList={metaFile ? [{ uid: 'meta-file', name: metaFile.name, status: 'done' as const }] : []}
              beforeUpload={(file) => {
                if (!/\.png$/i.test(file.name)) {
                  message.error('Frame phải là file PNG.');
                  return false;
                }
                if (file.size > MAX_FRAME_BYTES) {
                  message.error('File frame tối đa 30 MB.');
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
    </div>
  );
}
