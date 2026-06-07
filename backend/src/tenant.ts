/**
 * 多租户上下文：
 *  - 组织隔离：物理层面通过独立 VM / 容器栈实现（部署架构），本进程读取 JWT 中 orgId 仅用于数据路径分流
 *  - 用户隔离：进程内按 (orgId, userId) 隔离数据目录与会话状态
 *
 * 每个 (org, user) 拥有：
 *   <DATA_DIR>/<orgId>/<userId>/
 *     ├── workspaces/<wsId>/         # 工作区文件树（FS 层）
 *     ├── sessions.json              # 会话索引
 *     ├── messages/<sessionId>.jsonl # 消息流水
 *     ├── outputs/<runId>/           # 技能执行产物
 *     └── temp/                      # 临时上传（24h 自动清理）
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from './config.js';

export interface TenantCtx {
  orgId: string;
  orgName: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

export function userRoot(ctx: TenantCtx): string {
  return path.join(config.paths.dataDir, sanitize(ctx.orgId), sanitize(ctx.userId));
}

export function workspacesRoot(ctx: TenantCtx): string {
  return path.join(userRoot(ctx), 'workspaces');
}
export function workspaceRoot(ctx: TenantCtx, wsId: string): string {
  return path.join(workspacesRoot(ctx), sanitize(wsId));
}
export function sessionsFile(ctx: TenantCtx): string {
  return path.join(userRoot(ctx), 'sessions.json');
}
export function messagesFile(ctx: TenantCtx, sessionId: string): string {
  return path.join(userRoot(ctx), 'messages', `${sanitize(sessionId)}.jsonl`);
}
export function outputsRoot(ctx: TenantCtx, runId: string): string {
  return path.join(userRoot(ctx), 'outputs', sanitize(runId));
}
export function tempRoot(ctx: TenantCtx): string {
  return path.join(userRoot(ctx), 'temp');
}

/** 首次访问时创建目录骨架 */
export async function ensureTenantDirs(ctx: TenantCtx) {
  await Promise.all([
    fs.mkdir(workspacesRoot(ctx), { recursive: true }),
    fs.mkdir(path.dirname(messagesFile(ctx, 'x')), { recursive: true }),
    fs.mkdir(path.join(userRoot(ctx), 'outputs'), { recursive: true }),
    fs.mkdir(tempRoot(ctx), { recursive: true }),
  ]);
}

/** 防越权：确保拼出来的路径仍在用户根目录内 */
export function safeResolve(ctx: TenantCtx, ...segments: string[]): string {
  const root = userRoot(ctx);
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(root)) throw new Error('path escape detected');
  return target;
}

function sanitize(s: string): string {
  // 限制成 [A-Za-z0-9_-]，防路径穿越
  return s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}
