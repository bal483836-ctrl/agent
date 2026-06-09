import { USE_MOCK, DEFAULT_AGENT_ID } from './env';
import { request, getUserID } from './http';
import type { ChatSession } from '@/types';
import { mockSessions } from '@/mock/data';

export interface SessionsApi {
  list(): Promise<ChatSession[]>;
  create(title?: string): Promise<ChatSession>;
  rename(id: string, title: string): Promise<ChatSession>;
  remove(id: string): Promise<void>;
}

/**
 * 适配 gateway：
 *   GET  /api/sessions?userID=xxx
 *   POST /api/sessions/new?userID=xxx  body { agentId }
 * 远端返回结构未文档化，做兼容解析：
 *   - 直接数组 → 视为会话列表
 *   - { sessions: [...] } / { data: [...] } / { list: [...] }
 * 每个 session 取 sessionKey/id/key 作为 id；title/name/sessionName 作为标题。
 *
 * rename/remove gateway 没提供 → 客户端原地处理（不持久化到后端）。
 */
const realApi: SessionsApi = {
  async list() {
    const userID = getUserID() ?? '';
    const raw = await request<unknown>('/sessions', { query: { userID } });
    return normalizeList(raw);
  },
  async create(title) {
    const userID = getUserID() ?? '';
    const raw = await request<unknown>('/sessions/new', {
      method: 'POST',
      query: { userID },
      body: { agentId: DEFAULT_AGENT_ID, title },
    });
    return normalizeOne(raw, title || '新对话');
  },
  async rename(id, title) {
    // gateway 不支持，本地返回
    return { id, title, updatedAt: '刚刚', group: 'today' };
  },
  async remove(_id) {
    // gateway 不支持，no-op
  },
};

function normalizeList(raw: unknown): ChatSession[] {
  const arr = pickArray(raw);
  return arr.map((s, i) => normalizeOne(s, `会话 ${i + 1}`));
}

function pickArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['sessions', 'data', 'list', 'items', 'result']) {
      if (Array.isArray(o[k])) return o[k] as any[];
    }
  }
  return [];
}

function normalizeOne(raw: unknown, fallbackTitle: string): ChatSession {
  if (typeof raw === 'string') {
    return { id: raw, title: fallbackTitle, updatedAt: '刚刚', group: 'today' };
  }
  const o = (raw ?? {}) as Record<string, any>;
  const id = String(
    o.sessionKey ?? o.sessionId ?? o.id ?? o.key ?? `agent:${DEFAULT_AGENT_ID}:${Date.now()}`,
  );
  const title = String(o.title ?? o.name ?? o.sessionName ?? fallbackTitle);
  const updatedAt = String(o.updatedAt ?? o.updateTime ?? o.lastActiveAt ?? '');
  return { id, title, updatedAt: updatedAt || '刚刚', group: 'today' };
}

/* ---------- mock：使用内存数组 ---------- */
let memSessions = [...mockSessions];
const mockApi: SessionsApi = {
  async list() { return memSessions; },
  async create(title) {
    const s: ChatSession = {
      id: `s-${Date.now()}`, title: title || '新对话', updatedAt: '刚刚', group: 'today',
    };
    memSessions = [s, ...memSessions];
    return s;
  },
  async rename(id, title) {
    memSessions = memSessions.map((x) => (x.id === id ? { ...x, title } : x));
    return memSessions.find((x) => x.id === id)!;
  },
  async remove(id) { memSessions = memSessions.filter((x) => x.id !== id); },
};

export const sessionsApi: SessionsApi = USE_MOCK ? mockApi : realApi;
