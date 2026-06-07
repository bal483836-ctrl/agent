/**
 * store 持久化层测试 —— 每个 it 用唯一 (orgId, userId)，
 * 物理上落在同一 tmp DATA_DIR 也互不干扰。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import type { TenantCtx } from './tenant.js';
import {
  listSessions, createSession, renameSession, removeSession,
  appendMessage, listMessages,
  listWorkspaces, getWorkspaceTree, saveWorkspaceTree,
} from './store.js';

beforeAll(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qc-test-'));
  config.paths.dataDir = tmp;
});

function freshCtx(): TenantCtx {
  return {
    orgId: 'org-' + nanoid(6), orgName: '',
    userId: 'u-' + nanoid(6), name: '', email: '', role: '',
  };
}

describe('sessions 与 messages 持久化', () => {
  it('创建 → 列表 → 重命名 → 删除', async () => {
    const ctx = freshCtx();

    expect(await listSessions(ctx)).toEqual([]);

    const s1 = await createSession(ctx, 'hi');
    expect(s1.title).toBe('hi');
    expect(await listSessions(ctx)).toHaveLength(1);

    const renamed = await renameSession(ctx, s1.id, 'hello');
    expect(renamed?.title).toBe('hello');

    await removeSession(ctx, s1.id);
    expect(await listSessions(ctx)).toEqual([]);
  });

  it('appendMessage / listMessages 来回一致', async () => {
    const ctx = freshCtx();
    const s = await createSession(ctx, 'x');
    await appendMessage(ctx, s.id, {
      id: 'm1', role: 'user', type: 'text', content: 'hello', createdAt: '00:00',
    });
    await appendMessage(ctx, s.id, {
      id: 'm2', role: 'assistant', type: 'text', content: 'world', createdAt: '00:01',
      tokenUsage: { prompt: 1, completion: 2, total: 3 },
    });
    const msgs = await listMessages(ctx, s.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].id).toBe('m1');
    expect((msgs[1] as any).tokenUsage.total).toBe(3);
  });
});

describe('workspaces 初始化与树存取', () => {
  it('首次 listWorkspaces 自动创建默认工作区', async () => {
    const ctx = freshCtx();
    const list = await listWorkspaces(ctx);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('我的工作区');
  });

  it('saveWorkspaceTree → getWorkspaceTree 双向一致', async () => {
    const ctx = freshCtx();
    const ws = (await listWorkspaces(ctx))[0];
    const tree = [
      { key: 'd1', name: 'docs', type: 'folder' as const, children: [
        { key: 'f1', name: 'a.csv', type: 'file' as const, size: '1 KB' },
      ]},
    ];
    await saveWorkspaceTree(ctx, ws.id, tree);
    const back = await getWorkspaceTree(ctx, ws.id);
    expect(back).toEqual(tree);
  });

  it('多 workspace 互不污染', async () => {
    const ctx = freshCtx();
    const w1 = (await listWorkspaces(ctx))[0];
    await saveWorkspaceTree(ctx, w1.id, [
      { key: 'd1', name: 'docs', type: 'folder' },
    ]);
    // 另一个用户进来不应看到 w1 的数据
    const ctx2 = freshCtx();
    const w2 = (await listWorkspaces(ctx2))[0];
    expect(w2.id).not.toBe(w1.id);
    expect(await getWorkspaceTree(ctx2, w2.id)).toEqual([]);
  });
});
