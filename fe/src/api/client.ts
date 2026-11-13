// API Client for VietQR Kiosk Backend (Orders & Transactions)

export interface ApiResponse<T> {
  data: T | null;
  totalCount: number;
  page: number;
  limit: number;
  error?: string;
  status: number;
}

export const DEFAULT_API_URL = 'http://localhost:5000';
export const DEFAULT_RENDER_URL = 'https://favorivendor.onrender.com';
export const DEFAULT_LOCAL_URL = 'http://localhost:5000';

export const TOKEN_STORAGE_KEY = 'favori_access_token';
export const DEFAULT_API_KEY = 'Bearer_JWT_Auth';
export const FALLBACK_API_KEY = 'Bearer_JWT_Auth';

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

export function getAccessToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  return null;
}

export function setAccessToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

// Backward compatibility stubs
export function getApiKey(): string {
  return getAccessToken() || DEFAULT_API_KEY;
}

export function setApiKey(key: string): void {
  if (key && key !== DEFAULT_API_KEY && key !== FALLBACK_API_KEY) {
    setAccessToken(key);
  }
}

export async function loginApi(username = 'admin', password = 'admin'): Promise<{ accessToken: string } | null> {
  const baseUrl = getBaseApiUrl();
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.accessToken) {
        setAccessToken(data.accessToken);
        return data;
      }
    }
  } catch (e) {
    console.warn('Auto-login failed:', e);
  }
  return null;
}

async function executeFetch(
  url: string,
  method: 'GET' | 'POST',
  body?: any
): Promise<Response> {
  let token = getAccessToken();
  if (!token) {
    const loginRes = await loginApi('admin', 'admin');
    if (loginRes) token = loginRes.accessToken;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If 401 Unauthorized, refresh token via login and retry once
  if (res.status === 401) {
    const freshLogin = await loginApi('admin', 'admin');
    if (freshLogin && freshLogin.accessToken) {
      headers['Authorization'] = `Bearer ${freshLogin.accessToken}`;
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  return res;
}

export const apiClient = {
  get: async <T>(
    endpoint: string,
    params?: Record<string, string | number | undefined>
  ): Promise<ApiResponse<T>> => {
    const baseUrl = getBaseApiUrl();
    const url = new URL(`${baseUrl}/${endpoint.replace(/^\/+/, '')}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }

    try {
      const res = await executeFetch(url.toString(), 'GET');

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
    const fullUrl = `${baseUrl}/${endpoint.replace(/^\/+/, '')}`;

    try {
      const res = await executeFetch(fullUrl, 'POST', body);

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
