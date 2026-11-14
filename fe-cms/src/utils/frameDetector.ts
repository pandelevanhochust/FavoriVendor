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

/**
 * Tự động phát hiện các ô trong suốt (holes) từ file PNG viền khung.
 *
 * Thuật toán (đối chiếu frameHoleDetector của HiHiBooth):
 *  1. Thu nhỏ ảnh về cạnh dài tối đa 800px để quét nhanh.
 *  2. Pixel có alpha < alphaThreshold được coi là trong suốt.
 *  3. Gom các vùng trong suốt liền kề (4 lân cận) thành từng thành phần.
 *  4. Bỏ vùng nhỏ hơn minAreaRatio diện tích ảnh và vùng chạm mép ảnh
 *     (đó là nền trong suốt bên ngoài viền, không phải ô ảnh).
 *  5. Quy đổi về toạ độ ảnh gốc và nới mỗi cạnh thêm ~1 pixel quét (bleed) để ảnh chụp
 *     lấp kín dưới mép khung, không hở viền trắng do làm tròn khi thu nhỏ.
 */
export async function detectTransparentHoles(
  file: File | Blob,
  options: {
    alphaThreshold?: number;
    /** Tỉ lệ diện tích tối thiểu so với toàn ảnh (0.005 = 0.5%) */
    minAreaRatio?: number;
    /** Cạnh dài tối đa khi quét */
    maxScanSize?: number;
  } = {}
): Promise<{ holes: DetectedHole[]; imageWidth: number; imageHeight: number; ignoredEdgeRegions: number }> {
  const alphaThreshold = options.alphaThreshold ?? 30;
  const minAreaRatio = options.minAreaRatio ?? 0.005;
  const maxScanSize = options.maxScanSize ?? 800;

  const img = await loadImage(file);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  if (!origW || !origH) return { holes: [], imageWidth: origW, imageHeight: origH, ignoredEdgeRegions: 0 };

  const scale = Math.min(1, maxScanSize / Math.max(origW, origH));
  const scanW = Math.max(1, Math.round(origW * scale));
  const scanH = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = scanW;
  canvas.height = scanH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { holes: [], imageWidth: origW, imageHeight: origH, ignoredEdgeRegions: 0 };
  ctx.clearRect(0, 0, scanW, scanH);
  ctx.drawImage(img, 0, 0, scanW, scanH);
  const data = ctx.getImageData(0, 0, scanW, scanH).data;

  const total = scanW * scanH;
  const transparent = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] < alphaThreshold) transparent[i] = 1;
  }

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const minPixels = total * minAreaRatio;
  const regions: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  let ignoredEdgeRegions = 0;

  for (let start = 0; start < total; start++) {
    if (!transparent[start] || visited[start]) continue;
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

      if (x > 0 && transparent[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        queue[tail++] = idx - 1;
      }
      if (x < scanW - 1 && transparent[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        queue[tail++] = idx + 1;
      }
      if (y > 0 && transparent[idx - scanW] && !visited[idx - scanW]) {
        visited[idx - scanW] = 1;
        queue[tail++] = idx - scanW;
      }
      if (y < scanH - 1 && transparent[idx + scanW] && !visited[idx + scanW]) {
        visited[idx + scanW] = 1;
        queue[tail++] = idx + scanW;
      }
    }

    if (count < minPixels) continue;
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

  return { holes, imageWidth: origW, imageHeight: origH, ignoredEdgeRegions };
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
