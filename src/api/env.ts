/**
 * API 层环境开关。
 * - VITE_USE_MOCK=true  → 使用本地 mock 实现
 * - VITE_USE_MOCK=false → 调用真实后端（默认）
 * - VITE_API_BASE_URL   → REST 基址，默认 /api（依赖 vite proxy）
 * - VITE_WS_BASE_URL    → WebSocket 基址，默认空（自动用当前 host）
 * - VITE_USER_ID/DEPT   → gateway 用 userID + dept 作身份，无 JWT
 * - VITE_DEFAULT_AGENT_ID → 默认 agentId（用于拼 sessionKey）
 */
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'false') === 'true';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
export const WS_BASE = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? '';

export const DEFAULT_USER_ID = (import.meta.env.VITE_USER_ID as string | undefined) ?? '林轩辉';
export const DEFAULT_USER_DEPT = (import.meta.env.VITE_USER_DEPT as string | undefined) ?? '质量管理部';
export const DEFAULT_AGENT_ID = (import.meta.env.VITE_DEFAULT_AGENT_ID as string | undefined) ?? 'main';
