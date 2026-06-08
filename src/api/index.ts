/**
 * API 层统一出口。
 * 业务代码（store / 组件）一律通过此处的 `api.*` 访问后端能力，
 * 不要直接 import 各资源模块，便于将来加全局拦截/缓存。
 */
import { authApi } from './auth';
import { sessionsApi } from './sessions';
import { messagesApi } from './messages';
import { skillsApi } from './skills';
import { workspacesApi } from './workspaces';
import { filesApi, UPLOAD_LIMITS } from './files';
import { runsApi } from './runs';

export const api = {
  auth: authApi,
  sessions: sessionsApi,
  messages: messagesApi,
  skills: skillsApi,
  workspaces: workspacesApi,
  files: filesApi,
  runs: runsApi,
};

export { UPLOAD_LIMITS };
export * from './types';
export { ApiError, setUnauthorizedHandler, getToken, setToken, clearToken } from './http';
export { USE_MOCK, API_BASE, WS_BASE, BACKEND_MODE, EXTERNAL_API_BASE } from './env';
