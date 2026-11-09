import { apiClient } from './client';

export interface UserDto {
  id: number;
  username: string;
  fullName: string;
  role: string;
  email?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserDto;
  refreshToken?: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user?: UserDto;
  refreshToken?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export async function loginApi(req: LoginRequest): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/api/auth/login', req);
  return res.data;
}

export async function refreshTokenApi(): Promise<RefreshTokenResponse> {
  const res = await apiClient.post<RefreshTokenResponse>('/api/auth/refresh-token', {});
  return res.data;
}

export async function logoutApi(): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post<{ success: boolean; message: string }>('/api/auth/logout', {});
  return res.data;
}

export async function getMeApi(): Promise<UserDto> {
  const res = await apiClient.get<UserDto>('/api/auth/me');
  return res.data;
}
