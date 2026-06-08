/**
 * API 层环境开关。
 *
 * BACKEND_MODE：
 *   - mock     完全离线（默认演示）
 *   - local    我原本的 backend/ Fastify 服务
 *   - external 同事的 OpenClaw 后端（VITE_EXTERNAL_API_BASE）
 */
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

export const BACKEND_MODE = (import.meta.env.VITE_BACKEND_MODE
  ?? (USE_MOCK ? 'mock' : 'local')) as 'mock' | 'local' | 'external';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
export const WS_BASE = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? '';

/* ===== external 模式专用 ===== */
export const EXTERNAL_API_BASE =
  (import.meta.env.VITE_EXTERNAL_API_BASE as string | undefined)
  ?? '/ext';   // dev 模式由 vite proxy 转发到真后端
export const EXTERNAL_USER_ID =
  (import.meta.env.VITE_EXTERNAL_USER_ID as string | undefined) ?? '林轩辉';
export const EXTERNAL_USER_DEPT =
  (import.meta.env.VITE_EXTERNAL_USER_DEPT as string | undefined) ?? '质量管理部';

