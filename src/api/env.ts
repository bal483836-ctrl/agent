/**
 * API 层环境开关。
 * - VITE_USE_MOCK=true  → 使用本地 mock 实现（默认，不连后端）
 * - VITE_USE_MOCK=false → 调用真实后端
 * - VITE_API_BASE_URL   → REST 基址，默认 /api（依赖 vite proxy）
 * - VITE_WS_BASE_URL    → WebSocket 基址，默认空（自动用当前 host）
 */
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
export const WS_BASE = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? '';
