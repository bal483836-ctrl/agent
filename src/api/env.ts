/**
 * API 层环境开关。
 *
 * BACKEND_MODE 优先级：
 *   1. localStorage 'qc_backend_mode'（运行时切换，最高优先级）
 *   2. 环境变量 VITE_BACKEND_MODE
 *   3. 兼容旧的 VITE_USE_MOCK：true → mock，false → external
 *   4. 默认 external（这是接同事 OpenClaw 后端的分支）
 */
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'false') !== 'false';

function readModeOverride(): 'mock' | 'local' | 'external' | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage?.getItem('qc_backend_mode');
  if (v === 'mock' || v === 'local' || v === 'external') return v;
  return null;
}

export const BACKEND_MODE: 'mock' | 'local' | 'external' =
  readModeOverride()
  ?? (import.meta.env.VITE_BACKEND_MODE as any)
  ?? (USE_MOCK ? 'mock' : 'external');

export function setBackendModeAndReload(mode: 'mock' | 'local' | 'external') {
  localStorage.setItem('qc_backend_mode', mode);
  window.location.reload();
}

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
export const WS_BASE = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? '';

/* ===== external 模式专用 ===== */
export const EXTERNAL_API_BASE =
  (import.meta.env.VITE_EXTERNAL_API_BASE as string | undefined)
  ?? '/ext';
export const EXTERNAL_USER_ID =
  (import.meta.env.VITE_EXTERNAL_USER_ID as string | undefined) ?? '林轩辉';
export const EXTERNAL_USER_DEPT =
  (import.meta.env.VITE_EXTERNAL_USER_DEPT as string | undefined) ?? '质量管理部';

if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.info(
    `[QC] BACKEND_MODE=${BACKEND_MODE}`,
    BACKEND_MODE === 'external'
      ? { base: EXTERNAL_API_BASE, user: EXTERNAL_USER_ID, dept: EXTERNAL_USER_DEPT }
      : { base: API_BASE },
  );
}



