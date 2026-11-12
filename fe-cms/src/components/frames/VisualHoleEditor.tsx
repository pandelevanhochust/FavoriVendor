import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { Button, Space, Tag, Tooltip, Switch, Slider, InputNumber, Typography, Row, Col } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  CompressOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import { DetectedHole, generatePresetHoles } from '../../utils/frameDetector';

const { Text } = Typography;

interface VisualHoleEditorProps {
  imageUrl: string;
  canvasWidth?: number;
  canvasHeight?: number;
  holes: DetectedHole[];
  layoutId?: string;
  onChange: (holes: DetectedHole[]) => void;
}

// Sample portrait mockup images for photobooth composite testing
const SAMPLE_PHOTOS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80',
];

export const VisualHoleEditor: React.FC<VisualHoleEditorProps> = ({
  imageUrl,
  canvasWidth = 2400,
  canvasHeight = 3600,
  holes,
  layoutId = '2x2',
  onChange,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(holes.length > 0 ? 0 : null);
  const [isSimulateMode, setIsSimulateMode] = useState<boolean>(false);
  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize';
    handle?: string;
    index: number;
    startX: number;
    startY: number;
    origHole: DetectedHole;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Thêm một ô lồng ảnh mới ở trung tâm
  const handleAddHole = () => {
    const w = Math.round(canvasWidth * 0.4);
    const h = Math.round(canvasHeight * 0.3);
    const x = Math.round((canvasWidth - w) / 2);
    const y = Math.round((canvasHeight - h) / 2);
    const newHole: DetectedHole = { x, y, w, h, rotation: 0 };
    const nextHoles = [...holes, newHole];
    onChange(nextHoles);
    setSelectedIndex(nextHoles.length - 1);
  };

  // Xóa ô đang chọn
  const handleDeleteSelected = () => {
    if (selectedIndex === null || selectedIndex >= holes.length) return;
    const next = holes.filter((_, i) => i !== selectedIndex);
    onChange(next);
    setSelectedIndex(next.length > 0 ? Math.min(selectedIndex, next.length - 1) : null);
  };

  // Reset theo mẫu layout
  const handlePresetHoles = (id: string) => {
    const preset = generatePresetHoles(id, canvasWidth, canvasHeight);
    onChange(preset);
    setSelectedIndex(preset.length > 0 ? 0 : null);
  };

  // Cập nhật thông số ô được chọn
  const handleUpdateSelected = (partial: Partial<DetectedHole>) => {
    if (selectedIndex === null || selectedIndex >= holes.length) return;
    const next = [...holes];
    next[selectedIndex] = { ...next[selectedIndex], ...partial };
    onChange(next);
  };

  // Bắt đầu kéo thả ô
  const handleMouseDown = (e: MouseEvent, index: number, type: 'move' | 'resize', handle?: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedIndex(index);

    const hole = holes[index];
    setDragState({
      type,
      handle,
      index,
      startX: e.clientX,
      startY: e.clientY,
      origHole: { ...hole },
    });
  };

  // Di chuyển chuột khi đang kéo
  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!dragState || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;

      const deltaX = Math.round((e.clientX - dragState.startX) * scaleX);
      const deltaY = Math.round((e.clientY - dragState.startY) * scaleY);

      const next = [...holes];
      const orig = dragState.origHole;

      if (dragState.type === 'move') {
        let newX = orig.x + deltaX;
        let newY = orig.y + deltaY;
        newX = Math.max(0, Math.min(canvasWidth - orig.w, newX));
        newY = Math.max(0, Math.min(canvasHeight - orig.h, newY));
        next[dragState.index] = { ...orig, x: newX, y: newY };
      } else if (dragState.type === 'resize' && dragState.handle) {
        let { x, y, w, h } = orig;
        if (dragState.handle.includes('e')) w = Math.max(80, orig.w + deltaX);
        if (dragState.handle.includes('s')) h = Math.max(80, orig.h + deltaY);
        if (dragState.handle.includes('w')) {
          const maxDelta = orig.w - 80;
          const actualDelta = Math.min(deltaX, maxDelta);
          x = orig.x + actualDelta;
          w = orig.w - actualDelta;
        }
        if (dragState.handle.includes('n')) {
          const maxDelta = orig.h - 80;
          const actualDelta = Math.min(deltaY, maxDelta);
          y = orig.y + actualDelta;
          h = orig.h - actualDelta;
        }
        next[dragState.index] = { ...orig, x, y, w, h };
      }

      onChange(next);
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, holes, canvasWidth, canvasHeight]);

  const selectedHole = selectedIndex !== null ? holes[selectedIndex] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Action Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 14px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            style={{ background: '#f86fa5', borderColor: '#f86fa5' }}
            onClick={handleAddHole}
          >
            Thêm Ô Lồng Ảnh
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            size="small"
            disabled={selectedIndex === null}
            onClick={handleDeleteSelected}
          >
            Xóa Ô #{selectedIndex !== null ? selectedIndex + 1 : ''}
          </Button>
          <Button size="small" onClick={() => handlePresetHoles(layoutId)}>
            Tạo Mẫu {layoutId}
          </Button>
        </Space>

        <Space wrap>
          <Tooltip title="Mô phỏng lồng ảnh khách chụp thật vào các ô để kiểm tra visual chuẩn xác">
            <Space>
              <Text style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>
                <BgColorsOutlined style={{ marginRight: 4, color: '#f86fa5' }} />
                Mô phỏng ảnh chụp:
              </Text>
              <Switch
                checked={isSimulateMode}
                onChange={setIsSimulateMode}
                checkedChildren="Bật"
                unCheckedChildren="Tắt"
              />
            </Space>
          </Tooltip>
        </Space>
      </div>

      {/* Main Canvas Workspace */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#0f172a',
          borderRadius: 12,
          padding: 24,
          minHeight: 460,
          position: 'relative',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Aspect Ratio Container with Transparency Checkerboard */}
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            maxHeight: 520,
            maxWidth: '100%',
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            backgroundImage:
              'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#0f172a',
            borderRadius: 8,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden',
          }}
          onClick={() => setSelectedIndex(null)}
        >
          {/* Layer 1: Simulation Mockup Photos (When Simulate is ON) */}
          {isSimulateMode &&
            holes.map((hole, idx) => {
              const leftPct = (hole.x / canvasWidth) * 100;
              const topPct = (hole.y / canvasHeight) * 100;
              const widthPct = (hole.w / canvasWidth) * 100;
              const heightPct = (hole.h / canvasHeight) * 100;
              const photoUrl = SAMPLE_PHOTOS[idx % SAMPLE_PHOTOS.length];

              return (
                <div
                  key={`sim-${idx}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    overflow: 'hidden',
                    zIndex: 1,
                  }}
                >
                  <img
                    src={photoUrl}
                    alt={`Mock Photo ${idx + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              );
            })}

          {/* Layer 2: Frame PNG Overlay */}
          <img
            src={imageUrl}
            alt="Frame Artwork"
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              zIndex: 2,
              pointerEvents: 'none',
              opacity: isSimulateMode ? 1 : 0.85,
            }}
          />

          {/* Layer 3: Interactive Hole Overlays (When NOT in pure simulation mode) */}
          {holes.map((hole, idx) => {
            const isSelected = selectedIndex === idx;
            const leftPct = (hole.x / canvasWidth) * 100;
            const topPct = (hole.y / canvasHeight) * 100;
            const widthPct = (hole.w / canvasWidth) * 100;
            const heightPct = (hole.h / canvasHeight) * 100;

            return (
              <div
                key={`hole-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  border: isSelected ? '2.5px solid #f86fa5' : '1.5px dashed #38bdf8',
                  backgroundColor: isSimulateMode
                    ? 'transparent'
                    : isSelected
                    ? 'rgba(248, 111, 165, 0.35)'
                    : 'rgba(56, 189, 248, 0.25)',
                  zIndex: 10,
                  cursor: 'move',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isSelected ? '0 0 12px rgba(248, 111, 165, 0.8)' : 'none',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
                onMouseDown={(e) => handleMouseDown(e, idx, 'move')}
              >
                {!isSimulateMode && (
                  <Tag
                    color={isSelected ? 'magenta' : 'blue'}
                    style={{
                      fontWeight: 700,
                      fontSize: 11,
                      pointerEvents: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    }}
                  >
                    #{idx + 1}
                  </Tag>
                )}

                {/* Resize Handles (8 control points) on selected hole */}
                {isSelected && !isSimulateMode && (
                  <>
                    {['nw', 'ne', 'se', 'sw'].map((pos) => (
                      <div
                        key={pos}
                        style={{
                          position: 'absolute',
                          width: 10,
                          height: 10,
                          backgroundColor: '#ffffff',
                          border: '2px solid #f86fa5',
                          borderRadius: '50%',
                          top: pos.includes('n') ? -5 : undefined,
                          bottom: pos.includes('s') ? -5 : undefined,
                          left: pos.includes('w') ? -5 : undefined,
                          right: pos.includes('e') ? -5 : undefined,
                          cursor: `${pos}-resize`,
                          zIndex: 20,
                        }}
                        onMouseDown={(e) => handleMouseDown(e, idx, 'resize', pos)}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Coordinate & Measurement Inspector Panel */}
      {selectedHole ? (
        <div
          style={{
            background: '#ffffff',
            padding: 14,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text strong style={{ color: '#0f172a' }}>
              📍 Tọa độ Ô ảnh #{selectedIndex !== null ? selectedIndex + 1 : ''} (Khổ in {canvasWidth}x{canvasHeight}px):
            </Text>
            <Tag color="magenta">Ô được chọn #{selectedIndex !== null ? selectedIndex + 1 : ''}</Tag>
          </div>

          <Row gutter={[12, 12]}>
            <Col xs={12} sm={6}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Tọa độ X (Trái):
              </Text>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={canvasWidth}
                value={selectedHole.x}
                onChange={(val) => handleUpdateSelected({ x: val || 0 })}
                addonAfter="px"
              />
            </Col>
            <Col xs={12} sm={6}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Tọa độ Y (Trên):
              </Text>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={canvasHeight}
                value={selectedHole.y}
                onChange={(val) => handleUpdateSelected({ y: val || 0 })}
                addonAfter="px"
              />
            </Col>
            <Col xs={12} sm={6}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Chiều Rộng (W):
              </Text>
              <InputNumber
                style={{ width: '100%' }}
                min={50}
                max={canvasWidth}
                value={selectedHole.w}
                onChange={(val) => handleUpdateSelected({ w: val || 50 })}
                addonAfter="px"
              />
            </Col>
            <Col xs={12} sm={6}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Chiều Cao (H):
              </Text>
              <InputNumber
                style={{ width: '100%' }}
                min={50}
                max={canvasHeight}
                value={selectedHole.h}
                onChange={(val) => handleUpdateSelected({ h: val || 50 })}
                addonAfter="px"
              />
            </Col>
          </Row>
        </div>
      ) : (
        <div
          style={{
            padding: 12,
            textAlign: 'center',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px dashed #cbd5e1',
            color: '#64748b',
            fontSize: 13,
          }}
        >
          Nhấp vào bất kỳ ô chữ nhật màu xanh/hồng trên khung ảnh để điều chỉnh tọa độ và kích thước chi tiết.
        </div>
      )}
    </div>
  );
};
export default VisualHoleEditor;
