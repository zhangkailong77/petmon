// services/authService.ts
const API_BASE_URL = 'http://192.168.31.85:4000/api'; // 根据你的实际配置调整

export interface User {
  id: number;
  email: string;
  nickname: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const sendVerificationCode = async (email: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error('Failed to send code');
};

export const register = async (email: string, password: string, code: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, code }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }
  return response.json();
};

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error('Invalid credentials');
  }
  return response.json();
};