import { USE_MOCK, DEFAULT_USER_ID, DEFAULT_USER_DEPT } from './env';
import { request, setToken, clearToken, setUserID, setUserDept, getUserID, getUserDept } from './http';
import type { CurrentUser } from '@/types';
import type { LoginRequest, LoginResponse } from './types';

export interface AuthApi {
  /** 登录 → 在 gateway 端 connect 注册，并把 userID/dept 持久化 */
  login(req: LoginRequest): Promise<LoginResponse>;
  /** 获取当前用户（从本地缓存重建，gateway 无 /me 接口） */
  me(): Promise<CurrentUser>;
  /** 退出登录（本地清理） */
  logout(): Promise<void>;
}

/**
 * 适配 gateway：
 *   - email 字段被复用为 userID（前端登录表单可直接填工号/姓名）
 *   - password 不参与校验（gateway 无密码体系）
 *   - 空 email 时使用 VITE_USER_ID 默认值
 * 登录会调用 POST /api/connect 把用户接入 gateway。
 */
const realApi: AuthApi = {
  async login(req) {
    const userID = (req.email || '').trim() || DEFAULT_USER_ID;
    const dept = DEFAULT_USER_DEPT;
    // gateway 没有 /auth/login，用 /connect 当作"登入"动作
    try {
      await request<unknown>('/connect', { method: 'POST', body: { userID, dept } });
    } catch (e) {
      // connect 失败不阻塞前端落地：本地仍可保留身份继续尝试
      console.warn('gateway /connect failed', e);
    }
    setUserID(userID);
    setUserDept(dept);
    // 给一个占位 token，让前端的"已登录"判定通过
    const token = `gw:${encodeURIComponent(userID)}`;
    setToken(token);
    return {
      token,
      user: buildUser(userID, dept),
    };
  },
  async me() {
    const userID = getUserID();
    if (!userID) throw new Error('not logged in');
    return buildUser(userID, getUserDept() ?? DEFAULT_USER_DEPT);
  },
  async logout() { clearToken(); },
};

function buildUser(userID: string, dept: string): CurrentUser {
  return {
    id: userID,
    name: userID,
    email: '',
    role: '研究员',
    organization: dept,
    joinedAt: new Date().toISOString().slice(0, 10),
  };
}

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
