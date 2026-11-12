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
 * Tự động phát hiện các vùng trong suốt (Transparent Holes) từ file PNG viền khung
 * Thuật toán quét pixel Alpha < alphaThreshold và gom vùng bounding box (tương tự Tool_Create_Frame)
 */
export async function detectTransparentHoles(
  file: File,
  options: {
    alphaThreshold?: number;
    minAreaRatio?: number; // Tỉ lệ diện tích tối thiểu so với toàn ảnh (vd 0.01 = 1%)
  } = {}
): Promise<{ holes: DetectedHole[]; imageWidth: number; imageHeight: number }> {
  const alphaThreshold = options.alphaThreshold ?? 20; // 0..255 (trong suốt)
  const minAreaRatio = options.minAreaRatio ?? 0.015; // Tối thiểu 1.5% diện tích ảnh

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      if (!origW || !origH) {
        return resolve({ holes: [], imageWidth: origW, imageHeight: origH });
      }

      // Giảm độ phân giải xuống để scan siêu tốc trong browser (tỉ lệ scale s)
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(origW, origH));
      const scanW = Math.round(origW * scale);
      const scanH = Math.round(origH * scale);

      const canvas = document.createElement('canvas');
      canvas.width = scanW;
      canvas.height = scanH;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return resolve({ holes: [], imageWidth: origW, imageHeight: origH });
      }

      ctx.drawImage(img, 0, 0, scanW, scanH);
      const imgData = ctx.getImageData(0, 0, scanW, scanH);
      const data = imgData.data;

      // Tạo mặt nạ nhị phân: 1 nếu trong suốt (alpha < threshold), 0 nếu là viền khung
      const isTransparent = new Uint8Array(scanW * scanH);
      for (let i = 0; i < scanW * scanH; i++) {
        const alpha = data[i * 4 + 3];
        if (alpha <= alphaThreshold) {
          isTransparent[i] = 1;
        }
      }

      const visited = new Uint8Array(scanW * scanH);
      const rawRects: { minX: number; minY: number; maxX: number; maxY: number; count: number }[] = [];
      const minPixels = Math.round(scanW * scanH * minAreaRatio);

      // Connected Component BFS
      const queueX = new Int32Array(scanW * scanH);
      const queueY = new Int32Array(scanW * scanH);

      for (let y = 0; y < scanH; y++) {
        for (let x = 0; x < scanW; x++) {
          const idx = y * scanW + x;
          if (isTransparent[idx] === 1 && visited[idx] === 0) {
            visited[idx] = 1;
            let head = 0;
            let tail = 0;
            queueX[tail] = x;
            queueY[tail] = y;
            tail++;

            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let pixelCount = 0;

            while (head < tail) {
              const curX = queueX[head];
              const curY = queueY[head];
              head++;
              pixelCount++;

              if (curX < minX) minX = curX;
              if (curX > maxX) maxX = curX;
              if (curY < minY) minY = curY;
              if (curY > maxY) maxY = curY;

              // 4 lân cận
              const neighbors = [
                [curX + 1, curY],
                [curX - 1, curY],
                [curX, curY + 1],
                [curX, curY - 1],
              ];

              for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < scanW && ny >= 0 && ny < scanH) {
                  const nIdx = ny * scanW + nx;
                  if (isTransparent[nIdx] === 1 && visited[nIdx] === 0) {
                    visited[nIdx] = 1;
                    queueX[tail] = nx;
                    queueY[tail] = ny;
                    tail++;
                  }
                }
              }
            }

            if (pixelCount >= minPixels) {
              rawRects.push({ minX, minY, maxX, maxY, count: pixelCount });
            }
          }
        }
      }

      // Sắp xếp các ô từ trên xuống dưới, từ trái sang phải
      rawRects.sort((a, b) => {
        const rowDiff = Math.abs(a.minY - b.minY);
        // Nếu cùng 1 hàng (chênh lệch Y nhỏ hơn 10% chiều cao)
        if (rowDiff < scanH * 0.08) {
          return a.minX - b.minX;
        }
        return a.minY - b.minY;
      });

      // Quy đổi tọa độ về kích thước ảnh gốc
      const invScale = 1 / scale;
      const detectedHoles: DetectedHole[] = rawRects.map((r) => {
        const x = Math.round(r.minX * invScale);
        const y = Math.round(r.minY * invScale);
        const w = Math.round((r.maxX - r.minX + 1) * invScale);
        const h = Math.round((r.maxY - r.minY + 1) * invScale);
        return { x, y, w, h, rotation: 0 };
      });

      resolve({
        holes: detectedHoles,
        imageWidth: origW,
        imageHeight: origH,
      });
    };

    img.onerror = (err) => reject(new Error('Không thể đọc file ảnh PNG: ' + err));
    img.src = url;
  });
}
