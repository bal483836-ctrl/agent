import type { TokenUsage } from '@/types';

/** 登录请求 / 响应 */
export interface LoginRequest { email: string; password: string }
export interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    organization: string;
    joinedAt: string;
  };
}

/* ===== 消息流式事件（SSE） ===== */
/**
 * 前端 SSE 解析后会把每条事件转成 `MessageStreamEvent`，
 * 由 store 自行根据 type 累加 delta 或落库。
 */
export type MessageStreamEvent =
  | { type: 'text-delta'; chunk: string }
  | { type: 'tool-call'; toolCallId: string; skillName: string; payload: unknown }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'done'; messageId: string }
  | { type: 'error'; reason: string };

/* ===== 技能执行 WebSocket 事件 ===== */
export type RunStreamEvent =
  | { type: 'progress'; percent: number; caption: string }
  | { type: 'step'; label: string; status: 'done' | 'running' | 'pending' }
  | { type: 'result'; payload: unknown }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'error'; reason: string; suggestion?: string }
  | { type: 'done' };

/** 通用关闭句柄 */
export interface Closeable { close: () => void }
