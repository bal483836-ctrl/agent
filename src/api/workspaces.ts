import { USE_MOCK } from './env';
import { request } from './http';
import type { Workspace, WsNode } from '@/types';
import { mockWorkspaces } from '@/mock/data';

export type PreviewResult =
  | { kind: 'image'; name: string; mime: string; totalBytes: number }
  | { kind: 'binary'; name: string; mime: string; totalBytes: number }
  | { kind: string; name: string; text: string; totalBytes: number; truncated: boolean };

export interface WorkspacesApi {
  list(): Promise<Workspace[]>;
  tree(id: string): Promise<WsNode[]>;
  createFolder(id: string, parentKey: string | null, name: string): Promise<WsNode>;
  rename(id: string, key: string, name: string): Promise<WsNode>;
  remove(id: string, key: string): Promise<void>;
  move(id: string, dragKey: string, dropKey: string, dropToGap: boolean): Promise<void>;
  getFolderDescription(id: string, key: string): Promise<string>;
  setFolderDescription(id: string, key: string, content: string): Promise<void>;
  /** 文件内容预览 */
  previewFile(id: string, key: string): Promise<PreviewResult>;
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
  getFolderDescription: async (id, key) => {
    const r = await request<{ content: string }>(`/workspaces/${id}/folders/${key}/description`);
    return r.content;
  },
  setFolderDescription: (id, key, content) =>
    request<void>(`/workspaces/${id}/folders/${key}/description`, {
      method: 'PUT', body: { content },
    }),
  previewFile: (id, key) =>
    request<PreviewResult>(`/workspaces/${id}/files/${key}/preview`),
};

/* ---------- mock ---------- */
const mockDescs = new Map<string, string>();
const mockApi: WorkspacesApi = {
  async list() { return mockWorkspaces; },
  async tree(id) { return mockWorkspaces.find((w) => w.id === id)?.tree ?? []; },
  async createFolder(_id, _parent, name) {
    return { key: `d-${Date.now()}`, name, type: 'folder', children: [] };
  },
  async rename(_id, key, name) { return { key, name, type: 'file' }; },
  async remove() { /* no-op */ },
  async move() { /* no-op */ },
  async getFolderDescription(id, key) { return mockDescs.get(`${id}:${key}`) ?? ''; },
  async setFolderDescription(id, key, content) { mockDescs.set(`${id}:${key}`, content); },
  async previewFile(_id, _key) {
    return { kind: 'text', name: 'mock', text: '（mock 模式下无文件内容）', totalBytes: 0, truncated: false };
  },
};

export const workspacesApi: WorkspacesApi = USE_MOCK ? mockApi : realApi;
