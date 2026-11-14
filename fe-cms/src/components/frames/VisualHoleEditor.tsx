import React, { useCallback, useRef, useState } from 'react';
import { Button, Col, InputNumber, Row, Segmented, Slider, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import {
  BgColorsOutlined,
  DeleteOutlined,
  PlusOutlined,
  QrcodeOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { DetectedHole, generatePresetHoles } from '../../utils/frameDetector';
import type { QrPlacement } from '../../api/photoLayoutApi';

const { Text } = Typography;

interface VisualHoleEditorProps {
  imageUrl: string;
  /** Kích thước hệ toạ độ của holes (= kích thước PNG) */
  canvasWidth?: number;
  canvasHeight?: number;
  holes: DetectedHole[];
  layoutId?: string;
  onChange: (holes: DetectedHole[]) => void;
  /** Bộ ô để khôi phục (mặc định: kết quả quét tự động) */
  autoHoles?: DetectedHole[] | null;
  restoreLabel?: string;
  restoreTooltip?: string;
  /** Số ô khổ ảnh yêu cầu, để cảnh báo khi lệch */
  expectedHoleCount?: number;
  /** Vị trí QR (%). Chỉ hiện điều khiển QR khi có onQrChange */
  qr?: QrPlacement | null;
  onQrChange?: (qr: QrPlacement | null) => void;
}

type Mode = 'select' | 'draw';
type Handle = 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'move'; index: number; startX: number; startY: number; orig: DetectedHole }
  | { kind: 'resize'; index: number; handle: Handle; startX: number; startY: number; orig: DetectedHole }
  | { kind: 'draw'; startX: number; startY: number }
  | { kind: 'qr'; offsetX: number; offsetY: number };

const DEFAULT_QR: QrPlacement = { x: 85, y: 90, size: 10 };

// Ảnh chân dung mẫu để mô phỏng kết quả lồng ảnh
const SAMPLE_PHOTOS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80',
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const VisualHoleEditor: React.FC<VisualHoleEditorProps> = ({
  imageUrl,
  canvasWidth = 2400,
  canvasHeight = 3600,
  holes,
  layoutId = '2x2',
  onChange,
  autoHoles,
  restoreLabel = 'Auto',
  restoreTooltip = 'Khôi phục về kết quả quét tự động',
  expectedHoleCount,
  qr,
  onQrChange,
}) => {
  const [mode, setMode] = useState<Mode>('select');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(holes.length > 0 ? 0 : null);
  const [isSimulateMode, setIsSimulateMode] = useState(false);
  const [draft, setDraft] = useState<DetectedHole | null>(null);
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const minSize = Math.max(20, Math.round(Math.min(canvasWidth, canvasHeight) * 0.01));
  const qrEnabled = !!onQrChange;

  const selected = selectedIndex !== null && selectedIndex < holes.length ? selectedIndex : null;
  const selectedHole = selected !== null ? holes[selected] : null;

  /** Toạ độ con trỏ theo pixel của frame */
  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
      return {
        x: clamp(((clientX - rect.left) / rect.width) * canvasWidth, 0, canvasWidth),
        y: clamp(((clientY - rect.top) / rect.height) * canvasHeight, 0, canvasHeight),
      };
    },
    [canvasWidth, canvasHeight]
  );

  const replaceHole = (index: number, hole: DetectedHole) => {
    const next = [...holes];
    next[index] = hole;
    onChange(next);
  };

  const deleteHole = (index: number) => {
    const next = holes.filter((_, i) => i !== index);
    onChange(next);
    setSelectedIndex(next.length > 0 ? Math.min(index, next.length - 1) : null);
  };

  const handleAddHole = () => {
    const w = Math.round(canvasWidth * 0.4);
    const h = Math.round(canvasHeight * 0.3);
    const next = [...holes, { x: Math.round((canvasWidth - w) / 2), y: Math.round((canvasHeight - h) / 2), w, h, rotation: 0 }];
    onChange(next);
    setSelectedIndex(next.length - 1);
  };

  const handlePresetHoles = () => {
    const preset = generatePresetHoles(layoutId, canvasWidth, canvasHeight);
    onChange(preset);
    setSelectedIndex(preset.length > 0 ? 0 : null);
  };

  const handleRestoreAuto = () => {
    if (!autoHoles) return;
    onChange(autoHoles.map((h) => ({ ...h })));
    setSelectedIndex(autoHoles.length > 0 ? 0 : null);
  };

  // ------------------------------------------------------------------ Pointer interactions

  const beginDrag = (e: React.PointerEvent, drag: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = drag;
    setDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
    containerRef.current?.focus({ preventScroll: true });
  };

  const onHolePointerDown = (e: React.PointerEvent, index: number, handle?: Handle) => {
    if (mode === 'draw' && !handle) return; // để nền nhận và vẽ ô mới
    setSelectedIndex(index);
    const p = toCanvas(e.clientX, e.clientY);
    beginDrag(
      e,
      handle
        ? { kind: 'resize', index, handle, startX: p.x, startY: p.y, orig: { ...holes[index] } }
        : { kind: 'move', index, startX: p.x, startY: p.y, orig: { ...holes[index] } }
    );
  };

  const onQrPointerDown = (e: React.PointerEvent) => {
    if (!qr) return;
    const p = toCanvas(e.clientX, e.clientY);
    beginDrag(e, {
      kind: 'qr',
      offsetX: (qr.x / 100) * canvasWidth - p.x,
      offsetY: (qr.y / 100) * canvasHeight - p.y,
    });
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (mode === 'draw') {
      const p = toCanvas(e.clientX, e.clientY);
      setSelectedIndex(null);
      setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
      beginDrag(e, { kind: 'draw', startX: p.x, startY: p.y });
    } else {
      setSelectedIndex(null);
      containerRef.current?.focus({ preventScroll: true });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toCanvas(e.clientX, e.clientY);

    if (drag.kind === 'draw') {
      setDraft({
        x: Math.min(drag.startX, p.x),
        y: Math.min(drag.startY, p.y),
        w: Math.abs(p.x - drag.startX),
        h: Math.abs(p.y - drag.startY),
      });
      return;
    }

    if (drag.kind === 'qr') {
      if (!qr || !onQrChange) return;
      onQrChange({
        ...qr,
        x: Math.round(clamp(((p.x + drag.offsetX) / canvasWidth) * 100, 0, 100) * 10) / 10,
        y: Math.round(clamp(((p.y + drag.offsetY) / canvasHeight) * 100, 0, 100) * 10) / 10,
      });
      return;
    }

    const dx = Math.round(p.x - drag.startX);
    const dy = Math.round(p.y - drag.startY);
    const o = drag.orig;

    if (drag.kind === 'move') {
      replaceHole(drag.index, {
        ...o,
        x: clamp(o.x + dx, 0, canvasWidth - o.w),
        y: clamp(o.y + dy, 0, canvasHeight - o.h),
      });
      return;
    }

    let left = o.x;
    let top = o.y;
    let right = o.x + o.w;
    let bottom = o.y + o.h;
    if (drag.handle.includes('w')) left = clamp(o.x + dx, 0, right - minSize);
    if (drag.handle.includes('e')) right = clamp(o.x + o.w + dx, left + minSize, canvasWidth);
    if (drag.handle.includes('n')) top = clamp(o.y + dy, 0, bottom - minSize);
    if (drag.handle.includes('s')) bottom = clamp(o.y + o.h + dy, top + minSize, canvasHeight);
    replaceHole(drag.index, { ...o, x: left, y: top, w: right - left, h: bottom - top });
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    if (drag?.kind === 'draw') {
      if (draft && draft.w >= minSize && draft.h >= minSize) {
        const next = [...holes, { x: Math.round(draft.x), y: Math.round(draft.y), w: Math.round(draft.w), h: Math.round(draft.h), rotation: 0 }];
        onChange(next);
        setSelectedIndex(next.length - 1);
      }
      setDraft(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (selected === null) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteHole(selected);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const h = holes[selected];
    replaceHole(selected, {
      ...h,
      x: clamp(h.x + move[0], 0, canvasWidth - h.w),
      y: clamp(h.y + move[1], 0, canvasHeight - h.h),
    });
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const countMismatch = expectedHoleCount != null && expectedHoleCount > 0 && holes.length !== expectedHoleCount;
  const qrBoxW = qr ? (qr.size / 100) * canvasWidth : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <Space wrap size={8}>
          <Segmented<Mode>
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { label: '↖ Chọn', value: 'select', title: 'Chọn, kéo để di chuyển, kéo góc để đổi kích thước' },
              { label: '✚ Vẽ ô', value: 'draw', title: 'Kéo trên khung để vẽ ô mới' },
            ]}
          />
          <Tag color={countMismatch ? 'warning' : holes.length > 0 ? 'success' : 'error'} style={{ margin: 0 }}>
            {holes.length} ô ảnh{expectedHoleCount ? ` / khổ cần ${expectedHoleCount}` : ''}
          </Tag>
          {selected !== null && <Text style={{ fontSize: 12, color: '#64748b' }}>Đang chọn #{selected + 1}</Text>}
        </Space>

        <Space wrap size={6}>
          <Button size="small" icon={<PlusOutlined />} onClick={handleAddHole}>
            Thêm ô
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={selected === null} onClick={() => selected !== null && deleteHole(selected)}>
            Xóa ô
          </Button>
          {autoHoles && (
            <Tooltip title={restoreTooltip}>
              <Button size="small" icon={<UndoOutlined />} onClick={handleRestoreAuto}>
                {restoreLabel}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={`Thay toàn bộ ô bằng bố cục mẫu của khổ ${layoutId}`}>
            <Button size="small" onClick={handlePresetHoles}>
              Mẫu {layoutId}
            </Button>
          </Tooltip>
          <Tooltip title="Lồng ảnh mẫu vào các ô để kiểm tra trước khi lưu">
            <Space size={4}>
              <BgColorsOutlined style={{ color: '#f86fa5' }} />
              <Text style={{ fontSize: 12 }}>Mô phỏng</Text>
              <Switch size="small" checked={isSimulateMode} onChange={setIsSimulateMode} />
            </Space>
          </Tooltip>
        </Space>
      </div>

      {/* Workspace */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#0f172a',
          borderRadius: 12,
          padding: 16,
          minHeight: 420,
          userSelect: 'none',
        }}
      >
        <div
          ref={containerRef}
          tabIndex={0}
          role="application"
          aria-label="Vùng chỉnh ô lồng ảnh. Phím mũi tên để dịch ô đang chọn, Delete để xoá."
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          className="hb-checkerboard"
          style={{
            position: 'relative',
            height: 520,
            maxHeight: '70vh',
            maxWidth: '100%',
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            borderRadius: 6,
            overflow: 'hidden',
            outline: 'none',
            touchAction: 'none',
            cursor: mode === 'draw' ? 'crosshair' : dragging ? 'grabbing' : 'default',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Ảnh mẫu lồng dưới khung khi mô phỏng */}
          {isSimulateMode &&
            holes.map((hole, idx) => (
              <div
                key={`sim-${idx}`}
                style={{
                  position: 'absolute',
                  left: pct(hole.x, canvasWidth),
                  top: pct(hole.y, canvasHeight),
                  width: pct(hole.w, canvasWidth),
                  height: pct(hole.h, canvasHeight),
                  overflow: 'hidden',
                }}
              >
                <img
                  src={SAMPLE_PHOTOS[idx % SAMPLE_PHOTOS.length]}
                  alt=""
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            ))}

          <img
            src={imageUrl}
            alt="Frame"
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              pointerEvents: 'none',
            }}
          />

          {/* Các ô */}
          {!isSimulateMode &&
            holes.map((hole, idx) => {
              const isSelected = selected === idx;
              return (
                <div
                  key={`hole-${idx}`}
                  onPointerDown={(e) => onHolePointerDown(e, idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteHole(idx);
                  }}
                  title="Kéo để di chuyển, chuột phải để xoá"
                  style={{
                    position: 'absolute',
                    left: pct(hole.x, canvasWidth),
                    top: pct(hole.y, canvasHeight),
                    width: pct(hole.w, canvasWidth),
                    height: pct(hole.h, canvasHeight),
                    border: isSelected ? '2px solid #6366f1' : '2px dashed #ff2828',
                    background: isSelected ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 40, 40, 0.3)',
                    cursor: mode === 'draw' ? 'crosshair' : 'move',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: isSelected ? '#ffffff' : '#ffffff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      pointerEvents: 'none',
                    }}
                  >
                    #{idx + 1}
                  </span>
                  {isSelected &&
                    (['nw', 'ne', 'sw', 'se'] as Handle[]).map((pos) => (
                      <div
                        key={pos}
                        onPointerDown={(e) => onHolePointerDown(e, idx, pos)}
                        style={{
                          position: 'absolute',
                          width: 12,
                          height: 12,
                          background: '#ffffff',
                          border: '2px solid #6366f1',
                          top: pos.startsWith('n') ? -6 : undefined,
                          bottom: pos.startsWith('s') ? -6 : undefined,
                          left: pos.endsWith('w') ? -6 : undefined,
                          right: pos.endsWith('e') ? -6 : undefined,
                          cursor: pos === 'nw' || pos === 'se' ? 'nwse-resize' : 'nesw-resize',
                        }}
                      />
                    ))}
                </div>
              );
            })}

          {/* Ô đang vẽ */}
          {draft && (
            <div
              style={{
                position: 'absolute',
                left: pct(draft.x, canvasWidth),
                top: pct(draft.y, canvasHeight),
                width: pct(draft.w, canvasWidth),
                height: pct(draft.h, canvasHeight),
                border: '2px dashed #22c55e',
                background: 'rgba(34, 197, 94, 0.2)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* QR */}
          {qrEnabled && qr && (
            <div
              onPointerDown={onQrPointerDown}
              title="Kéo để đặt vị trí mã QR"
              style={{
                position: 'absolute',
                left: pct((qr.x / 100) * canvasWidth - qrBoxW / 2, canvasWidth),
                top: pct((qr.y / 100) * canvasHeight - qrBoxW / 2, canvasHeight),
                width: pct(qrBoxW, canvasWidth),
                height: pct(qrBoxW, canvasHeight),
                background: 'rgba(59, 130, 246, 0.65)',
                border: '2px solid #ffffff',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'grab',
              }}
            >
              QR
            </div>
          )}
        </div>
      </div>

      {/* QR controls */}
      {qrEnabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '8px 12px',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
          }}
        >
          <Space size={6}>
            <QrcodeOutlined style={{ color: '#3b82f6' }} />
            <Text style={{ fontSize: 13, fontWeight: 600 }}>In mã QR tải ảnh</Text>
            <Switch size="small" checked={!!qr} onChange={(on) => onQrChange?.(on ? qr ?? DEFAULT_QR : null)} />
          </Space>
          {qr && (
            <>
              <Text style={{ fontSize: 12, color: '#64748b' }}>Kích thước</Text>
              <Slider
                min={5}
                max={40}
                value={qr.size}
                onChange={(size) => onQrChange?.({ ...qr, size })}
                style={{ flex: 1, minWidth: 140, margin: '0 6px' }}
                tooltip={{ formatter: (v) => `${v}%` }}
              />
              <Text style={{ fontSize: 12, color: '#64748b', minWidth: 120 }}>
                {qr.size}% · tâm ({qr.x}%, {qr.y}%)
              </Text>
            </>
          )}
        </div>
      )}

      {/* Inspector */}
      {selectedHole && selected !== null ? (
        <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: '#0f172a' }}>
            Ô #{selected + 1} · toạ độ theo file PNG {canvasWidth}×{canvasHeight}px
          </Text>
          <Row gutter={[10, 10]}>
            {(
              [
                ['x', 'X (trái)', canvasWidth],
                ['y', 'Y (trên)', canvasHeight],
                ['w', 'Rộng', canvasWidth],
                ['h', 'Cao', canvasHeight],
              ] as const
            ).map(([key, label, max]) => (
              <Col xs={12} sm={6} key={key}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                  {label}
                </Text>
                <InputNumber
                  style={{ width: '100%' }}
                  min={key === 'w' || key === 'h' ? minSize : 0}
                  max={max}
                  precision={0}
                  value={selectedHole[key]}
                  onChange={(val) => {
                    if (val == null) return;
                    const next = { ...selectedHole, [key]: val };
                    next.w = clamp(next.w, minSize, canvasWidth);
                    next.h = clamp(next.h, minSize, canvasHeight);
                    next.x = clamp(next.x, 0, canvasWidth - next.w);
                    next.y = clamp(next.y, 0, canvasHeight - next.h);
                    replaceHole(selected, next);
                  }}
                  addonAfter="px"
                />
              </Col>
            ))}
          </Row>
        </div>
      ) : (
        <div
          style={{
            padding: 10,
            textAlign: 'center',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px dashed #cbd5e1',
            color: '#64748b',
            fontSize: 12,
          }}
        >
          Bấm vào một ô để chỉnh. Chế độ "Vẽ ô": kéo trên khung để tạo ô mới. Chuột phải hoặc phím Delete để xoá ô.
        </div>
      )}
    </div>
  );
};

export default VisualHoleEditor;
