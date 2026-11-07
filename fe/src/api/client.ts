// API Client for VietQR Kiosk Backend (Orders & Transactions)

export interface ApiResponse<T> {
  data: T | null;
  totalCount: number;
  page: number;
  limit: number;
  error?: string;
  status: number;
}

export const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://favorivendor.onrender.com';
export const DEFAULT_RENDER_URL = 'https://favorivendor.onrender.com';
export const DEFAULT_LOCAL_URL = 'http://localhost:5000';

// Render production key (matches Kiosk__ApiKey on Render & local.properties)
export const DEFAULT_API_KEY =
  process.env.NEXT_PUBLIC_KIOSK_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTZhQCIsIm5hbWUiOiJKb2huIERvZSIsImFkbWluIjp0cnVlLCJpYXQiOjE1MTYyMzkwMjJ9.lnpJO1qhiMkRIFA6hm6gwZLqKl6nMyGNI4igASILP0Q';

// Fallback key (from server/appsettings.json)
export const FALLBACK_API_KEY =
  '3X0YiESk4Pi0Nmsc3MCq0BG66DCcdBul4LwjeuxRKnddVbcR';

export function getBaseApiUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('favori_api_url');
    if (saved) return saved.trim().replace(/\/+$/, '');
  }
  return DEFAULT_API_URL.replace(/\/+$/, '');
}

export function setBaseApiUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('favori_api_url', url.trim().replace(/\/+$/, ''));
  }
}

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('favori_api_key');
    // If the saved key is the old 3X0Yi... key that triggered 401 on Render, auto-migrate to working key
    if (saved && saved.trim() !== FALLBACK_API_KEY) {
      return saved.trim();
    }
  }
  return DEFAULT_API_KEY;
}

export function setApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('favori_api_key', key.trim());
  }
}

async function executeFetch(
  url: string,
  method: 'GET' | 'POST',
  apiKey: string,
  body?: any
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const apiClient = {
  get: async <T>(
    endpoint: string,
    params?: Record<string, string | number | undefined>
  ): Promise<ApiResponse<T>> => {
    const baseUrl = getBaseApiUrl();
    let currentKey = getApiKey();

    const url = new URL(`${baseUrl}/${endpoint.replace(/^\/+/, '')}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }

    try {
      let res = await executeFetch(url.toString(), 'GET', currentKey);

      // Auto-healing: If 401 Unauthorized, retry with fallback key
      if (res.status === 401) {
        const altKey =
          currentKey === DEFAULT_API_KEY ? FALLBACK_API_KEY : DEFAULT_API_KEY;
        const retryRes = await executeFetch(url.toString(), 'GET', altKey);
        if (retryRes.status !== 401) {
          res = retryRes;
          currentKey = altKey;
          setApiKey(altKey);
        }
      }

      const totalCount = parseInt(res.headers.get('X-Total-Count') || '0', 10);
      const page = parseInt(res.headers.get('X-Page') || '1', 10);
      const limit = parseInt(res.headers.get('X-Limit') || '50', 10);

      if (!res.ok) {
        const errorText = await res.text();
        return {
          data: null,
          totalCount: 0,
          page: 1,
          limit: 50,
          error: `Lỗi máy chủ (${res.status}): ${errorText || res.statusText}`,
          status: res.status,
        };
      }

      const data: T = await res.json();
      return {
        data,
        totalCount: totalCount || (Array.isArray(data) ? data.length : 0),
        page,
        limit,
        status: res.status,
      };
    } catch (err: any) {
      return {
        data: null,
        totalCount: 0,
        page: 1,
        limit: 50,
        error: `Không thể kết nối đến máy chủ (${baseUrl}): ${err.message || 'Network error'}.`,
        status: 0,
      };
    }
  },

  post: async <T>(endpoint: string, body?: any): Promise<ApiResponse<T>> => {
    const baseUrl = getBaseApiUrl();
    let currentKey = getApiKey();
    const fullUrl = `${baseUrl}/${endpoint.replace(/^\/+/, '')}`;

    try {
      let res = await executeFetch(fullUrl, 'POST', currentKey, body);

      if (res.status === 401) {
        const altKey =
          currentKey === DEFAULT_API_KEY ? FALLBACK_API_KEY : DEFAULT_API_KEY;
        const retryRes = await executeFetch(fullUrl, 'POST', altKey, body);
        if (retryRes.status !== 401) {
          res = retryRes;
          currentKey = altKey;
          setApiKey(altKey);
        }
      }

      if (!res.ok) {
        const errorText = await res.text();
        return {
          data: null,
          totalCount: 0,
          page: 1,
          limit: 50,
          error: `Lỗi (${res.status}): ${errorText || res.statusText}`,
          status: res.status,
        };
      }

      const data: T = await res.json();
      return {
        data,
        totalCount: 1,
        page: 1,
        limit: 50,
        status: res.status,
      };
    } catch (err: any) {
      return {
        data: null,
        totalCount: 0,
        page: 1,
        limit: 50,
        error: `Không thể kết nối máy chủ: ${err.message}`,
        status: 0,
      };
    }
  },
};
