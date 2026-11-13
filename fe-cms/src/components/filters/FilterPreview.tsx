import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BlendMode,
  CssFilterValues,
  CubeLut,
  applyCubeLut,
  cssFilterString,
  parseCubeLut,
} from '../../utils/filterConfig';

/** Ảnh chân dung mẫu dùng cho mọi preview bộ lọc. */
export const SAMPLE_IMAGE_URL =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';

const CANVAS_W = 320;
const CANVAS_H = 400;

/** Cách một bộ lọc tác động lên ảnh mẫu. */
export type FilterLook =
  | { kind: 'none' }
  | { kind: 'css'; css: CssFilterValues }
  | { kind: 'texture'; src: string; opacity: number; blendMode: BlendMode }
  /** `lut` đã parse sẵn (file vừa chọn) hoặc `src` là URL file .cube cần tải về */
  | { kind: 'cube'; lut?: CubeLut | null; src?: string; opacity: number };

// Cache theo module: ảnh mẫu và các LUT đã tải, dùng chung cho mọi thẻ trên trang
let samplePromise: Promise<HTMLImageElement> | null = null;
const lutCache = new Map<string, Promise<CubeLut>>();

function loadSampleImage(): Promise<HTMLImageElement> {
  if (!samplePromise) {
    samplePromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Không tải được ảnh mẫu'));
      img.src = SAMPLE_IMAGE_URL;
    });
    samplePromise.catch(() => {
      samplePromise = null;
    });
  }
  return samplePromise;
}

function loadCubeLut(url: string): Promise<CubeLut> {
  let cached = lutCache.get(url);
  if (!cached) {
    cached = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(parseCubeLut);
    cached.catch(() => lutCache.delete(url));
    lutCache.set(url, cached);
  }
  return cached;
}

const CubeCanvas: React.FC<{ lut?: CubeLut | null; src?: string; opacity: number }> = ({
  lut,
  src,
  opacity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const lutPromise = lut ? Promise.resolve(lut) : src ? loadCubeLut(src) : null;
    if (!lutPromise) {
      setFailed(true);
      return;
    }

    Promise.all([loadSampleImage(), lutPromise])
      .then(([img, resolvedLut]) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas 2D không khả dụng');

        // Vẽ kiểu object-fit: cover
        const scale = Math.max(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh);

        const frame = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
        applyCubeLut(frame, resolvedLut, opacity / 100);
        ctx.putImageData(frame, 0, 0);
      })
      .catch((err) => {
        console.warn('Không dựng được preview LUT:', err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lut, src, opacity]);

  if (failed) {
    return (
      <>
        <img src={SAMPLE_IMAGE_URL} alt="" />
        <span
          className="filter-compare-label"
          style={{ top: '50%', bottom: 'auto', left: '50%', transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap' }}
        >
          Không xem trước được LUT
        </span>
      </>
    );
  }
  return <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />;
};

/** Ảnh mẫu đã áp bộ lọc; lấp đầy phần tử cha (cha quyết định kích thước). */
export const FilterPreview: React.FC<{ look: FilterLook; alt?: string }> = ({ look, alt = '' }) => {
  return (
    <div className="filter-preview" style={{ isolation: 'isolate' }}>
      {look.kind === 'cube' ? (
        <CubeCanvas lut={look.lut} src={look.src} opacity={look.opacity} />
      ) : (
        <img
          src={SAMPLE_IMAGE_URL}
          alt={alt}
          style={look.kind === 'css' ? { filter: cssFilterString(look.css) } : undefined}
        />
      )}
      {look.kind === 'texture' && look.src && (
        <img
          src={look.src}
          alt=""
          style={{ mixBlendMode: look.blendMode, opacity: look.opacity / 100 }}
        />
      )}
    </div>
  );
};

/** So sánh Trước/Sau: kéo vạch chia (hoặc dùng phím mũi tên) để lộ ảnh gốc bên trái. */
export const FilterCompare: React.FC<{ look: FilterLook }> = ({ look }) => {
  const [split, setSplit] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  return (
    <div
      ref={containerRef}
      className="filter-compare"
      role="slider"
      tabIndex={0}
      aria-label="Vạch so sánh trước và sau khi áp bộ lọc"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(split)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) updateFromClientX(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - 5));
        else if (e.key === 'ArrowRight') setSplit((s) => Math.min(100, s + 5));
        else return;
        e.preventDefault();
      }}
    >
      <div className="filter-compare-layer">
        <FilterPreview look={{ kind: 'none' }} alt="Ảnh gốc" />
      </div>
      <div className="filter-compare-layer" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        <FilterPreview look={look} alt="Ảnh sau khi áp bộ lọc" />
      </div>
      <div className="filter-compare-handle" style={{ left: `${split}%` }} />
      <span className="filter-compare-label" style={{ left: 8 }}>
        Trước
      </span>
      <span className="filter-compare-label" style={{ right: 8 }}>
        Sau
      </span>
    </div>
  );
};

export default FilterPreview;
