import { apiClient, getBaseApiUrl } from './client';

export interface PhotoFilter {
  id: number;
  code: string;
  name: string;
  category: string;
  type: 'LUT' | 'Preset';
  lutUrl?: string;
  thumbnailUrl?: string;
  intensityDefault: number;
  configJson?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

export async function getFilters(params?: {
  category?: string;
  onlyActive?: boolean;
}): Promise<PhotoFilter[]> {
  const res = await apiClient.get<PhotoFilter[]>('/api/presets', { params });
  return res.data;
}

export async function createFilter(formData: FormData): Promise<PhotoFilter> {
  const res = await apiClient.post<PhotoFilter>('/api/presets', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function updateFilter(id: number, formData: FormData): Promise<PhotoFilter> {
  const res = await apiClient.put<PhotoFilter>(`/api/presets/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteFilter(id: number): Promise<void> {
  await apiClient.delete(`/api/presets/${id}`);
}

export function resolveAssetUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = getBaseApiUrl();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
