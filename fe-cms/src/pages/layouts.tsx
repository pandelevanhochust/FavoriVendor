import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Space,
  Spin,
  Switch,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  AppstoreOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ScissorOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import {
  LayoutPayload,
  PhotoLayout,
  PricingTier,
  createLayout,
  deleteLayout,
  getLayouts,
  updateLayout,
  uploadLayoutPreview,
} from '../api/photoLayoutApi';
import {
  LAYOUT_PREVIEW_PRESETS,
  LayoutPreview,
  PRESET_PREFIX,
  PresetGraphic,
} from '../components/layouts/LayoutPreviewGraphic';

interface LayoutFormValues {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  widthPx: number;
  heightPx: number;
  holeCount: number;
  captureCount: number;
  isSplit: boolean;
  useHolesAutoCapture: boolean;
  isActive: boolean;
  displayOrder: number;
  pricingTiers: PricingTier[];
}

const NEW_KEY = '__new__';
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

const DEFAULT_TIERS: PricingTier[] = [
  { quantity: 2, price: 70000 },
  { quantity: 4, price: 100000 },
  { quantity: 6, price: 130000 },
];

const formatVnd = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const errorMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.error || fallback;

function toFormValues(layout: PhotoLayout): LayoutFormValues {
  return {
    id: layout.id,
    name: layout.name,
    slug: layout.slug,
    description: layout.description,
    widthPx: layout.widthPx,
    heightPx: layout.heightPx,
    holeCount: layout.holeCount,
    captureCount: layout.captureCount && layout.captureCount > 0 ? layout.captureCount : layout.holeCount,
    isSplit: !!layout.isSplit,
    useHolesAutoCapture: !!layout.useHolesAutoCapture,
    isActive: layout.isActive,
    displayOrder: layout.displayOrder,
    pricingTiers: layout.pricingTiers?.length ? layout.pricingTiers : [],
  };
}

/** Payload đầy đủ từ một layout có sẵn (dùng cho bật/tắt nhanh); không đụng tới previewUrl. */
function toPayload(layout: PhotoLayout, overrides: Partial<LayoutPayload> = {}): LayoutPayload {
  return {
    ...toFormValues(layout),
    ...overrides,
  };
}

