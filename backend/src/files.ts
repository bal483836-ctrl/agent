/**
 * 文件上传/下载/临时文件 路由。
 * 上传：multipart/form-data，写到工作区物理目录，同时把 WsNode 写进树。
 * 下载：直接 stream 物理文件。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { config } from './config.js';
import {
  getWorkspaceTree, saveWorkspaceTree, nodeFsPath, nanoid, type WsNode,
} from './store.js';
import { safeResolve, tempRoot } from './tenant.js';

export async function registerFiles(app: FastifyInstance) {
  // 工作区上传
  app.post<{ Params: { id: string } }>(
    '/api/workspaces/:id/files',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const wsId = req.params.id;

      const parts = req.parts();
      let parentKey: string | null = null;
      let savedNode: WsNode | null = null;

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'parentKey') {
          parentKey = String(part.value || '') || null;
          continue;
        }
        if (part.type === 'file') {
          // 业务约束：单文件大小
          const fileNode = await persistUpload(tenant, wsId, parentKey, part);
          savedNode = fileNode;
        }
      }
      if (!savedNode) return reply.code(400).send({ message: 'no file uploaded' });

      // 写树
      const tree = await getWorkspaceTree(tenant, wsId);
      const next = addToTreeUnder(tree, parentKey, savedNode);
      await saveWorkspaceTree(tenant, wsId, next);
      return savedNode;
    },
  );

  // 临时上传
  app.post('/api/temp-files', async (req, reply) => {
    const tenant = (req as any).tenant;
    await fsp.mkdir(tempRoot(tenant), { recursive: true });
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const tempKey = `tmp-${nanoid(10)}`;
        const target = path.join(tempRoot(tenant), tempKey);
        await streamToFile(part.file, target);
        const expireAt = new Date(Date.now() + 86400000).toISOString();
        return { tempKey, name: part.filename, expireAt };
      }
    }
    reply.code(400).send({ message: 'no file' });
  });

  // 下载
  app.get<{ Params: { id: string; key: string } }>(
    '/api/workspaces/:id/files/:key/download',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const target = nodeFsPath(tenant, req.params.id, req.params.key);
      try {
        const stat = await fsp.stat(target);
        if (!stat.isFile()) return reply.code(404).send({ message: 'not file' });
        reply.header('Content-Length', String(stat.size));
        reply.header('Content-Type', 'application/octet-stream');
        return reply.send(fs.createReadStream(target));
      } catch {
        return reply.code(404).send({ message: 'not found' });
      }
    },
  );
}

async function persistUpload(
  tenant: any, wsId: string, parentKey: string | null, part: any,
): Promise<WsNode> {
  const key = `f-${nanoid(8)}`;
  const targetRel = parentKey ? path.join(parentKey, key) : key;
  const target = safeResolve(tenant, 'workspaces', wsId, targetRel);
  await fsp.mkdir(path.dirname(target), { recursive: true });

  // stream 写入 + 限大小 + 算 SHA256
  const hash = crypto.createHash('sha256');
  const ws = fs.createWriteStream(target);
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    part.file.on('data', (b: Buffer) => {
      bytes += b.length;
      if (bytes > config.upload.maxFileBytes) {
        ws.destroy();
        reject(new Error(`file too large (>${config.upload.maxFileBytes} bytes)`));
        return;
      }
      hash.update(b);
    });
    part.file.on('end', () => ws.end());
    part.file.on('error', reject);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
    part.file.pipe(ws);
  });

  return {
    key,
    name: part.filename,
    type: 'file',
    size: fmtSize(bytes),
  };
}

async function streamToFile(stream: NodeJS.ReadableStream, target: string) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(target);
    stream.pipe(ws);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
    stream.on('error', reject);
  });
}

function addToTreeUnder(nodes: WsNode[], parentKey: string | null, newNode: WsNode): WsNode[] {
  if (parentKey == null) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.key === parentKey && n.type === 'folder') {
      return { ...n, children: [...(n.children ?? []), newNode] };
    }
    if (n.children) return { ...n, children: addToTreeUnder(n.children, parentKey, newNode) };
    return n;
  });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
