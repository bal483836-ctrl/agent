import { USE_MOCK } from './env';
import { request } from './http';
import type { Workspace, WsNode } from '@/types';
import { mockWorkspaces } from '@/mock/data';

export interface WorkspacesApi {
  list(): Promise<Workspace[]>;
  tree(id: string): Promise<WsNode[]>;
  createFolder(id: string, parentKey: string | null, name: string): Promise<WsNode>;
  rename(id: string, key: string, name: string): Promise<WsNode>;
  remove(id: string, key: string): Promise<void>;
  move(id: string, dragKey: string, dropKey: string, dropToGap: boolean): Promise<void>;
}

const realApi: WorkspacesApi = {
  list: () => request<Workspace[]>('/workspaces'),
  tree: (id) => request<WsNode[]>(`/workspaces/${id}/tree`),
  createFolder: (id, parentKey, name) =>
    request<WsNode>(`/workspaces/${id}/folders`, { method: 'POST', body: { parentKey, name } }),
  rename: (id, key, name) =>
    request<WsNode>(`/workspaces/${id}/nodes/${key}`, { method: 'PATCH', body: { name } }),
  remove: (id, key) =>
    request<void>(`/workspaces/${id}/nodes/${key}`, { method: 'DELETE' }),
  move: (id, dragKey, dropKey, dropToGap) =>
    request<void>(`/workspaces/${id}/nodes/${dragKey}/move`, {
      method: 'POST', body: { dropKey, dropToGap },
    }),
};

/* ---------- mock ---------- */
const mockApi: WorkspacesApi = {
  async list() { return mockWorkspaces; },
  async tree(id) { return mockWorkspaces.find((w) => w.id === id)?.tree ?? []; },
  async createFolder(_id, _parent, name) {
    return { key: `d-${Date.now()}`, name, type: 'folder', children: [] };
  },
  async rename(_id, key, name) { return { key, name, type: 'file' }; },
  async remove() { /* no-op */ },
  async move() { /* no-op */ },
};

export const workspacesApi: WorkspacesApi = USE_MOCK ? mockApi : realApi;