export default function LayoutsPage() {
  const [layouts, setLayouts] = useState<PhotoLayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Preview: giá trị đã/sẽ lưu ("preset:<key>", URL, hoặc '' = tự động) + file tuỳ chỉnh chờ tải lên khi lưu
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [pendingPreview, setPendingPreview] = useState<{ file: File; objectUrl: string } | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const [form] = Form.useForm<LayoutFormValues>();
  const initialSelectionDone = useRef(false);

  const isCreating = selectedKey === NEW_KEY;
  const selectedLayout = useMemo(
    () => layouts.find((l) => l.id === selectedKey) || null,
    [layouts, selectedKey]
  );

  const watchedName = Form.useWatch('name', form);
  const watchedWidth = Form.useWatch('widthPx', form);
  const watchedHeight = Form.useWatch('heightPx', form);
  const watchedHoles = Form.useWatch('holeCount', form);
  const watchedSplit = Form.useWatch('isSplit', form);
  const watchedAuto = Form.useWatch('useHolesAutoCapture', form);
  const watchedTiers = Form.useWatch('pricingTiers', form);

  const clearPendingPreview = useCallback(() => {
    setPendingPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  useEffect(() => clearPendingPreview, [clearPendingPreview]);

  const applySelection = useCallback(
    (layout: PhotoLayout | null, allLayouts: PhotoLayout[]) => {
      clearPendingPreview();
      form.resetFields();
      if (layout) {
        setSelectedKey(layout.id);
        form.setFieldsValue(toFormValues(layout));
        setPreviewUrl(layout.previewUrl || '');
      } else {
        setSelectedKey(NEW_KEY);
        form.setFieldsValue({
          id: '',
          name: '',
          slug: '',
          description: '',
          widthPx: 1200,
          heightPx: 1800,
          holeCount: 4,
          captureCount: 4,
          isSplit: false,
          useHolesAutoCapture: false,
          isActive: true,
          displayOrder: allLayouts.length + 1,
          pricingTiers: DEFAULT_TIERS,
        });
        setPreviewUrl('');
      }
      setDirty(false);
    },
    [clearPendingPreview, form]
  );

  const loadData = useCallback(async (): Promise<PhotoLayout[] | null> => {
    setLoading(true);
    try {
      const data = await getLayouts();
      setLayouts(data);
      return data;
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể tải danh sách khổ ảnh từ server.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const data = await loadData();
      if (data && !initialSelectionDone.current) {
        initialSelectionDone.current = true;
        if (data.length > 0) applySelection(data[0], data);
      }
    })();
  }, [loadData, applySelection]);

  const confirmDiscard = (onOk: () => void) => {
    if (!dirty) {
      onOk();
      return;
    }
    Modal.confirm({
      title: 'Bỏ các thay đổi chưa lưu?',
      content: 'Khổ ảnh đang mở có thay đổi chưa được lưu. Chuyển sang mục khác sẽ mất các thay đổi này.',
      okText: 'Bỏ thay đổi',
      cancelText: 'Ở lại',
      okButtonProps: { danger: true },
      onOk,
    });
  };

  const handleSelect = (layout: PhotoLayout) => {
    if (layout.id === selectedKey) return;
    confirmDiscard(() => applySelection(layout, layouts));
  };

  const handleStartCreate = () => {
    if (isCreating) return;
    confirmDiscard(() => applySelection(null, layouts));
  };

  const handleReload = () => {
    confirmDiscard(async () => {
      const data = await loadData();
      if (!data) return;
      const current = data.find((l) => l.id === selectedKey);
      if (current) applySelection(current, data);
      else if (data.length > 0) applySelection(data[0], data);
      else setSelectedKey(null);
    });
  };

  const handleValuesChange = (changed: Partial<LayoutFormValues>, all: LayoutFormValues) => {
    setDirty(true);
    // Khi bật tự tính, số shots luôn đi theo số ô ảnh
    if (all.useHolesAutoCapture && ('holeCount' in changed || 'useHolesAutoCapture' in changed)) {
      form.setFieldValue('captureCount', all.holeCount);
    }
    if ('holeCount' in changed || 'captureCount' in changed) {
      form.validateFields(['captureCount']).catch(() => undefined);
    }
  };

  const handlePickPreset = (key: string) => {
    clearPendingPreview();
    setPreviewUrl(`${PRESET_PREFIX}${key}`);
    setDirty(true);
    setIsLibraryOpen(false);
  };

  const handlePickCustomPreview = (file: File) => {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
      message.error('Ảnh preview phải là PNG, JPG hoặc WEBP.');
      return false;
    }
    if (file.size > MAX_PREVIEW_BYTES) {
      message.error('Ảnh preview tối đa 5 MB.');
      return false;
    }
    clearPendingPreview();
    setPendingPreview({ file, objectUrl: URL.createObjectURL(file) });
    setDirty(true);
    return false;
  };

  const handleResetPreview = () => {
    clearPendingPreview();
    setPreviewUrl('');
    setDirty(true);
  };

  const handleSave = async () => {
    let values: LayoutFormValues;
    try {
      values = await form.validateFields();
    } catch {
      message.warning('Vui lòng kiểm tra lại các trường đang báo lỗi.');
      return;
    }

    const tiers = [...(values.pricingTiers || [])].sort((a, b) => a.quantity - b.quantity);
    const payload: LayoutPayload = {
      ...values,
      id: values.id.trim(),
      name: values.name.trim(),
      slug: values.slug?.trim() || undefined,
      captureCount: values.useHolesAutoCapture ? values.holeCount : values.captureCount,
      pricingTiers: tiers,
      // Có file tuỳ chỉnh chờ tải lên -> để server giữ nguyên, endpoint upload sẽ ghi đè sau
      previewUrl: pendingPreview ? undefined : previewUrl,
    };

    setSaving(true);
    try {
      let saved = isCreating
        ? await createLayout(payload)
        : await updateLayout(selectedKey as string, payload);

      if (pendingPreview) {
        try {
          saved = await uploadLayoutPreview(saved.id, pendingPreview.file);
        } catch (err: any) {
          console.error(err);
          message.warning(
            errorMessage(err, 'Đã lưu khổ ảnh nhưng tải ảnh preview thất bại. Hãy thử tải lại ảnh.')
          );
        }
      }

      message.success(
        isCreating ? `Đã tạo khổ ảnh '${saved.name}'.` : `Đã lưu thay đổi cho '${saved.name}'.`
      );
      const data = await loadData();
      const fresh = data?.find((l) => l.id === saved.id) || saved;
      applySelection(fresh, data || layouts);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Lỗi khi lưu cấu hình khổ ảnh.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (layout: PhotoLayout, checked: boolean) => {
    setTogglingId(layout.id);
    try {
      await updateLayout(layout.id, toPayload(layout, { isActive: checked }));
      setLayouts((prev) => prev.map((l) => (l.id === layout.id ? { ...l, isActive: checked } : l)));
      // Đồng bộ form đang mở mà không làm mất các chỉnh sửa khác
      if (layout.id === selectedKey) form.setFieldValue('isActive', checked);
      message.success(`Đã ${checked ? 'bật' : 'tắt'} khổ ảnh ${layout.name}.`);
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể cập nhật trạng thái.'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedLayout) return;
    try {
      await deleteLayout(selectedLayout.id);
      message.success(`Đã xóa khổ ảnh '${selectedLayout.name}'.`);
      const data = await loadData();
      if (data && data.length > 0) applySelection(data[0], data);
      else {
        setSelectedKey(null);
        setDirty(false);
      }
    } catch (err: any) {
      console.error(err);
      message.error(errorMessage(err, 'Không thể xóa khổ ảnh.'));
    }
  };

  const startingPrice = useMemo(() => {
    const valid = (watchedTiers || []).filter(
      (t) => t && typeof t.quantity === 'number' && typeof t.price === 'number'
    );
    if (valid.length === 0) return null;
    return valid.reduce((min, t) => (t.quantity < min.quantity ? t : min));
  }, [watchedTiers]);

  const previewShape = {
    id: selectedLayout?.id || 'new',
    name: watchedName,
    widthPx: watchedWidth || 1200,
    heightPx: watchedHeight || 1800,
    holeCount: watchedHoles || 1,
    isSplit: !!watchedSplit,
    previewUrl,
  };

  const previewSourceLabel = pendingPreview
    ? 'Ảnh tuỳ chỉnh (sẽ tải lên khi lưu)'
    : previewUrl.startsWith(PRESET_PREFIX)
      ? 'Mẫu từ kho preview'
      : previewUrl
        ? 'Ảnh tuỳ chỉnh đã tải lên'
        : 'Tự động theo thông số';

  const describeLayout = (l: PhotoLayout) => {
    const shots = l.captureCount && l.captureCount > 0 ? l.captureCount : l.holeCount;
    const parts = [`${l.holeCount} ảnh`, l.useHolesAutoCapture ? 'shots tự động' : `${shots} shots`];
    if (l.isSplit) parts.push('cắt đôi');
    return parts.join(' / ');
  };

  return (
    <div>
      <div className="hb-page-header">
        <div>
          <h1 className="hb-page-title">Khổ Ảnh &amp; Cấu Hình In (Photo Layouts)</h1>
          <div className="hb-page-subtitle">
            Chọn một khổ ảnh ở cột trái để chỉnh preview, thông số chụp/in và bảng giá theo số bản in.
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleReload} loading={loading}>
            Làm mới
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleStartCreate}>
            Thêm Khổ Ảnh Mới
          </Button>
        </Space>
      </div>

      <Row gutter={[20, 20]} align="top">
        {/* ------------------------------------------------ Master: danh sách khổ ảnh */}
        <Col xs={24} lg={8}>
          <div className="layouts-sidebar">
            {loading && layouts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin />
              </div>
            )}

            {layouts.map((layout) => {
              const active = layout.id === selectedKey;
              return (
                <div
                  key={layout.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  className={`layout-item${active ? ' is-active' : ''}`}
                  onClick={() => handleSelect(layout)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(layout);
                    }
                  }}
                >
                  <div className="layout-item-thumb">
                    <LayoutPreview layout={layout} size={52} />
                  </div>
                  <div className="layout-item-main">
                    <div className="layout-item-name" title={layout.name}>
                      {layout.name}
                    </div>
                    <div className="layout-item-sub">{describeLayout(layout)}</div>
                    <Space size={4} style={{ marginTop: 6 }} wrap>
                      <Tag color="magenta" style={{ margin: 0 }}>
                        {layout.id}
                      </Tag>
                      <Tag style={{ margin: 0 }}>{layout.frameCount ?? 0} frames</Tag>
                    </Space>
                  </div>
                  <Switch
                    size="small"
                    checked={layout.isActive}
                    loading={togglingId === layout.id}
                    aria-label={`Bật/tắt khổ ảnh ${layout.name}`}
                    onChange={(checked) => handleToggleActive(layout, checked)}
                    onClick={(_, e) => e.stopPropagation()}
                  />
                </div>
              );
            })}

            {isCreating && (
              <div className="layout-item is-active is-new" aria-current="true">
                <div className="layout-item-thumb">
                  <AppstoreOutlined style={{ fontSize: 24, color: '#f86fa5' }} />
                </div>
                <div className="layout-item-main">
                  <div className="layout-item-name">{watchedName || 'Khổ ảnh mới'}</div>
                  <div className="layout-item-sub">Chưa lưu</div>
                </div>
              </div>
            )}

            {!isCreating && (
              <Button type="dashed" icon={<PlusOutlined />} onClick={handleStartCreate} block>
                Thêm layout
              </Button>
            )}
          </div>
        </Col>

        {/* ------------------------------------------------ Detail: khổ ảnh đang chọn */}
        <Col xs={24} lg={16}>
          {selectedKey === null && (
            <div className="hb-card" style={{ padding: 48 }}>
              <Empty
                description={
                  loading ? 'Đang tải khổ ảnh...' : 'Chưa có khổ ảnh nào. Hãy thêm khổ ảnh đầu tiên.'
                }
              >
                {!loading && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleStartCreate}>
                    Thêm Khổ Ảnh Mới
                  </Button>
                )}
              </Empty>
            </div>
          )}
          {/* Form luôn được mount để instance useForm/useWatch hoạt động trước khi có lựa chọn */}
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onValuesChange={handleValuesChange}
            className="hb-card"
            style={{ display: selectedKey === null ? 'none' : undefined }}
          >
              {/* Header: tên + trạng thái */}
              <div className="hb-section">
                <Row gutter={16} align="bottom">
                  <Col xs={24} md={14}>
                    <Form.Item
                      name="name"
                      label="Tên khổ ảnh"
                      rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên khổ ảnh' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input size="large" placeholder="ví dụ: Layout 2 Cut Strips" maxLength={100} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={5}>
                    <Form.Item
                      name="id"
                      label="Mã khổ"
                      tooltip="Mã định danh duy nhất, máy Kiosk dùng mã này. Không đổi được sau khi tạo."
                      rules={[
                        { required: true, whitespace: true, message: 'Nhập mã khổ (vd: 1x4)' },
                        { max: 32, message: 'Tối đa 32 ký tự' },
                        {
                          validator: (_, value) =>
                            isCreating &&
                            value &&
                            layouts.some((l) => l.id.toLowerCase() === String(value).trim().toLowerCase())
                              ? Promise.reject(new Error('Mã khổ này đã tồn tại'))
                              : Promise.resolve(),
                        },
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input size="large" placeholder="1x4" disabled={!isCreating} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={5}>
                    <Form.Item
                      name="isActive"
                      label="Trạng thái"
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                    >
                      <Switch checkedChildren="Đang bật" unCheckedChildren="Đang tắt" />
                    </Form.Item>
                  </Col>
                </Row>
                {dirty && (
                  <Tag color="gold" style={{ marginTop: 12 }}>
                    Có thay đổi chưa lưu
                  </Tag>
                )}
              </div>

              {/* 1. Preview */}
              <div className="hb-section">
                <div className="hb-section-title">
                  <span className="hb-step">1</span> Hình ảnh preview khổ ảnh
                </div>
                <div className="preview-stage">
                  <div className="preview-stage-canvas">
                    {pendingPreview ? (
                      <img
                        src={pendingPreview.objectUrl}
                        alt="Ảnh preview mới"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
                      />
                    ) : (
                      <LayoutPreview layout={previewShape} size={180} />
                    )}
                  </div>
                  <Space direction="vertical" size={10}>
                    <div className="hb-hint">
                      Nguồn hiện tại: <b>{previewSourceLabel}</b>
                    </div>
                    <Button icon={<PictureOutlined />} onClick={() => setIsLibraryOpen(true)}>
                      Chọn từ Kho Mẫu Preview
                    </Button>
                    <Upload
                      accept=".png,.jpg,.jpeg,.webp"
                      showUploadList={false}
                      beforeUpload={handlePickCustomPreview}
                    >
                      <Button icon={<UploadOutlined />}>Tải ảnh Preview Mới</Button>
                    </Upload>
                    {(previewUrl || pendingPreview) && (
                      <Button type="link" style={{ padding: 0 }} onClick={handleResetPreview}>
                        Dùng preview tự động
                      </Button>
                    )}
                  </Space>
                </div>
              </div>

              {/* 2. Thông số chụp & in */}
              <div className="hb-section">
                <div className="hb-section-title">
                  <span className="hb-step">2</span> Thông số chụp và in
                </div>
                <Row gutter={16}>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="holeCount"
                      label="Số ảnh trên khung"
                      tooltip="Số ô ảnh (holes) được in trên một khung."
                      rules={[{ required: true, message: 'Nhập số ảnh' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={1} max={12} precision={0} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="captureCount"
                      label="Số lần bấm máy (shots)"
                      tooltip="Số ảnh máy chụp để khách chọn. Phải lớn hơn hoặc bằng số ảnh trên khung."
                      dependencies={['holeCount']}
                      rules={[
                        { required: true, message: 'Nhập số shots' },
                        ({ getFieldValue }) => ({
                          validator: (_, value) =>
                            typeof value === 'number' && value < (getFieldValue('holeCount') || 0)
                              ? Promise.reject(new Error('Không được ít hơn số ảnh trên khung'))
                              : Promise.resolve(),
                        }),
                      ]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1}
                        max={24}
                        precision={0}
                        disabled={!!watchedAuto}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="widthPx"
                      label="Chiều rộng render"
                      rules={[{ required: true, message: 'Nhập chiều rộng' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={300} max={6000} precision={0} addonAfter="px" />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="heightPx"
                      label="Chiều cao render"
                      rules={[{ required: true, message: 'Nhập chiều cao' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={300} max={6000} precision={0} addonAfter="px" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="isSplit"
                      valuePropName="checked"
                      label={
                        <span>
                          <ScissorOutlined /> Tách 2 dải in (cắt đôi)
                        </span>
                      }
                      extra="In hai dải giống nhau trên một tờ rồi cắt đôi."
                    >
                      <Switch checkedChildren="Có" unCheckedChildren="Không" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="useHolesAutoCapture"
                      valuePropName="checked"
                      label="Tự động tính shots theo lỗ frame"
                      extra="Số shots lấy theo số lỗ của frame khách chọn; ô shots phía trên bị khoá."
                    >
                      <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} md={16}>
                    <Form.Item name="description" label="Mô tả / ghi chú cắt giấy" style={{ marginBottom: 0 }}>
                      <Input.TextArea rows={2} maxLength={500} placeholder="ví dụ: Máy in tự cắt làm 2 dải 5x15cm" />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item name="displayOrder" label="Thứ tự hiển thị" style={{ marginBottom: 0 }}>
                      <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                    </Form.Item>
                  </Col>
                </Row>
                {!isCreating && (
                  <Form.Item name="slug" hidden>
                    <Input />
                  </Form.Item>
                )}
              </div>

              {/* 3. Bảng giá in */}
              <div className="hb-section">
                <div className="hb-section-title">
                  <span className="hb-step">3</span> Bảng giá in (pricing tiers)
                </div>
                <div className="hb-hint" style={{ marginBottom: 12 }}>
                  Giá khởi điểm:{' '}
                  <b style={{ color: '#be185d' }}>
                    {startingPrice
                      ? `${formatVnd(startingPrice.price)} cho ${startingPrice.quantity} bản in`
                      : 'chưa đặt giá'}
                  </b>
                  . Mỗi bậc là tổng giá cho đúng số bản in đó.
                </div>

                <Form.List name="pricingTiers">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <div key={key} className="layout-pricing-row">
                          <Form.Item
                            {...restField}
                            name={[name, 'quantity']}
                            rules={[
                              { required: true, message: 'Nhập số bản' },
                              ({ getFieldValue }) => ({
                                validator: (_, value) => {
                                  const all: PricingTier[] = getFieldValue('pricingTiers') || [];
                                  const dup = all.filter((t) => t && t.quantity === value).length > 1;
                                  return dup
                                    ? Promise.reject(new Error('Số bản in bị trùng'))
                                    : Promise.resolve();
                                },
                              }),
                            ]}
                          >
                            <InputNumber min={1} max={100} precision={0} addonAfter="bản in" style={{ width: 150 }} />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'price']}
                            rules={[{ required: true, message: 'Nhập giá tiền' }]}
                          >
                            <InputNumber<number>
                              min={0}
                              step={5000}
                              precision={0}
                              style={{ width: 190 }}
                              formatter={(val) => `${val ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                              parser={(val) => Number((val || '').replace(/[^\d]/g, ''))}
                              addonAfter="₫"
                            />
                          </Form.Item>
                          <Button
                            type="text"
                            danger
                            icon={<MinusCircleOutlined />}
                            aria-label="Xóa bậc giá"
                            onClick={() => remove(name)}
                          />
                        </div>
                      ))}
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          const all: PricingTier[] = form.getFieldValue('pricingTiers') || [];
                          const maxQty = all.reduce((m, t) => Math.max(m, t?.quantity || 0), 0);
                          const lastPrice = all.reduce((m, t) => Math.max(m, t?.price || 0), 0);
                          add({ quantity: maxQty + 2, price: lastPrice });
                        }}
                      >
                        Thêm bậc in
                      </Button>
                    </>
                  )}
                </Form.List>
              </div>

              {/* Toolbar */}
              <div className="layout-toolbar">
                <Space wrap>
                  <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                    {isCreating ? 'Tạo khổ ảnh' : 'Lưu thay đổi'}
                  </Button>
                  {selectedLayout && (
                    <Link href={`/frames?layout=${encodeURIComponent(selectedLayout.id)}`}>
                      <Button icon={<PictureOutlined />}>
                        Xem Frames thuộc Layout ({selectedLayout.frameCount ?? 0})
                      </Button>
                    </Link>
                  )}
                  {isCreating && layouts.length > 0 && (
                    <Button onClick={() => applySelection(layouts[0], layouts)}>Hủy tạo mới</Button>
                  )}
                </Space>
                {selectedLayout && (
                  <Popconfirm
                    title={`Xóa khổ ảnh '${selectedLayout.name}'?`}
                    description={
                      (selectedLayout.frameCount ?? 0) > 0
                        ? `${selectedLayout.frameCount} frame thuộc khổ này cũng sẽ bị xóa. Không thể hoàn tác.`
                        : 'Thao tác này không thể hoàn tác.'
                    }
                    onConfirm={handleDelete}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                  >
                    <Button danger icon={<DeleteOutlined />}>
                      Xóa Layout
                    </Button>
                  </Popconfirm>
                )}
              </div>
          </Form>
        </Col>
      </Row>

      {/* Kho mẫu preview */}
      <Modal
        title="Kho Mẫu Preview Khổ Ảnh"
        open={isLibraryOpen}
        onCancel={() => setIsLibraryOpen(false)}
        footer={null}
        width={640}
      >
        <div className="hb-hint" style={{ marginBottom: 14 }}>
          Chọn một mẫu minh hoạ bố cục. Mẫu chỉ dùng để hiển thị; thông số chụp/in vẫn theo mục 2.
        </div>
        <div className="preview-library-grid">
          {LAYOUT_PREVIEW_PRESETS.map((preset) => {
            const active = !pendingPreview && previewUrl === `${PRESET_PREFIX}${preset.key}`;
            return (
              <button
                key={preset.key}
                type="button"
                className={`preview-library-item${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => handlePickPreset(preset.key)}
              >
                <span className="preview-library-item-art">
                  <PresetGraphic preset={preset} size={104} />
                </span>
                {preset.label}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
