import axios, { AxiosRequestConfig } from 'axios';

export const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const TOKEN_STORAGE_KEY = 'hihibooth_access_token';
export const USER_STORAGE_KEY = 'hihibooth_user';

export function getBaseApiUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('hihibooth_api_url');
    if (saved) return saved.trim().replace(/\/+$/, '');
  }
  return DEFAULT_API_URL.replace(/\/+$/, '');
}

export function setBaseApiUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('hihibooth_api_url', url.trim().replace(/\/+$/, ''));
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

export function removeAccessToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

export const apiClient = axios.create({
  timeout: 15000,
  withCredentials: true, // Send and receive HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = getBaseApiUrl();
  const token = getAccessToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Refresh token concurrency management
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Ignore 401 if it's already an auth handshake request (to prevent infinite loops)
    const url = originalRequest?.url || '';
    const isAuthEndpoint =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/refresh-token') ||
      url.includes('/api/auth/logout');

    if (error.response?.status === 401 && !isAuthEndpoint && originalRequest) {
      if (originalRequest._retry) {
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          removeAccessToken();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            if (originalRequest.headers) {
              originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshUrl = `${getBaseApiUrl()}/api/auth/refresh-token`;
        const res = await axios.post<{ accessToken: string }>(
          refreshUrl,
          {},
          {
            withCredentials: true, // HttpOnly cookie is automatically attached
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        const newAccessToken = res.data.accessToken;
        setAccessToken(newAccessToken);
        processQueue(null, newAccessToken);

        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        removeAccessToken();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
