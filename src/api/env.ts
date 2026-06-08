/**
 * API 层环境开关。
 *
 * BACKEND_MODE：
 *   - mock     完全离线（演示）
 *   - local    我原本的 backend/ Fastify 服务
 *   - external 同事的 OpenClaw 后端（VITE_EXTERNAL_API_BASE）
 *
 * 本分支默认 external —— 这是接同事 OpenClaw 后端的专用分支。
 */
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'false') !== 'false';

export const BACKEND_MODE = (import.meta.env.VITE_BACKEND_MODE
  ?? (USE_MOCK ? 'mock' : 'external')) as 'mock' | 'local' | 'external';

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

// 启动日志，方便在控制台一眼看出当前模式 + 命中的环境变量
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.info(
    `[QC] BACKEND_MODE=${BACKEND_MODE}`,
    BACKEND_MODE === 'external'
      ? { base: EXTERNAL_API_BASE, user: EXTERNAL_USER_ID, dept: EXTERNAL_USER_DEPT }
      : { base: API_BASE },
  );
}


