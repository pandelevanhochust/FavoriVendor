/**
 * Cấu hình bộ lọc màu lưu trong PhotoFilter.configJson và các hàm dựng preview.
 *
 * Định dạng lưu:
 *   CSS preset : {"mode":"css","css":{"brightness":100,"contrast":100,"saturate":100,"sepia":0,"grayscale":0,"blur":0,"hueRotate":0}}
 *   Texture/LUT: {"mode":"texture","texture":{"opacity":60,"blendMode":"overlay"}}
 * Đơn vị: % cho brightness/contrast/saturate/sepia/grayscale/opacity, px cho blur, độ cho hueRotate.
 */

export interface CssFilterValues {
  brightness: number;
  contrast: number;
  saturate: number;
  sepia: number;
  grayscale: number;
  blur: number;
  hueRotate: number;
}

export type BlendMode = 'overlay' | 'soft-light' | 'screen' | 'multiply' | 'normal';

export interface TextureValues {
  /** 0 - 100 (%) */
  opacity: number;
  blendMode: BlendMode;
}

export type FilterMode = 'css' | 'texture';

export interface FilterConfig {
  mode: FilterMode;
  css: CssFilterValues;
  texture: TextureValues;
}

export const DEFAULT_CSS_VALUES: CssFilterValues = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  sepia: 0,
  grayscale: 0,
  blur: 0,
  hueRotate: 0,
};

export const DEFAULT_TEXTURE_VALUES: TextureValues = { opacity: 60, blendMode: 'overlay' };

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'normal', label: 'Normal' },
];

