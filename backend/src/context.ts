/**
 * 上下文文件解析：把前端 selectedContext 的 keys 翻译成物理路径，
 * 并对小型文本文件读取预览片段，供 LLM 真实读到内容。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { type TenantCtx } from './tenant.js';
import { getWorkspaceTree, listWorkspaces, nodeFsPath, type WsNode } from './store.js';
import type { CtxFile } from './llm.js';

const TEXT_EXT = new Set([
  '.txt', '.md', '.csv', '.tsv', '.json', '.log', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.py', '.js', '.ts', '.sql', '.ini', '.conf',
]);

const MAX_INLINE_BYTES = 8 * 1024;        // 单文件最多嵌入 8KB
const MAX_INLINE_TOTAL = 32 * 1024;       // 总和最多 32KB

export interface ContextFileInput {
  key: string; name: string; type: 'folder' | 'file';
}

/**
 * 把前端送来的 ctx 解析成完整 CtxFile 列表（含物理路径 + 文本预览）。
 *
 * 解析策略：
 *  - 遍历用户所有工作区，按 key 命中节点
 *  - 文件：拼出物理路径，若可读文本则截取前 8KB
 *  - 文件夹：递归收集其下的文件（最多 20 个），同样处理
 */
export async function resolveContextFiles(
  tenant: TenantCtx,
  inputs: ContextFileInput[],
): Promise<CtxFile[]> {
  if (!inputs?.length) return [];
  const workspaces = await listWorkspaces(tenant);
  const out: CtxFile[] = [];
  let totalInlined = 0;

  for (const inp of inputs) {
    // 在每个工作区找
    let hit: { wsId: string; node: WsNode } | null = null;
    for (const w of workspaces) {
      const tree = await getWorkspaceTree(tenant, w.id);
      const node = findInTree(tree, inp.key);
      if (node) { hit = { wsId: w.id, node }; break; }
    }
    if (!hit) {
      // 找不到时仍保留元信息（前端可能勾了已删的）
      out.push({ key: inp.key, name: inp.name, type: inp.type });
      continue;
    }

    if (hit.node.type === 'file') {
      await pushFileCtx(tenant, hit.wsId, hit.node, out, () => totalInlined, (n) => { totalInlined = n; });
    } else {
      // 文件夹：列出其下 20 个文件作为上下文
      const files = collectFiles(hit.node).slice(0, 20);
      for (const f of files) {
        await pushFileCtx(tenant, hit.wsId, f, out, () => totalInlined, (n) => { totalInlined = n; });
      }
    }
  }
  return out;
}

async function pushFileCtx(
  tenant: TenantCtx, wsId: string, node: WsNode, out: CtxFile[],
  getTotal: () => number, setTotal: (n: number) => void,
) {
  const fsPath = nodeFsPath(tenant, wsId, node.key);
  let preview: string | undefined;
  let size: number | undefined;
  try {
    const stat = await fs.stat(fsPath);
    size = stat.size;
    const ext = path.extname(node.name).toLowerCase();
    const total = getTotal();
    if (TEXT_EXT.has(ext) && stat.size <= MAX_INLINE_BYTES * 2 && total < MAX_INLINE_TOTAL) {
      const fh = await fs.open(fsPath, 'r');
      const len = Math.min(stat.size, MAX_INLINE_BYTES, MAX_INLINE_TOTAL - total);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, 0);
      await fh.close();
      preview = buf.toString('utf-8');
      if (stat.size > len) preview += `\n... [truncated, total ${stat.size}B]`;
      setTotal(total + len);
    }
  } catch {
    /* 文件可能还没真上传（mock 阶段建过节点但无文件），忽略 */
  }
  out.push({
    key: node.key, name: node.name, type: 'file',
    fsPath, preview, size,
  });
}

function findInTree(nodes: WsNode[], key: string): WsNode | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (n.children) {
      const r = findInTree(n.children, key);
      if (r) return r;
    }
  }
  return null;
}

function collectFiles(node: WsNode, out: WsNode[] = []): WsNode[] {
  if (node.type === 'file') { out.push(node); return out; }
  for (const c of node.children ?? []) collectFiles(c, out);
  return out;
}
