/**
 * 工作区元信息与树形结构的 REST 路由。
 * 文件本身的上传/下载由 files.ts 提供。
 */
import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getWorkspaceTree, listWorkspaces, saveWorkspaceTree, nodeFsPath,
  nanoid, type WsNode,
} from './store.js';

export async function registerWorkspaces(app: FastifyInstance) {
  app.get('/api/workspaces', async (req) => {
    const list = await listWorkspaces((req as any).tenant);
    return list.map(({ tree, ...meta }) => ({ ...meta, tree })); // 包含 tree 也无妨，前端按需用
  });

  app.get<{ Params: { id: string } }>(
    '/api/workspaces/:id/tree',
    async (req) => getWorkspaceTree((req as any).tenant, req.params.id),
  );

  app.post<{ Params: { id: string }; Body: { parentKey: string | null; name: string } }>(
    '/api/workspaces/:id/folders',
    async (req) => {
      const tenant = (req as any).tenant;
      const { id } = req.params;
      const { parentKey, name } = req.body;
      const tree = await getWorkspaceTree(tenant, id);
      const newNode: WsNode = {
        key: `d-${nanoid(6)}`, name, type: 'folder', children: [],
      };
      const next = addToTree(tree, parentKey, newNode);
      await saveWorkspaceTree(tenant, id, next);
      // 物理目录也建上
      await fs.mkdir(nodeFsPath(tenant, id, newNode.key), { recursive: true });
      return newNode;
    },
  );

  app.patch<{ Params: { id: string; key: string }; Body: { name: string } }>(
    '/api/workspaces/:id/nodes/:key',
    async (req) => {
      const tenant = (req as any).tenant;
      const { id, key } = req.params;
      const { name } = req.body;
      const tree = await getWorkspaceTree(tenant, id);
      const next = renameInTree(tree, key, name);
      await saveWorkspaceTree(tenant, id, next);
      return { key, name, type: 'file' };
    },
  );

  app.delete<{ Params: { id: string; key: string } }>(
    '/api/workspaces/:id/nodes/:key',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const { id, key } = req.params;
      const tree = await getWorkspaceTree(tenant, id);
      const next = deleteFromTree(tree, key);
      await saveWorkspaceTree(tenant, id, next);
      try { await fs.rm(nodeFsPath(tenant, id, key), { recursive: true, force: true }); } catch { /* ignore */ }
      reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string; key: string }; Body: { dropKey: string; dropToGap: boolean } }>(
    '/api/workspaces/:id/nodes/:key/move',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const { id, key } = req.params;
      const { dropKey, dropToGap } = req.body;
      const tree = await getWorkspaceTree(tenant, id);
      const next = moveInTree(tree, key, dropKey, dropToGap);
      await saveWorkspaceTree(tenant, id, next);
      reply.code(204).send();
    },
  );
}

/* ===== 树形 immutable 工具 ===== */

function addToTree(nodes: WsNode[], parentKey: string | null, newNode: WsNode): WsNode[] {
  if (parentKey == null) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.key === parentKey && n.type === 'folder') {
      return { ...n, children: [...(n.children ?? []), newNode] };
    }
    if (n.children) return { ...n, children: addToTree(n.children, parentKey, newNode) };
    return n;
  });
}
function renameInTree(nodes: WsNode[], key: string, name: string): WsNode[] {
  return nodes.map((n) => {
    if (n.key === key) return { ...n, name };
    if (n.children) return { ...n, children: renameInTree(n.children, key, name) };
    return n;
  });
}
function deleteFromTree(nodes: WsNode[], key: string): WsNode[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => (n.children ? { ...n, children: deleteFromTree(n.children, key) } : n));
}
function takeFromTree(nodes: WsNode[], key: string): { taken?: WsNode; rest: WsNode[] } {
  let taken: WsNode | undefined;
  const rest: WsNode[] = [];
  for (const n of nodes) {
    if (n.key === key) { taken = n; continue; }
    if (n.children) {
      const r = takeFromTree(n.children, key);
      if (r.taken) taken = r.taken;
      rest.push({ ...n, children: r.rest });
    } else rest.push(n);
  }
  return { taken, rest };
}
function moveInTree(nodes: WsNode[], dragKey: string, dropKey: string, dropToGap: boolean): WsNode[] {
  if (dragKey === dropKey) return nodes;
  const { taken, rest } = takeFromTree(nodes, dragKey);
  if (!taken) return nodes;
  const insert = (arr: WsNode[]): WsNode[] => {
    const idx = arr.findIndex((n) => n.key === dropKey);
    if (idx === -1) return arr.map((n) => (n.children ? { ...n, children: insert(n.children) } : n));
    if (dropToGap) {
      const copy = arr.slice();
      copy.splice(idx + 1, 0, taken);
      return copy;
    }
    return arr.map((n) =>
      n.key === dropKey && n.type === 'folder'
        ? { ...n, children: [...(n.children ?? []), taken] }
        : n,
    );
  };
  return insert(rest);
}
