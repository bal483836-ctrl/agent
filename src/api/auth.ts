import { USE_MOCK } from './env';
import { request, setToken, clearToken } from './http';
import type { CurrentUser } from '@/types';
import type { LoginRequest, LoginResponse } from './types';

export interface AuthApi {
  /** 邮箱密码登录 → 返回 JWT + 用户信息（内部已自动持久化 token） */
  login(req: LoginRequest): Promise<LoginResponse>;
  /** 获取当前用户（依赖已存的 JWT） */
  me(): Promise<CurrentUser>;
  /** 退出登录 */
  logout(): Promise<void>;
}

/* ---------- real ---------- */
const realApi: AuthApi = {
  async login(req) {
    const resp = await request<LoginResponse>('/auth/login', { method: 'POST', body: req });
    setToken(resp.token);
    return resp;
  },
  me: () => request<CurrentUser>('/auth/me'),
  async logout() {
    try { await request<void>('/auth/logout', { method: 'POST' }); }
    finally { clearToken(); }
  },
};

/* ---------- mock ---------- */
const mockUser: CurrentUser = {
  id: 'u-001',
  name: '张研究员',
  email: 'zhang.researcher@example.com',
  role: '主要研究员（PI）',
  organization: '协和疫苗研究中心',
  joinedAt: '2025-09-12',
};
const mockApi: AuthApi = {
  async login(req) {
    setToken('mock-jwt-token');
    return { token: 'mock-jwt-token', user: { ...mockUser, email: req.email || mockUser.email } };
  },
  me: async () => mockUser,
  async logout() { clearToken(); },
};

export const authApi: AuthApi = USE_MOCK ? mockApi : realApi;
