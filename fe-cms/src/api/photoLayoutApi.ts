import { apiClient, getBaseApiUrl } from './client';

export interface PricingTier {
  quantity: number;
  price: number;
}

export interface HoleRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface PhotoLayout {
  id: string; // "1x4", "2x2", etc.
  name: string;
  slug: string;
  widthPx: number;
  heightPx: number;
  holeCount: number;
  description?: string;
  isActive: boolean;
  displayOrder: number;
  pricingTiers: PricingTier[];
  frameCount?: number;
  /** Số lần bấm máy (shots). Server trả về holeCount nếu chưa cấu hình. */
  captureCount?: number;
  /** In 2 dải trên một tờ và cắt đôi. */
  isSplit?: boolean;
  /** Tự tính số shots theo số lỗ của frame khách chọn. */
  useHolesAutoCapture?: boolean;
  /** "preset:<key>" (mẫu dựng sẵn) hoặc URL ảnh preview đã tải lên. Chuỗi rỗng = xoá. */
  previewUrl?: string | null;
}

export type LayoutPayload = Omit<PhotoLayout, 'slug' | 'frameCount'> & { slug?: string };

export interface PhotoCategory {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  frameCount?: number;
}

export interface PhotoFrame {
  id: number;
  layoutId: string;
  layoutName?: string;
  categoryId?: number;
  categoryName?: string;
  name: string;
  frameUrl: string;
  thumbnailUrl?: string;
  holes: HoleRect[];
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

// Layouts API
export async function getLayouts(onlyActive = false): Promise<PhotoLayout[]> {
  const res = await apiClient.get<PhotoLayout[]>('/api/layouts', {
    params: { onlyActive },
  });
  return res.data;
}

export async function createLayout(data: LayoutPayload): Promise<PhotoLayout> {
  const res = await apiClient.post<PhotoLayout>('/api/layouts', data);
  return res.data;
}

export async function updateLayout(
  id: string,
  data: Partial<PhotoLayout>
): Promise<PhotoLayout> {
  const res = await apiClient.put<PhotoLayout>(`/api/layouts/${encodeURIComponent(id)}`, data);
  return res.data;
}

export async function uploadLayoutPreview(id: string, file: File): Promise<PhotoLayout> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post<PhotoLayout>(
    `/api/layouts/${encodeURIComponent(id)}/preview`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data;
}

export async function deleteLayout(id: string): Promise<void> {
  await apiClient.delete(`/api/layouts/${encodeURIComponent(id)}`);
}

// Categories API
export async function getCategories(onlyActive = false): Promise<PhotoCategory[]> {
  const res = await apiClient.get<PhotoCategory[]>('/api/categories', {
    params: { onlyActive },
  });
  return res.data;
}

export async function createCategory(data: {
  name: string;
  slug?: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
}): Promise<PhotoCategory> {
  const res = await apiClient.post<PhotoCategory>('/api/categories', data);
  return res.data;
}

export async function updateCategory(
  id: number,
  data: Partial<PhotoCategory>
): Promise<PhotoCategory> {
  const res = await apiClient.put<PhotoCategory>(`/api/categories/${id}`, data);
  return res.data;
}

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/api/categories/${id}`);
}

// Frames API
export async function getFrames(params?: {
  layoutId?: string;
  categoryId?: number;
  onlyActive?: boolean;
}): Promise<PhotoFrame[]> {
  const res = await apiClient.get<PhotoFrame[]>('/api/frames', { params });
  return res.data;
}

export async function createFrame(formData: FormData): Promise<PhotoFrame> {
  const res = await apiClient.post<PhotoFrame>('/api/frames', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function updateFrame(id: number, formData: FormData): Promise<PhotoFrame> {
  const res = await apiClient.put<PhotoFrame>(`/api/frames/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteFrame(id: number): Promise<void> {
  await apiClient.delete(`/api/frames/${id}`);
}

/**
 * Trả về absolute URL nếu file lưu cục bộ (/uploads/...)
 */
export function resolveAssetUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = getBaseApiUrl();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
