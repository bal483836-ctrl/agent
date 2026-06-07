/**
 * 轻量 JSON 文件存储。MVP 阶段够用，后续可平滑换成 SQLite/Postgres。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import {
  type TenantCtx, ensureTenantDirs, sessionsFile, messagesFile,
  workspacesRoot, workspaceRoot, safeResolve,
} from './tenant.js';

/* ========== 类型 ========== */

export interface ChatSession {
  id: string; title: string; updatedAt: string;
  group: 'today' | 'yesterday' | 'week' | 'earlier';
  pinned?: boolean;
}

export type Role = 'user' | 'assistant';
export interface PersistedMessage {
  id: string; role: Role; type: string;
  createdAt: string;
  content?: string;
  tokenUsage?: { prompt: number; completion: number; total: number; durationMs?: number };
  skillName?: string;
  [k: string]: unknown;
}

export interface WsNode {
  key: string; name: string; type: 'folder' | 'file';
  size?: string; hasDescription?: boolean;
  children?: WsNode[];
}
export interface Workspace {
  id: string; name: string; description?: string; tree: WsNode[];
}

/* ========== Sessions ========== */

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data) as T;
  } catch (e: any) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function listSessions(ctx: TenantCtx): Promise<ChatSession[]> {
  await ensureTenantDirs(ctx);
  return readJson<ChatSession[]>(sessionsFile(ctx), []);
}
export async function createSession(ctx: TenantCtx, title: string): Promise<ChatSession> {
  const list = await listSessions(ctx);
  const s: ChatSession = { id: `s-${nanoid(8)}`, title, updatedAt: nowHHMM(), group: 'today' };
  await writeJson(sessionsFile(ctx), [s, ...list]);
  return s;
}
export async function renameSession(ctx: TenantCtx, id: string, title: string) {
  const list = await listSessions(ctx);
  const next = list.map((x) => (x.id === id ? { ...x, title } : x));
  await writeJson(sessionsFile(ctx), next);
  return next.find((x) => x.id === id);
}
export async function removeSession(ctx: TenantCtx, id: string) {
  const list = await listSessions(ctx);
  await writeJson(sessionsFile(ctx), list.filter((x) => x.id !== id));
  try { await fs.unlink(messagesFile(ctx, id)); } catch { /* ignore */ }
}

/* ========== Messages（按会话存为 JSONL） ========== */

export async function listMessages(ctx: TenantCtx, sessionId: string): Promise<PersistedMessage[]> {
  const file = messagesFile(ctx, sessionId);
  try {
    const data = await fs.readFile(file, 'utf-8');
    return data.split('\n').filter(Boolean).map((l) => JSON.parse(l) as PersistedMessage);
  } catch (e: any) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
export async function appendMessage(ctx: TenantCtx, sessionId: string, msg: PersistedMessage) {
  const file = messagesFile(ctx, sessionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(msg) + '\n', 'utf-8');
}

/* ========== Workspaces ========== */

function workspacesMetaFile(ctx: TenantCtx) {
  return path.join(workspacesRoot(ctx), '_workspaces.json');
}

export async function listWorkspaces(ctx: TenantCtx): Promise<Workspace[]> {
  await ensureTenantDirs(ctx);
  let list = await readJson<Workspace[]>(workspacesMetaFile(ctx), []);
  if (list.length === 0) {
    // 首次访问自动创建默认工作区
    const w: Workspace = {
      id: `ws-${nanoid(6)}`, name: '我的工作区', description: '默认工作区', tree: [],
    };
    await fs.mkdir(workspaceRoot(ctx, w.id), { recursive: true });
    list = [w];
    await writeJson(workspacesMetaFile(ctx), list);
  }
  return list;
}

export async function getWorkspaceTree(ctx: TenantCtx, wsId: string): Promise<WsNode[]> {
  const list = await listWorkspaces(ctx);
  const ws = list.find((w) => w.id === wsId);
  if (!ws) throw new Error('workspace not found');
  return ws.tree;
}

export async function saveWorkspaceTree(ctx: TenantCtx, wsId: string, tree: WsNode[]) {
  const list = await listWorkspaces(ctx);
  const next = list.map((w) => (w.id === wsId ? { ...w, tree } : w));
  await writeJson(workspacesMetaFile(ctx), next);
}

export function nodeFsPath(ctx: TenantCtx, wsId: string, nodeKey: string): string {
  return safeResolve(ctx, 'workspaces', wsId, nodeKey);
}

/* ========== 工具 ========== */

function nowHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) { return n.toString().padStart(2, '0'); }

export { nanoid };
