import axios from 'axios';

export const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const DEFAULT_API_KEY =
  process.env.NEXT_PUBLIC_KIOSK_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTZhQCIsIm5hbWUiOiJKb2huIERvZSIsImFkbWluIjp0cnVlLCJpYXQiOjE1MTYyMzkwMjJ9.lnpJO1qhiMkRIFA6hm6gwZLqKl6nMyGNI4igASILP0Q';

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

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('hihibooth_api_key');
    if (saved) return saved.trim();
  }
  return DEFAULT_API_KEY;
}

export function setApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('hihibooth_api_key', key.trim());
  }
}

export const apiClient = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = getBaseApiUrl();
  config.headers['X-Api-Key'] = getApiKey();
  return config;
});
