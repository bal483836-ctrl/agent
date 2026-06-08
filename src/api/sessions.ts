import { BACKEND_MODE } from './env';
import { request } from './http';
import type { ChatSession } from '@/types';
import { mockSessions } from '@/mock/data';
import { externalSessionsApi } from './external';

export interface SessionsApi {
  list(): Promise<ChatSession[]>;
  create(title?: string): Promise<ChatSession>;
  rename(id: string, title: string): Promise<ChatSession>;
  remove(id: string): Promise<void>;
}

const realApi: SessionsApi = {
  list: () => request<ChatSession[]>('/sessions'),
  create: (title) => request<ChatSession>('/sessions', { method: 'POST', body: { title } }),
  rename: (id, title) => request<ChatSession>(`/sessions/${id}`, { method: 'PATCH', body: { title } }),
  remove: (id) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),
};

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

function pickSessionsApi(): SessionsApi {
  if (BACKEND_MODE === 'external') return externalSessionsApi;
  if (BACKEND_MODE === 'local') return realApi;
  return mockApi;
}
export const sessionsApi: SessionsApi = pickSessionsApi();