export interface CssSliderSpec {
  key: keyof CssFilterValues;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export const CSS_SLIDERS: CssSliderSpec[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'saturate', label: 'Saturate', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'blur', label: 'Blur', min: 0, max: 10, step: 0.1, unit: 'px' },
  { key: 'hueRotate', label: 'Hue-Rotate', min: 0, max: 360, step: 1, unit: '°' },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function sanitizeCss(raw: Partial<Record<keyof CssFilterValues, unknown>>): CssFilterValues {
  const out = { ...DEFAULT_CSS_VALUES };
  CSS_SLIDERS.forEach((spec) => {
    const v = num(raw[spec.key]);
    if (v !== undefined) out[spec.key] = clamp(v, spec.min, spec.max);
  });
  return out;
}

/**
 * Đọc cấu hình kiểu cũ (dữ liệu seed), ví dụ {"grayscale":1.0,"contrast":1.2} hoặc
 * {"brightness":0.05,"saturation":1.1}: tỉ lệ quanh 1.0, riêng brightness nhỏ là độ lệch cộng thêm.
 */
function parseLegacyCss(raw: Record<string, unknown>): CssFilterValues {
  const ratio = (v: unknown) => {
    const n = num(v);
    return n === undefined ? undefined : n <= 3 ? n * 100 : n;
  };
  const brightnessRaw = num(raw.brightness);
  const brightness =
    brightnessRaw === undefined
      ? undefined
      : Math.abs(brightnessRaw) < 0.5
        ? 100 + brightnessRaw * 100
        : ratio(brightnessRaw);
  const fraction = (v: unknown) => {
    const n = num(v);
    return n === undefined ? undefined : n <= 1 ? n * 100 : n;
  };
  return sanitizeCss({
    brightness,
    contrast: ratio(raw.contrast),
    saturate: ratio(raw.saturate ?? raw.saturation),
    sepia: fraction(raw.sepia),
    grayscale: fraction(raw.grayscale),
    blur: num(raw.blur),
    hueRotate: num(raw.hueRotate ?? raw.hue),
  });
}

export function parseFilterConfig(
  configJson: string | null | undefined,
  type: 'LUT' | 'Preset',
  intensityDefault = 1
): FilterConfig {
  const fallbackTexture: TextureValues = {
    ...DEFAULT_TEXTURE_VALUES,
    opacity: clamp(Math.round(intensityDefault * 100), 0, 100),
  };
  const fallback: FilterConfig = {
    mode: type === 'Preset' ? 'css' : 'texture',
    css: { ...DEFAULT_CSS_VALUES },
    texture: fallbackTexture,
  };

  if (!configJson) return fallback;
  let raw: any;
  try {
    raw = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
  } catch {
    return fallback;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;

  if (raw.mode === 'css' || raw.mode === 'texture') {
    const blend = BLEND_MODES.some((b) => b.value === raw.texture?.blendMode)
      ? (raw.texture.blendMode as BlendMode)
      : fallbackTexture.blendMode;
    const opacity = num(raw.texture?.opacity);
    return {
      mode: fallback.mode,
      css: sanitizeCss(raw.css || {}),
      texture: {
        opacity: opacity === undefined ? fallbackTexture.opacity : clamp(opacity, 0, 100),
        blendMode: blend,
      },
    };
  }

  return { ...fallback, css: parseLegacyCss(raw) };
}

export function serializeFilterConfig(config: FilterConfig): string {
  return config.mode === 'css'
    ? JSON.stringify({ mode: 'css', css: config.css })
    : JSON.stringify({ mode: 'texture', texture: config.texture });
}

/** Chuỗi CSS `filter` tương ứng; bỏ qua các tham số đang ở giá trị mặc định. */
export function cssFilterString(values: CssFilterValues): string {
  const parts: string[] = [];
  if (values.brightness !== 100) parts.push(`brightness(${values.brightness}%)`);
  if (values.contrast !== 100) parts.push(`contrast(${values.contrast}%)`);
  if (values.saturate !== 100) parts.push(`saturate(${values.saturate}%)`);
  if (values.sepia !== 0) parts.push(`sepia(${values.sepia}%)`);
  if (values.grayscale !== 0) parts.push(`grayscale(${values.grayscale}%)`);
  if (values.blur !== 0) parts.push(`blur(${values.blur}px)`);
  if (values.hueRotate !== 0) parts.push(`hue-rotate(${values.hueRotate}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

export const isCubeFile = (nameOrUrl?: string | null) =>
  !!nameOrUrl && /\.cube(\?.*)?$/i.test(nameOrUrl);

// ------------------------------------------------------------------ 3D LUT (.cube)

export interface CubeLut {
  size: number;
  /** size^3 * 3 giá trị RGB, chỉ số đỏ thay đổi nhanh nhất */
  data: Float32Array;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

const MAX_LUT_SIZE = 129;

/** Phân tích file Adobe/Resolve .cube (3D). Ném lỗi kèm lý do nếu file không hợp lệ. */
export function parseCubeLut(text: string): CubeLut {
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  let data: Float32Array | null = null;
  let written = 0;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const first = line.charCodeAt(0);
    const isNumeric = first === 45 || first === 46 || first === 43 || (first >= 48 && first <= 57);
    if (!isNumeric) {
      const parts = line.split(/\s+/);
      const keyword = parts[0].toUpperCase();
      if (keyword === 'LUT_1D_SIZE') throw new Error('Chỉ hỗ trợ LUT 3D, file này là LUT 1D.');
      if (keyword === 'LUT_3D_SIZE') {
        size = parseInt(parts[1], 10);
        if (!Number.isInteger(size) || size < 2 || size > MAX_LUT_SIZE) {
          throw new Error(`LUT_3D_SIZE không hợp lệ (cho phép 2 - ${MAX_LUT_SIZE}).`);
        }
        data = new Float32Array(size * size * size * 3);
      } else if (keyword === 'DOMAIN_MIN' || keyword === 'DOMAIN_MAX') {
        const triple = parts.slice(1, 4).map(Number) as [number, number, number];
        if (triple.length !== 3 || triple.some((v) => !Number.isFinite(v))) {
          throw new Error(`${keyword} không hợp lệ.`);
        }
        if (keyword === 'DOMAIN_MIN') domainMin = triple;
        else domainMax = triple;
      }
      // TITLE và các từ khoá khác: bỏ qua
      continue;
    }

    if (!data) throw new Error('Thiếu dòng LUT_3D_SIZE trước dữ liệu màu.');
    const parts = line.split(/\s+/);
    if (parts.length < 3) throw new Error(`Dòng ${i + 1} không đủ 3 giá trị RGB.`);
    if (written + 3 > data.length) throw new Error('Số dòng dữ liệu nhiều hơn LUT_3D_SIZE khai báo.');
    for (let c = 0; c < 3; c++) {
      const v = Number(parts[c]);
      if (!Number.isFinite(v)) throw new Error(`Dòng ${i + 1} chứa giá trị không phải số.`);
      data[written++] = v;
    }
  }

  if (!data || size === 0) throw new Error('File không chứa LUT_3D_SIZE.');
  if (written !== data.length) {
    throw new Error(`Thiếu dữ liệu: cần ${data.length / 3} dòng màu, đọc được ${written / 3}.`);
  }
  for (let c = 0; c < 3; c++) {
    if (domainMax[c] <= domainMin[c]) throw new Error('DOMAIN_MAX phải lớn hơn DOMAIN_MIN.');
  }
  return { size, data, domainMin, domainMax };
}

/** Áp LUT 3D lên ImageData tại chỗ (nội suy trilinear), trộn với ảnh gốc theo intensity 0..1. */
export function applyCubeLut(image: ImageData, lut: CubeLut, intensity = 1): void {
  const { size, data, domainMin, domainMax } = lut;
  const px = image.data;
  const n1 = size - 1;
  const mix = clamp(intensity, 0, 1);
  if (mix === 0) return;

  const scale = [0, 1, 2].map((c) => n1 / (domainMax[c] - domainMin[c]));
  const stride = size * 3;
  const slice = size * size * 3;

  for (let i = 0; i < px.length; i += 4) {
    const r = clamp((px[i] / 255 - domainMin[0]) * scale[0], 0, n1);
    const g = clamp((px[i + 1] / 255 - domainMin[1]) * scale[1], 0, n1);
    const b = clamp((px[i + 2] / 255 - domainMin[2]) * scale[2], 0, n1);

    const r0 = Math.floor(r);
    const g0 = Math.floor(g);
    const b0 = Math.floor(b);
    const r1 = Math.min(r0 + 1, n1);
    const g1 = Math.min(g0 + 1, n1);
    const b1 = Math.min(b0 + 1, n1);
    const fr = r - r0;
    const fg = g - g0;
    const fb = b - b0;

    const i000 = r0 * 3 + g0 * stride + b0 * slice;
    const i100 = r1 * 3 + g0 * stride + b0 * slice;
    const i010 = r0 * 3 + g1 * stride + b0 * slice;
    const i110 = r1 * 3 + g1 * stride + b0 * slice;
    const i001 = r0 * 3 + g0 * stride + b1 * slice;
    const i101 = r1 * 3 + g0 * stride + b1 * slice;
    const i011 = r0 * 3 + g1 * stride + b1 * slice;
    const i111 = r1 * 3 + g1 * stride + b1 * slice;

    for (let c = 0; c < 3; c++) {
      const c00 = data[i000 + c] + (data[i100 + c] - data[i000 + c]) * fr;
      const c10 = data[i010 + c] + (data[i110 + c] - data[i010 + c]) * fr;
      const c01 = data[i001 + c] + (data[i101 + c] - data[i001 + c]) * fr;
      const c11 = data[i011 + c] + (data[i111 + c] - data[i011 + c]) * fr;
      const c0 = c00 + (c10 - c00) * fg;
      const c1 = c01 + (c11 - c01) * fg;
      const mapped = clamp(c0 + (c1 - c0) * fb, 0, 1) * 255;
      px[i + c] = px[i + c] + (mapped - px[i + c]) * mix;
    }
  }
}
