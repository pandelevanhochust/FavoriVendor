import React from 'react';
import { PhotoLayout, resolveAssetUrl } from '../../api/photoLayoutApi';

/**
 * Kho mẫu preview dựng sẵn cho khổ ảnh. Giá trị lưu trên server là `preset:<key>`.
 * Mỗi mẫu mô tả tờ in (tỉ lệ w:h), lưới ô ảnh trên MỘT dải và có nhân đôi dải (cắt đôi) hay không.
 */
export interface LayoutPreviewPreset {
  key: string;
  label: string;
  /** Tỉ lệ tờ in (đơn vị tuỳ ý) */
  w: number;
  h: number;
  cols: number;
  rows: number;
  /** Vẽ 2 dải cạnh nhau kèm đường cắt */
  split: boolean;
}

export const PRESET_PREFIX = 'preset:';

export const LAYOUT_PREVIEW_PRESETS: LayoutPreviewPreset[] = [
  { key: 'strip-1x4', label: '1x4 Strip (cắt đôi)', w: 4, h: 6, cols: 1, rows: 4, split: true },
  { key: 'strip-1x3', label: '1x3 Strip (cắt đôi)', w: 4, h: 6, cols: 1, rows: 3, split: true },
  { key: 'grid-2x2', label: '2x2 Grid', w: 4, h: 6, cols: 2, rows: 2, split: false },
  { key: 'postcard-2x3', label: '2x3 Postcard', w: 4, h: 6, cols: 2, rows: 3, split: false },
  { key: 'landscape-6x4', label: '6x4 Ngang', w: 6, h: 4, cols: 2, rows: 2, split: false },
  { key: 'single-4x6', label: '1 ảnh lớn', w: 4, h: 6, cols: 1, rows: 1, split: false },
];

export function getPresetByKey(key?: string | null): LayoutPreviewPreset | undefined {
  if (!key) return undefined;
  const clean = key.startsWith(PRESET_PREFIX) ? key.slice(PRESET_PREFIX.length) : key;
  return LAYOUT_PREVIEW_PRESETS.find((p) => p.key === clean);
}

type LayoutShape = Pick<PhotoLayout, 'id' | 'widthPx' | 'heightPx' | 'holeCount' | 'isSplit'>;

/** Suy ra mẫu preview từ thông số khổ ảnh khi chưa chọn preview nào. */
export function derivePreset(layout: LayoutShape): LayoutPreviewPreset {
  const holes = Math.max(1, layout.holeCount || 1);
  const landscape = layout.widthPx > layout.heightPx;
  const w = landscape ? 6 : 4;
  const h = landscape ? 4 : 6;

  if (layout.isSplit) {
    return { key: 'auto', label: 'Tự động', w, h, cols: 1, rows: holes, split: true };
  }
  if (holes === 1) {
    return { key: 'auto', label: 'Tự động', w, h, cols: 1, rows: 1, split: false };
  }
  const cols = landscape ? Math.ceil(holes / 2) : 2;
  const rows = Math.ceil(holes / cols);
  return { key: 'auto', label: 'Tự động', w, h, cols, rows, split: false };
}

interface PresetGraphicProps {
  preset: LayoutPreviewPreset;
  /** Chiều dài cạnh lớn nhất (px) */
  size?: number;
  title?: string;
}

/** Vẽ tờ in thu nhỏ: nền giấy, các ô ảnh màu hồng, dải chân logo và đường cắt (nếu có). */
export const PresetGraphic: React.FC<PresetGraphicProps> = ({ preset, size = 120, title }) => {
  const scale = size / Math.max(preset.w, preset.h);
  const width = preset.w * scale;
  const height = preset.h * scale;

  // Toạ độ trong hệ viewBox 100 đơn vị / 1 đơn vị tỉ lệ để nét vẽ đồng đều ở mọi kích cỡ
  const vbW = preset.w * 100;
  const vbH = preset.h * 100;
  const pad = 22;
  const gap = 14;
  const footer = 56;
  const stripCount = preset.split ? 2 : 1;
  const stripW = vbW / stripCount;

  const cells: React.ReactNode[] = [];
  for (let s = 0; s < stripCount; s++) {
    const originX = s * stripW;
    const innerW = stripW - pad * 2;
    const innerH = vbH - pad * 2 - footer;
    const cellW = (innerW - gap * (preset.cols - 1)) / preset.cols;
    const cellH = (innerH - gap * (preset.rows - 1)) / preset.rows;
    for (let r = 0; r < preset.rows; r++) {
      for (let c = 0; c < preset.cols; c++) {
        cells.push(
          <rect
            key={`${s}-${r}-${c}`}
            x={originX + pad + c * (cellW + gap)}
            y={pad + r * (cellH + gap)}
            width={cellW}
            height={cellH}
            rx={8}
            fill="#f86fa5"
            opacity={0.85}
          />
        );
      }
    }
    cells.push(
      <rect
        key={`footer-${s}`}
        x={originX + stripW / 2 - 60}
        y={vbH - pad - footer / 2 - 6}
        width={120}
        height={12}
        rx={6}
        fill="#cbd5e1"
      />
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      role="img"
      aria-label={title || preset.label}
      style={{ display: 'block', filter: 'drop-shadow(0 2px 4px rgba(15,23,42,0.15))' }}
    >
      <title>{title || preset.label}</title>
      <rect x={3} y={3} width={vbW - 6} height={vbH - 6} rx={14} fill="#ffffff" stroke="#cbd5e1" strokeWidth={6} />
      {cells}
      {preset.split && (
        <line
          x1={vbW / 2}
          y1={6}
          x2={vbW / 2}
          y2={vbH - 6}
          stroke="#94a3b8"
          strokeWidth={5}
          strokeDasharray="18 14"
        />
      )}
    </svg>
  );
};

interface LayoutPreviewProps {
  layout: LayoutShape & { name?: string; previewUrl?: string | null };
  size?: number;
}

/** Preview của một khổ ảnh: ảnh đã tải lên, mẫu dựng sẵn, hoặc tự suy ra từ thông số. */
export const LayoutPreview: React.FC<LayoutPreviewProps> = ({ layout, size = 120 }) => {
  const preview = layout.previewUrl || '';
  if (preview && !preview.startsWith(PRESET_PREFIX)) {
    return (
      <img
        src={resolveAssetUrl(preview)}
        alt={`Preview ${layout.name || layout.id}`}
        style={{ maxWidth: size, maxHeight: size, objectFit: 'contain', borderRadius: 4 }}
      />
    );
  }
  const preset = getPresetByKey(preview) || derivePreset(layout);
  return <PresetGraphic preset={preset} size={size} title={layout.name || layout.id} />;
};

export default LayoutPreview;
