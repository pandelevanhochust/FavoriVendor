import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  PhotoFilter,
  createFilter,
  deleteFilter,
  getFilters,
  resolveAssetUrl,
  updateFilter,
} from '../api/photoFilterApi';
import { FilterCompare, FilterLook, FilterPreview } from '../components/filters/FilterPreview';
import {
  BLEND_MODES,
  BlendMode,
  CSS_SLIDERS,
  CssFilterValues,
  CubeLut,
  DEFAULT_CSS_VALUES,
  DEFAULT_TEXTURE_VALUES,
  FilterMode,
  TextureValues,
  isCubeFile,
  parseCubeLut,
  parseFilterConfig,
  serializeFilterConfig,
} from '../utils/filterConfig';

const CATEGORY_OPTIONS = [
  { label: 'General (Mặc định)', value: 'General' },
  { label: 'Film (Màu phim)', value: 'Film' },
  { label: 'Black & White (Đen trắng)', value: 'Black & White' },
  { label: 'Natural (Tự nhiên)', value: 'Natural' },
  { label: 'Vintage (Hoài niệm)', value: 'Vintage' },
];

const MAX_LUT_BYTES = 20 * 1024 * 1024;

const errorMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.error || fallback;

/** File texture/LUT người dùng vừa chọn trong modal (chưa tải lên). */
interface PendingAsset {
  file: File;
  isCube: boolean;
  /** LUT đã parse (file .cube) */
  lut?: CubeLut;
  /** Object URL để xem trước (file ảnh) */
  objectUrl?: string;
}

/** Cách hiển thị một bộ lọc đã lưu trên thẻ. */
function lookOfSavedFilter(filter: PhotoFilter): FilterLook {
  const config = parseFilterConfig(filter.configJson, filter.type, filter.intensityDefault);
  if (config.mode === 'css') return { kind: 'css', css: config.css };
  if (!filter.lutUrl) return { kind: 'none' };
  const src = resolveAssetUrl(filter.lutUrl);
  return isCubeFile(filter.lutUrl)
    ? { kind: 'cube', src, opacity: config.texture.opacity }
    : { kind: 'texture', src, opacity: config.texture.opacity, blendMode: config.texture.blendMode };
}

function tagOfSavedFilter(filter: PhotoFilter): { color: string; text: string } {
  if (filter.type === 'Preset') return { color: 'blue', text: 'CSS Preset' };
  if (isCubeFile(filter.lutUrl)) return { color: 'magenta', text: '3D LUT .cube' };
  const config = parseFilterConfig(filter.configJson, filter.type, filter.intensityDefault);
  return { color: 'purple', text: `Texture / ${config.texture.blendMode}` };
}

