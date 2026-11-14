export interface DetectedHole {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface ParsedTemplate {
  name: string;
  layout: string;
  width: number;
  height: number;
  holes: DetectedHole[];
  qrCode?: { x: number; y: number; w: number; h: number };
  imagePath?: string;
  print2PerPage?: boolean;
}

/**
 * Phân tích file template.xml từ kho D:\WORK\Frames hoặc xuất từ Tool_Create_Frame
 */
export function parseTemplateXml(xmlText: string): ParsedTemplate {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const templateEl = doc.getElementsByTagName('Template')[0] || doc.querySelector('Template');

  if (!templateEl) {
    throw new Error('File XML không đúng định dạng photobooth template.');
  }

  const name = templateEl.getAttribute('Name') || templateEl.getAttribute('name') || 'Untitled Frame';
  const layout = templateEl.getAttribute('Layout') || templateEl.getAttribute('layout') || '4x6';
  const width = parseInt(templateEl.getAttribute('Width') || templateEl.getAttribute('width') || '2400', 10);
  const height = parseInt(templateEl.getAttribute('Height') || templateEl.getAttribute('height') || '3600', 10);
  const print2PerPage = (templateEl.getAttribute('print_2_per_page') || '').toLowerCase() === 'true';

  const holes: DetectedHole[] = [];
  const photoEls = Array.from(doc.getElementsByTagName('Photo')).concat(Array.from(doc.getElementsByTagName('photo')));
  photoEls.forEach((p) => {
    const w = parseInt(p.getAttribute('Width') || p.getAttribute('width') || '0', 10);
    const h = parseInt(p.getAttribute('Height') || p.getAttribute('height') || '0', 10);
    const top = parseInt(p.getAttribute('Top') || p.getAttribute('top') || '0', 10);
    const left = parseInt(p.getAttribute('Left') || p.getAttribute('left') || '0', 10);

    if (w > 0 && h > 0) {
      holes.push({
        x: left,
        y: top,
        w: w,
        h: h,
        rotation: 0,
      });
    }
  });

  // Tìm ảnh viền
  const imageEls = Array.from(doc.getElementsByTagName('Image')).concat(Array.from(doc.getElementsByTagName('image')));
  const frameImgEl = imageEls.find(i => (i.getAttribute('Name') || '').toLowerCase() === 'frame') || imageEls[0];
  const imagePath = frameImgEl?.getAttribute('ImagePath') || frameImgEl?.getAttribute('imagepath') || undefined;

  // Tìm vị trí QR Code
  const qrEls = Array.from(doc.getElementsByTagName('QrCode')).concat(Array.from(doc.getElementsByTagName('qrcode')));
  let qrCode: { x: number; y: number; w: number; h: number } | undefined = undefined;
  if (qrEls.length > 0) {
    const qrEl = qrEls[0];
    qrCode = {
      x: parseInt(qrEl.getAttribute('Left') || qrEl.getAttribute('left') || '0', 10),
      y: parseInt(qrEl.getAttribute('Top') || qrEl.getAttribute('top') || '0', 10),
      w: parseInt(qrEl.getAttribute('Width') || qrEl.getAttribute('width') || '200', 10),
      h: parseInt(qrEl.getAttribute('Height') || qrEl.getAttribute('height') || '200', 10),
    };
  }

  return {
    name,
    layout,
    width,
    height,
    holes,
    qrCode,
    imagePath,
    print2PerPage,
  };
}

/**
 * Sinh tọa độ holes chuẩn hóa theo các khổ photobooth phổ biến
 */
export function generatePresetHoles(layoutId: string, width = 2400, height = 3600): DetectedHole[] {
  const normLayout = layoutId.toLowerCase();
  if (normLayout === '1x4' || normLayout === '2x6') {
    // 4 ô dải film dọc
    const holes: DetectedHole[] = [];
    const itemH = Math.round((height - 500) / 4);
    const itemW = Math.round(width * 0.72);
    const left = Math.round((width - itemW) / 2);
    for (let i = 0; i < 4; i++) {
      holes.push({
        x: left,
        y: 200 + i * (itemH + 40),
        w: itemW,
        h: itemH - 40,
        rotation: 0,
      });
    }
    return holes;
  }

  if (normLayout === '2x2') {
    // Lưới 4 ô vuông
    const w = 1100;
    const h = 1250;
    return [
      { x: 97, y: 343, w, h, rotation: 0 },
      { x: 1206, y: 343, w, h, rotation: 0 },
      { x: 97, y: 1617, w, h, rotation: 0 },
      { x: 1206, y: 1617, w, h, rotation: 0 },
    ];
  }

  if (normLayout === '2x3') {
    // Postcard 6 ô ảnh
    const w = 1088;
    const h = 880;
    return [
      { x: 106, y: 421, w, h, rotation: 0 },
      { x: 1204, y: 421, w, h, rotation: 0 },
      { x: 106, y: 1314, w, h, rotation: 0 },
      { x: 1204, y: 1314, w, h, rotation: 0 },
      { x: 106, y: 2208, w, h, rotation: 0 },
      { x: 1204, y: 2208, w, h, rotation: 0 },
    ];
  }

  // Mặc định 4 ô
  const count = 4;
  const holes: DetectedHole[] = [];
  const itemHeight = Math.floor((height - 400) / count);
  const itemWidth = Math.floor(width * 0.75);
  const x = Math.floor((width - itemWidth) / 2);
  for (let i = 0; i < count; i++) {
    holes.push({
      x,
      y: 160 + i * itemHeight,
      w: itemWidth,
      h: itemHeight - 60,
      rotation: 0,
    });
  }
  return holes;
}

/** Kiểu ô trên file frame: trong suốt (alpha) hoặc ô giữ chỗ màu xám đục. */
export type HoleDetectMode = 'transparent' | 'placeholder';

export interface HoleDetectResult {
  holes: DetectedHole[];
  imageWidth: number;
  imageHeight: number;
  /** Số vùng hợp lệ bị bỏ vì chạm mép ảnh (nền ngoài viền). */
  ignoredEdgeRegions: number;
  mode: HoleDetectMode;
}

export interface AutoDetectResult extends HoleDetectResult {
  /** Số ô tìm được theo kiểu còn lại, để gợi ý người dùng đổi kiểu khi cần. */
  alternativeCount: number;
}

export interface PlaceholderOptions {
  /** Chênh lệch tối đa giữa các kênh R/G/B để coi là màu xám trung tính. */
  grayTolerance?: number;
  /** Khoảng độ sáng của ô xám (0-255). */
  minLevel?: number;
  maxLevel?: number;
}

export interface DetectOptions {
  alphaThreshold?: number;
  /** Tỉ lệ diện tích tối thiểu so với toàn ảnh (0.005 = 0.5%) */
  minAreaRatio?: number;
  /** Chỉ áp dụng cho ô xám: tỉ lệ lấp đầy khung bao tối thiểu */
  minFillRatio?: number;
  placeholder?: PlaceholderOptions;
}

const PLACEHOLDER_DEFAULTS: Required<PlaceholderOptions> = { grayTolerance: 10, minLevel: 185, maxLevel: 252 };
const MAX_SCAN_SIZE = 800;

/** Pixel thuộc ô giữ chỗ: gần như xám trung tính (R≈G≈B), sáng vừa, không trong suốt. */
function isPlaceholderPixel(r: number, g: number, b: number, a: number, o: Required<PlaceholderOptions>) {
  if (a < 30) return false;
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  return max - min <= o.grayTolerance && min >= o.minLevel && max <= o.maxLevel;
}

/** Ảnh đã thu nhỏ để quét, dùng chung cho mọi kiểu dò. */
interface ScanImage {
  data: Uint8ClampedArray;
  scanW: number;
  scanH: number;
  origW: number;
  origH: number;
  scale: number;
}

// Mỗi file chỉ giải mã + thu nhỏ một lần; WeakMap tự giải phóng khi file không còn được giữ.
const scanCache = new WeakMap<Blob, Promise<ScanImage>>();

function getScan(file: Blob): Promise<ScanImage> {
  let pending = scanCache.get(file);
  if (!pending) {
    pending = buildScan(file);
    pending.catch(() => scanCache.delete(file));
    scanCache.set(file, pending);
  }
  return pending;
}

async function buildScan(file: Blob): Promise<ScanImage> {
  const img = await loadImage(file);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  if (!origW || !origH) throw new Error('File ảnh không có kích thước hợp lệ.');

  const scale = Math.min(1, MAX_SCAN_SIZE / Math.max(origW, origH));
  const scanW = Math.max(1, Math.round(origW * scale));
  const scanH = Math.max(1, Math.round(origH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = scanW;
  canvas.height = scanH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas.');
  ctx.drawImage(img, 0, 0, scanW, scanH);
  return { data: ctx.getImageData(0, 0, scanW, scanH).data, scanW, scanH, origW, origH, scale };
}

/**
 * Tìm ô trên ảnh đã quét.
 *
 * Thuật toán (đối chiếu frameHoleDetector của HiHiBooth):
 *  1. Ảnh đã thu nhỏ về cạnh dài tối đa 800px.
 *  2. Đánh dấu pixel thuộc ô:
 *     - 'transparent': alpha < alphaThreshold;
 *     - 'placeholder': màu xám trung tính sáng (ô giữ chỗ #E6E6E6 có vân giấy),
 *       dành cho file thiết kế xuất ra không có kênh trong suốt.
 *  3. Gom các vùng liền kề (4 lân cận) thành từng thành phần.
 *  4. Bỏ vùng nhỏ hơn minAreaRatio diện tích ảnh và vùng chạm mép ảnh
 *     (nền bên ngoài viền). Với ô xám còn bỏ vùng lấp kém khung bao
 *     (< minFillRatio), tức các mảng xám lốm đốm của hoa văn.
 *  5. Quy đổi về toạ độ ảnh gốc và nới mỗi cạnh ~1 pixel quét (bleed) để ảnh chụp
 *     lấp kín dưới mép khung.
 */
function detectInScan(scan: ScanImage, mode: HoleDetectMode, options: DetectOptions = {}): HoleDetectResult {
  const { data, scanW, scanH, origW, origH, scale } = scan;
  const alphaThreshold = options.alphaThreshold ?? 30;
  const minAreaRatio = options.minAreaRatio ?? 0.005;
  const minFillRatio = options.minFillRatio ?? 0.6;
  const ph = { ...PLACEHOLDER_DEFAULTS, ...options.placeholder };

  const total = scanW * scanH;
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const hit =
      mode === 'transparent'
        ? data[o + 3] < alphaThreshold
        : isPlaceholderPixel(data[o], data[o + 1], data[o + 2], data[o + 3], ph);
    if (hit) mask[i] = 1;
  }

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const minPixels = total * minAreaRatio;
  const regions: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  let ignoredEdgeRegions = 0;

  for (let start = 0; start < total; start++) {
    if (!mask[start] || visited[start]) continue;
    visited[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let minX = scanW;
    let minY = scanH;
    let maxX = -1;
    let maxY = -1;
    let count = 0;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % scanW;
      const y = (idx - x) / scanW;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && mask[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        queue[tail++] = idx - 1;
      }
      if (x < scanW - 1 && mask[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && mask[idx - scanW] && !visited[idx - scanW]) {
        visited[idx - scanW] = 1;
        queue[tail++] = idx - scanW;
      }
      if (y < scanH - 1 && mask[idx + scanW] && !visited[idx + scanW]) {
        visited[idx + scanW] = 1;
        queue[tail++] = idx + scanW;
      }
    }

    if (count < minPixels) continue;
    if (mode === 'placeholder' && count / ((maxX - minX + 1) * (maxY - minY + 1)) < minFillRatio) continue;
    if (minX === 0 || minY === 0 || maxX === scanW - 1 || maxY === scanH - 1) {
      ignoredEdgeRegions++;
      continue;
    }
    regions.push({ minX, minY, maxX, maxY });
  }

  // Trên xuống dưới; cùng hàng (lệch < 8% chiều cao) thì trái sang phải
  regions.sort((a, b) =>
    Math.abs(a.minY - b.minY) < scanH * 0.08 ? a.minX - b.minX : a.minY - b.minY
  );

  const inv = 1 / scale;
  const bleed = Math.ceil(inv);
  const holes: DetectedHole[] = regions.map((r) => {
    const x = Math.max(0, Math.round(r.minX * inv) - bleed);
    const y = Math.max(0, Math.round(r.minY * inv) - bleed);
    const right = Math.min(origW, Math.round((r.maxX + 1) * inv) + bleed);
    const bottom = Math.min(origH, Math.round((r.maxY + 1) * inv) + bleed);
    return { x, y, w: right - x, h: bottom - y, rotation: 0 };
  });

  return { holes, imageWidth: origW, imageHeight: origH, ignoredEdgeRegions, mode };
}

/** Dò ô theo một kiểu cụ thể. Ảnh được giải mã một lần và dùng lại giữa các lần dò. */
export async function detectHoles(
  file: File | Blob,
  options: DetectOptions & { mode?: HoleDetectMode } = {}
): Promise<HoleDetectResult> {
  return detectInScan(await getScan(file), options.mode ?? 'transparent', options);
}

/**
 * Dò tự động: chạy cả hai kiểu trên cùng một lần giải mã ảnh và chọn kiểu tìm được
 * nhiều ô hơn (hoà thì ưu tiên trong suốt). Một ô trang trí trong suốt lẻ loi không
 * còn che mất các ô xám thật.
 */
export async function detectFrameHoles(file: File | Blob): Promise<AutoDetectResult> {
  const scan = await getScan(file);
  const transparent = detectInScan(scan, 'transparent');
  const placeholder = detectInScan(scan, 'placeholder');
  return placeholder.holes.length > transparent.holes.length
    ? { ...placeholder, alternativeCount: transparent.holes.length }
    : { ...transparent, alternativeCount: placeholder.holes.length };
}

/**
 * Đục lỗ: xoá (alpha = 0) phần xám giữ chỗ của từng ô, trả về PNG mới.
 *
 * Với mỗi ô (toạ độ theo pixel ảnh gốc, rotation theo độ quanh tâm ô):
 *  - Lấy mẫu màu xám ở vùng giữa ô (bỏ 25% mỗi cạnh) để biết màu thật của ô.
 *  - Loang (4 lân cận) từ các pixel mẫu đó, chỉ đi qua pixel xám giữ chỗ có màu
 *    gần màu mẫu và nằm trong hình chữ nhật đã xoay của ô.
 * Nhờ vậy viền/hoa văn màu xám nhạt nằm trong phần bleed nhưng không liền với ô,
 * hoặc khác sắc độ ô, được giữ nguyên; góc bo tròn và bóng đổ cũng không bị đục.
 */
export async function punchPlaceholderHoles(
  file: File,
  holes: { x: number; y: number; w: number; h: number; rotation?: number }[],
  options: PlaceholderOptions = {}
): Promise<{ file: File; clearedPixels: number }> {
  const ph = { ...PLACEHOLDER_DEFAULTS, ...options };
  const img = await loadImage(file);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas.');
  ctx.drawImage(img, 0, 0);

  let clearedPixels = 0;
  for (const hole of holes) {
    const rad = ((hole.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = hole.x + hole.w / 2;
    const cy = hole.y + hole.h / 2;
    const halfW = hole.w / 2;
    const halfH = hole.h / 2;

    // Khung bao của hình chữ nhật đã xoay
    const extX = Math.abs(halfW * cos) + Math.abs(halfH * sin);
    const extY = Math.abs(halfW * sin) + Math.abs(halfH * cos);
    const x0 = Math.max(0, Math.floor(cx - extX));
    const y0 = Math.max(0, Math.floor(cy - extY));
    const x1 = Math.min(W, Math.ceil(cx + extX));
    const y1 = Math.min(H, Math.ceil(cy + extY));
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw <= 0 || rh <= 0) continue;

    const region = ctx.getImageData(x0, y0, rw, rh);
    const d = region.data;
    const n = rw * rh;

    // Toạ độ cục bộ (u,v) của pixel trong hệ trục của ô (đã khử xoay)
    const local = (px: number, py: number) => {
      const dx = x0 + px + 0.5 - cx;
      const dy = y0 + py + 0.5 - cy;
      return { u: dx * cos + dy * sin, v: -dx * sin + dy * cos };
    };
    const inHole = (px: number, py: number) => {
      const { u, v } = local(px, py);
      return Math.abs(u) <= halfW && Math.abs(v) <= halfH;
    };

    // 1) Lấy mẫu màu ô ở vùng giữa
    const candidate = new Uint8Array(n);
    const seeds: number[] = [];
    let sum = 0;
    let sumSq = 0;
    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const i = py * rw + px;
        const o = i * 4;
        if (!isPlaceholderPixel(d[o], d[o + 1], d[o + 2], d[o + 3], ph) || !inHole(px, py)) continue;
        candidate[i] = 1;
        const { u, v } = local(px, py);
        if (Math.abs(u) <= halfW * 0.5 && Math.abs(v) <= halfH * 0.5) {
          seeds.push(i);
          const lum = (d[o] + d[o + 1] + d[o + 2]) / 3;
          sum += lum;
          sumSq += lum * lum;
        }
      }
    }
    if (seeds.length === 0) continue;

    // Độ sáng chấp nhận: trung bình ± max(3σ, 12) để giữ vân giấy nhưng loại viền khác sắc độ
    const mean = sum / seeds.length;
    const sigma = Math.sqrt(Math.max(0, sumSq / seeds.length - mean * mean));
    const lumTol = Math.max(12, sigma * 3);
    const accept = (i: number) => {
      if (!candidate[i]) return false;
      const o = i * 4;
      return Math.abs((d[o] + d[o + 1] + d[o + 2]) / 3 - mean) <= lumTol;
    };

    // 2) Loang từ vùng giữa
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    for (const s of seeds) {
      if (!visited[s] && accept(s)) {
        visited[s] = 1;
        queue[tail++] = s;
      }
    }
    while (head < tail) {
      const i = queue[head++];
      d[i * 4 + 3] = 0;
      clearedPixels++;
      const px = i % rw;
      const py = (i - px) / rw;
      if (px > 0 && !visited[i - 1] && accept(i - 1)) {
        visited[i - 1] = 1;
        queue[tail++] = i - 1;
      }
      if (px < rw - 1 && !visited[i + 1] && accept(i + 1)) {
        visited[i + 1] = 1;
        queue[tail++] = i + 1;
      }
      if (py > 0 && !visited[i - rw] && accept(i - rw)) {
        visited[i - rw] = 1;
        queue[tail++] = i - rw;
      }
      if (py < rh - 1 && !visited[i + rw] && accept(i + rw)) {
        visited[i + rw] = 1;
        queue[tail++] = i + rw;
      }
    }

    // 3) Lấp chấm sót: hạt vân giấy tối/sáng hơn ngưỡng nằm lọt giữa vùng đã đục sẽ thành
    //    chấm xám trên ảnh. Loang từ mép khung bao qua pixel chưa đục; pixel xám nào
    //    không tới được từ mép (bị vùng đục bao kín) thì đục nốt.
    const outside = new Uint8Array(n);
    head = 0;
    tail = 0;
    const pushOutside = (i: number) => {
      if (!outside[i] && !visited[i]) {
        outside[i] = 1;
        queue[tail++] = i;
      }
    };
    for (let px = 0; px < rw; px++) {
      pushOutside(px);
      pushOutside((rh - 1) * rw + px);
    }
    for (let py = 0; py < rh; py++) {
      pushOutside(py * rw);
      pushOutside(py * rw + rw - 1);
    }
    while (head < tail) {
      const i = queue[head++];
      const px = i % rw;
      const py = (i - px) / rw;
      if (px > 0) pushOutside(i - 1);
      if (px < rw - 1) pushOutside(i + 1);
      if (py > 0) pushOutside(i - rw);
      if (py < rh - 1) pushOutside(i + rw);
    }
    for (let i = 0; i < n; i++) {
      if (candidate[i] && !visited[i] && !outside[i]) {
        d[i * 4 + 3] = 0;
        clearedPixels++;
      }
    }
    ctx.putImageData(region, x0, y0);
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không xuất được PNG.'))), 'image/png')
  );
  const name = file.name.replace(/\.[^.]+$/, '') + '.png';
  return { file: new File([blob], name, { type: 'image/png' }), clearedPixels };
}

/** Đọc kích thước gốc của ảnh (File/Blob hoặc URL). */
export async function readImageSize(source: File | Blob | string): Promise<{ width: number; height: number }> {
  const img = await loadImage(source);
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}

function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl: string | null = null;
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể đọc file ảnh PNG.'));
    };
    if (typeof source === 'string') {
      if (!source.startsWith('blob:') && !source.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }
  });
}
