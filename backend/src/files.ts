/**
 * 文件上传/下载/临时文件/文件夹描述/版本管理 路由。
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
import { audit } from './audit.js';

export async function registerFiles(app: FastifyInstance) {
  // 工作区上传（支持单批多文件，强制业务约束）
  app.post<{ Params: { id: string } }>(
    '/api/workspaces/:id/files',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const wsId = req.params.id;

      const parts = req.parts();
      let parentKey: string | null = null;
      const uploaded: WsNode[] = [];
      let totalBytes = 0;

      try {
        for await (const part of parts) {
          if (part.type === 'field' && part.fieldname === 'parentKey') {
            parentKey = String(part.value || '') || null;
            continue;
          }
          if (part.type === 'file') {
            if (uploaded.length >= config.upload.maxFilesPerBatch) {
              throw new Error(`单批最多 ${config.upload.maxFilesPerBatch} 个文件`);
            }
            const node = await persistUpload(tenant, wsId, part, (n) => {
              totalBytes += n;
              if (totalBytes > config.upload.maxTotalBytes) {
                throw new Error(`单批总量超过 ${config.upload.maxTotalBytes} 字节`);
              }
            });
            uploaded.push(node);
          }
        }
      } catch (e) {
        return reply.code(400).send({ message: (e as Error).message });
      }

      if (!uploaded.length) return reply.code(400).send({ message: 'no file uploaded' });

      // 写树（按 parentKey 落到对应文件夹下；处理同名 → 自动版本号）
      const tree = await getWorkspaceTree(tenant, wsId);
      const merged = mergeNodes(tree, parentKey, uploaded);
      await saveWorkspaceTree(tenant, wsId, merged);

      await audit(tenant, {
        action: 'file.upload',
        extra: { wsId, parentKey, count: uploaded.length, bytes: totalBytes },
        status: 'success',
      });

      // 单文件兼容旧前端：返回单对象；多文件返回数组
      return uploaded.length === 1 ? uploaded[0] : uploaded;
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
        await audit(tenant, { action: 'file.temp.upload', extra: { name: part.filename, tempKey } });
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

  // 文件夹描述（按需求 3.3.2）
  app.get<{ Params: { id: string; key: string } }>(
    '/api/workspaces/:id/folders/:key/description',
    async (req) => {
      const tenant = (req as any).tenant;
      const p = safeResolve(tenant, 'workspaces', req.params.id, `${req.params.key}.desc.md`);
      try { return { content: await fsp.readFile(p, 'utf-8') }; }
      catch { return { content: '' }; }
    },
  );
  app.put<{ Params: { id: string; key: string }; Body: { content: string } }>(
    '/api/workspaces/:id/folders/:key/description',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const p = safeResolve(tenant, 'workspaces', req.params.id, `${req.params.key}.desc.md`);
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p, req.body.content ?? '', 'utf-8');
      // 在树里把 hasDescription 标记上
      const tree = await getWorkspaceTree(tenant, req.params.id);
      const next = markHasDescription(tree, req.params.key, (req.body.content ?? '').trim().length > 0);
      await saveWorkspaceTree(tenant, req.params.id, next);
      reply.code(204).send();
    },
  );
}

/**
 * 把上传的 part 写入工作区物理目录，同时计算 SHA-256。
 * 返回新建的 WsNode（其中 size 是格式化字符串）。
 */
async function persistUpload(
  tenant: any, wsId: string, part: any,
  onBytes: (n: number) => void,
): Promise<WsNode> {
  const key = `f-${nanoid(8)}`;
  const target = safeResolve(tenant, 'workspaces', wsId, key);
  await fsp.mkdir(path.dirname(target), { recursive: true });

  const hash = crypto.createHash('sha256');
  const ws = fs.createWriteStream(target);
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    part.file.on('data', (b: Buffer) => {
      bytes += b.length;
      onBytes(b.length);
      if (bytes > config.upload.maxFileBytes) {
        ws.destroy();
        reject(new Error(`单文件超过 ${config.upload.maxFileBytes} 字节`));
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

  const sha256 = hash.digest('hex');
  // 同时把 sha256 写入 sidecar，方便后续审计
  await fsp.writeFile(target + '.sha256', sha256, 'utf-8').catch(() => {});

  return {
    key,
    name: part.filename,
    type: 'file',
    size: fmtSize(bytes),
  };
}

/**
 * 把新上传的节点合并到树。
 * 同名文件：保留旧文件，新文件追加 " (v2)" / " (v3)" 后缀（版本管理简化版）。
 */
function mergeNodes(tree: WsNode[], parentKey: string | null, newNodes: WsNode[]): WsNode[] {
  const insertInto = (siblings: WsNode[]): WsNode[] => {
    const next = [...siblings];
    for (const incoming of newNodes) {
      let name = incoming.name;
      let ver = 2;
      while (next.some((s) => s.name === name)) {
        const parsed = parseName(incoming.name);
        name = `${parsed.base} (v${ver})${parsed.ext}`;
        ver += 1;
      }
      next.push({ ...incoming, name });
    }
    return next;
  };

  if (parentKey == null) return insertInto(tree);

  const walk = (nodes: WsNode[]): WsNode[] => nodes.map((n) => {
    if (n.key === parentKey && n.type === 'folder') {
      return { ...n, children: insertInto(n.children ?? []) };
    }
    if (n.children) return { ...n, children: walk(n.children) };
    return n;
  });
  return walk(tree);
}

function parseName(name: string): { base: string; ext: string } {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, idx), ext: name.slice(idx) };
}

function markHasDescription(nodes: WsNode[], key: string, has: boolean): WsNode[] {
  return nodes.map((n) => {
    if (n.key === key) return { ...n, hasDescription: has };
    if (n.children) return { ...n, children: markHasDescription(n.children, key, has) };
    return n;
  });
}

function streamToFile(stream: NodeJS.ReadableStream, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(target);
    stream.pipe(ws);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
    stream.on('error', reject);
  });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