export default function FiltersPage() {
  const [filters, setFilters] = useState<PhotoFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<PhotoFilter | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<FilterMode>('css');
  const [cssValues, setCssValues] = useState<CssFilterValues>(DEFAULT_CSS_VALUES);
  const [textureValues, setTextureValues] = useState<TextureValues>(DEFAULT_TEXTURE_VALUES);
  const [pendingAsset, setPendingAsset] = useState<PendingAsset | null>(null);

  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setFilters(await getFilters({ category: categoryFilter }));
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể tải danh sách bộ lọc.'));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const clearPendingAsset = useCallback(() => {
    setPendingAsset((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  useEffect(() => clearPendingAsset, [clearPendingAsset]);

  const handleOpenModal = (filter?: PhotoFilter) => {
    clearPendingAsset();
    form.resetFields();
    if (filter) {
      const config = parseFilterConfig(filter.configJson, filter.type, filter.intensityDefault);
      setEditingFilter(filter);
      setMode(config.mode);
      setCssValues(config.css);
      setTextureValues(config.texture);
      form.setFieldsValue({
        code: filter.code,
        name: filter.name,
        category: filter.category,
        displayOrder: filter.displayOrder,
        isActive: filter.isActive,
      });
    } else {
      setEditingFilter(null);
      setMode('css');
      setCssValues(DEFAULT_CSS_VALUES);
      setTextureValues(DEFAULT_TEXTURE_VALUES);
      form.setFieldsValue({
        code: '',
        name: '',
        category: 'General',
        displayOrder: filters.length + 1,
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    clearPendingAsset();
  };

  const handlePickAsset = async (file: File) => {
    const lower = file.name.toLowerCase();
    const cube = lower.endsWith('.cube');
    if (!cube && !lower.endsWith('.png')) {
      message.error('Chỉ nhận file 3D LUT .cube hoặc texture .png.');
      return;
    }
    if (file.size > MAX_LUT_BYTES) {
      message.error('File tối đa 20 MB.');
      return;
    }

    if (cube) {
      try {
        const lut = parseCubeLut(await file.text());
        clearPendingAsset();
        setPendingAsset({ file, isCube: true, lut });
      } catch (err: any) {
        message.error(`File .cube không hợp lệ: ${err?.message || 'không đọc được'}`);
      }
      return;
    }

    clearPendingAsset();
    setPendingAsset({ file, isCube: false, objectUrl: URL.createObjectURL(file) });
  };

  // File đang có hiệu lực ở chế độ texture: file vừa chọn, nếu không thì file đã lưu của bộ lọc đang sửa
  const savedLutUrl = editingFilter?.type === 'LUT' ? editingFilter.lutUrl : undefined;
  const activeAssetIsCube = pendingAsset ? pendingAsset.isCube : isCubeFile(savedLutUrl);
  const hasTextureAsset = !!pendingAsset || !!savedLutUrl;

  const modalLook: FilterLook = useMemo(() => {
    if (mode === 'css') return { kind: 'css', css: cssValues };
    if (pendingAsset?.isCube) return { kind: 'cube', lut: pendingAsset.lut, opacity: textureValues.opacity };
    if (pendingAsset?.objectUrl) {
      return {
        kind: 'texture',
        src: pendingAsset.objectUrl,
        opacity: textureValues.opacity,
        blendMode: textureValues.blendMode,
      };
    }
    if (savedLutUrl) {
      const src = resolveAssetUrl(savedLutUrl);
      return isCubeFile(savedLutUrl)
        ? { kind: 'cube', src, opacity: textureValues.opacity }
        : { kind: 'texture', src, opacity: textureValues.opacity, blendMode: textureValues.blendMode };
    }
    return { kind: 'none' };
  }, [mode, cssValues, textureValues, pendingAsset, savedLutUrl]);

  const handleSave = async () => {
    let vals: any;
    try {
      vals = await form.validateFields();
    } catch {
      return;
    }
    if (mode === 'texture' && !hasTextureAsset) {
      message.error('Vui lòng tải lên file 3D LUT .cube hoặc texture .png.');
      return;
    }

    setSubmitting(true);
    try {
      const name = vals.name.trim();
      const formData = new FormData();
      formData.append('name', name);
      formData.append('category', vals.category || 'General');
      formData.append('type', mode === 'css' ? 'Preset' : 'LUT');
      formData.append('intensityDefault', (mode === 'css' ? 1 : textureValues.opacity / 100).toString());
      formData.append('displayOrder', (vals.displayOrder ?? 0).toString());
      formData.append('isActive', (vals.isActive ?? true).toString());
      formData.append(
        'configJson',
        serializeFilterConfig({ mode, css: cssValues, texture: textureValues })
      );
      if (mode === 'texture' && pendingAsset) formData.append('lutFile', pendingAsset.file);

      if (editingFilter) {
        await updateFilter(editingFilter.id, formData);
        message.success(`Đã cập nhật bộ lọc '${name}'.`);
      } else {
        formData.append('code', vals.code.trim());
        await createFilter(formData);
        message.success(`Đã thêm bộ lọc mới '${name}'.`);
      }

      handleCloseModal();
      loadData();
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Lỗi khi lưu bộ lọc.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFilter(id);
      message.success('Đã xóa bộ lọc.');
      loadData();
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể xóa bộ lọc.'));
    }
  };

  const handleToggleActive = async (filter: PhotoFilter, checked: boolean) => {
    setTogglingId(filter.id);
    try {
      const formData = new FormData();
      formData.append('name', filter.name);
      formData.append('isActive', checked.toString());
      await updateFilter(filter.id, formData);
      setFilters((prev) => prev.map((f) => (f.id === filter.id ? { ...f, isActive: checked } : f)));
      message.success(`Đã ${checked ? 'bật' : 'tắt'} bộ lọc '${filter.name}'.`);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể cập nhật trạng thái.'));
    } finally {
      setTogglingId(null);
    }
  };

  const cssIsDefault = CSS_SLIDERS.every((s) => cssValues[s.key] === DEFAULT_CSS_VALUES[s.key]);
  const savedAssetName = savedLutUrl ? decodeURIComponent(savedLutUrl.split('/').pop()?.split('?')[0] || '') : '';

  return (
    <div>
      <div className="hb-page-header">
        <div>
          <h1 className="hb-page-title">Bộ Lọc Màu &amp; Presets (Photo Filters)</h1>
          <div className="hb-page-subtitle">
            Tạo và chỉnh sửa các preset màu sắc &amp; 3D LUT cho ứng dụng chụp ảnh.
          </div>
        </div>
        <Space wrap>
          <Select
            style={{ width: 210 }}
            placeholder="Tất cả danh mục"
            allowClear
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            options={CATEGORY_OPTIONS}
            aria-label="Lọc theo danh mục"
          />
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
            Làm mới
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            Thêm Bộ Lọc Mới
          </Button>
        </Space>
      </div>

      {loading && filters.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : filters.length === 0 ? (
        <div className="hb-card" style={{ textAlign: 'center', padding: 40 }}>
          <Empty
            description={
              categoryFilter
                ? `Chưa có bộ lọc nào trong danh mục '${categoryFilter}'.`
                : "Chưa có bộ lọc nào. Nhấn 'Thêm Bộ Lọc Mới' để bắt đầu."
            }
          />
        </div>
      ) : (
        <div className="filter-grid">
          {filters.map((filter) => {
            const tag = tagOfSavedFilter(filter);
            return (
              <div key={filter.id} className={`hb-hover-card${filter.isActive ? '' : ' is-inactive'}`}>
                <div className="filter-card-media">
                  <div className="hb-card-media" style={{ width: '100%', height: '100%' }}>
                    <FilterPreview look={lookOfSavedFilter(filter)} alt={`Xem trước bộ lọc ${filter.name}`} />
                  </div>
                  <div className="hb-card-badges">
                    <Tag color={tag.color} style={{ margin: 0, fontWeight: 600 }}>
                      {tag.text}
                    </Tag>
                  </div>
                  <div className="hb-card-switch">
                    <Switch
                      size="small"
                      checked={filter.isActive}
                      loading={togglingId === filter.id}
                      aria-label={`Bật/tắt bộ lọc ${filter.name}`}
                      onChange={(checked) => handleToggleActive(filter, checked)}
                    />
                  </div>
                </div>

                <div className="hb-card-body">
                  <div className="hb-card-name" title={filter.name}>
                    {filter.name}
                  </div>
                  <div className="hb-card-meta">
                    <span style={{ fontFamily: 'monospace' }}>{filter.code}</span>
                    <span>{filter.category}</span>
                  </div>
                  <div className="hb-card-meta">
                    <Tag color={filter.isActive ? 'success' : 'default'} style={{ margin: 0 }}>
                      {filter.isActive ? 'Active' : 'Đang tắt'}
                    </Tag>
                    <span>Thứ tự #{filter.displayOrder}</span>
                  </div>
                </div>

                <div className="hb-card-actions">
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(filter)}>
                    Chỉnh sửa
                  </Button>
                  <Popconfirm
                    title={`Xóa bộ lọc '${filter.name}'?`}
                    description="File LUT/texture và cấu hình sẽ bị xóa. Không thể hoàn tác."
                    onConfirm={() => handleDelete(filter.id)}
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
            );
          })}
        </div>
      )}

      {/* Modal thêm / chỉnh sửa bộ lọc */}
      <Modal
        title={editingFilter ? `Chỉnh Sửa Bộ Lọc: ${editingFilter.name}` : 'Thêm Bộ Lọc Mới'}
        open={isModalOpen}
        onOk={handleSave}
        confirmLoading={submitting}
        onCancel={handleCloseModal}
        okText="Lưu Bộ Lọc"
        cancelText="Hủy"
        width={860}
        forceRender
      >
        <Row gutter={24} style={{ marginTop: 12 }}>
          <Col xs={24} md={9}>
            <FilterCompare look={modalLook} />
            <div className="hb-hint" style={{ marginTop: 8, textAlign: 'center' }}>
              Kéo vạch chia để so sánh trước / sau trên ảnh mẫu.
            </div>
          </Col>

          <Col xs={24} md={15}>
            <Form form={form} layout="vertical" requiredMark={false}>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item
                    name="name"
                    label="Tên hiển thị"
                    rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên bộ lọc' }]}
                  >
                    <Input placeholder="ví dụ: Warm Golden" maxLength={100} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item
                    name="code"
                    label="Mã bộ lọc"
                    tooltip="Mã duy nhất, không đổi được sau khi tạo."
                    rules={[
                      { required: true, whitespace: true, message: 'Nhập mã (vd: warm_golden)' },
                      { pattern: /^[A-Za-z0-9_ -]+$/, message: 'Chỉ dùng chữ, số, gạch dưới' },
                      { max: 50, message: 'Tối đa 50 ký tự' },
                    ]}
                  >
                    <Input placeholder="warm_golden" disabled={!!editingFilter} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="category" label="Danh mục">
                    <Select options={CATEGORY_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="displayOrder" label="Thứ tự">
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
                    <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>

            <Segmented<FilterMode>
              block
              value={mode}
              onChange={setMode}
              options={[
                { label: 'Bộ lọc CSS (7 thanh trượt)', value: 'css' },
                { label: 'Texture / 3D LUT Overlay', value: 'texture' },
              ]}
              style={{ marginBottom: 14 }}
            />

            {mode === 'css' ? (
              <div>
                {CSS_SLIDERS.map((spec) => (
                  <div key={spec.key} className="filter-slider-row">
                    <label htmlFor={`css-${spec.key}`} style={{ fontSize: 13 }}>
                      {spec.label}
                    </label>
                    <Slider
                      id={`css-${spec.key}`}
                      min={spec.min}
                      max={spec.max}
                      step={spec.step}
                      value={cssValues[spec.key]}
                      onChange={(val) => setCssValues((prev) => ({ ...prev, [spec.key]: val }))}
                      tooltip={{ formatter: (val) => `${val}${spec.unit}` }}
                    />
                    <span className="filter-slider-value">
                      {cssValues[spec.key]}
                      {spec.unit}
                    </span>
                  </div>
                ))}
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  disabled={cssIsDefault}
                  onClick={() => setCssValues(DEFAULT_CSS_VALUES)}
                  style={{ marginTop: 6 }}
                >
                  Đặt lại mặc định
                </Button>
              </div>
            ) : (
              <div>
                <Upload.Dragger
                  accept=".cube,.png,image/png"
                  maxCount={1}
                  fileList={
                    pendingAsset
                      ? [{ uid: 'pending-asset', name: pendingAsset.file.name, status: 'done' as const }]
                      : []
                  }
                  beforeUpload={(file) => {
                    handlePickAsset(file);
                    return false;
                  }}
                  onRemove={clearPendingAsset}
                  style={{ padding: '4px 0' }}
                >
                  <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                    <InboxOutlined style={{ fontSize: 30 }} />
                  </p>
                  <p className="ant-upload-text" style={{ fontSize: 14 }}>
                    Kéo thả file 3D LUT <b>.cube</b> hoặc texture <b>.png</b>
                  </p>
                  <p className="ant-upload-hint" style={{ fontSize: 12 }}>
                    {savedAssetName && !pendingAsset
                      ? `Đang dùng: ${savedAssetName}. Chọn file mới để thay thế.`
                      : 'Tối đa 20 MB.'}
                  </p>
                </Upload.Dragger>

                <div className="filter-slider-row" style={{ marginTop: 14 }}>
                  <label htmlFor="texture-opacity" style={{ fontSize: 13 }}>
                    {activeAssetIsCube ? 'Cường độ' : 'Opacity'}
                  </label>
                  <Slider
                    id="texture-opacity"
                    min={0}
                    max={100}
                    value={textureValues.opacity}
                    onChange={(val) => setTextureValues((prev) => ({ ...prev, opacity: val }))}
                    tooltip={{ formatter: (val) => `${val}%` }}
                  />
                  <span className="filter-slider-value">{textureValues.opacity}%</span>
                </div>

                <div className="filter-slider-row" style={{ marginTop: 8, gridTemplateColumns: '96px 1fr' }}>
                  <label htmlFor="texture-blend" style={{ fontSize: 13 }}>
                    Blend Mode
                  </label>
                  <Select<BlendMode>
                    id="texture-blend"
                    value={textureValues.blendMode}
                    onChange={(val) => setTextureValues((prev) => ({ ...prev, blendMode: val }))}
                    options={BLEND_MODES}
                    disabled={activeAssetIsCube}
                  />
                </div>
                {activeAssetIsCube && (
                  <div className="hb-hint" style={{ marginTop: 6 }}>
                    File .cube biến đổi màu trực tiếp nên không dùng blend mode; thanh trên điều chỉnh cường độ.
                  </div>
                )}
              </div>
            )}
          </Col>
        </Row>
      </Modal>
    </div>
  );
}
