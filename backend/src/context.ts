/**
 * 上下文文件解析：把前端 selectedContext 的 keys 翻译成物理路径，
 * 并对支持的格式（文本 / PDF / Word / Excel / CSV / Markdown / JSON）
 * 提取真实内容供 LLM 阅读。
 */
import { type TenantCtx } from './tenant.js';
import { getWorkspaceTree, listWorkspaces, nodeFsPath, type WsNode } from './store.js';
import type { CtxFile } from './llm.js';
import { parseFile } from './parsers.js';

const MAX_INLINE_PER_FILE = 8 * 1024;    // 单文件最多注入 8KB 文本
const MAX_INLINE_TOTAL = 32 * 1024;      // 全体合计最多 32KB
const MAX_FILES_FROM_FOLDER = 20;

export interface ContextFileInput {
  key: string; name: string; type: 'folder' | 'file';
}

export async function resolveContextFiles(
  tenant: TenantCtx,
  inputs: ContextFileInput[],
): Promise<CtxFile[]> {
  if (!inputs?.length) return [];
  const workspaces = await listWorkspaces(tenant);
  const out: CtxFile[] = [];
  let totalInlined = 0;

  for (const inp of inputs) {
    let hit: { wsId: string; node: WsNode } | null = null;
    for (const w of workspaces) {
      const tree = await getWorkspaceTree(tenant, w.id);
      const node = findInTree(tree, inp.key);
      if (node) { hit = { wsId: w.id, node }; break; }
    }
    if (!hit) {
      out.push({ key: inp.key, name: inp.name, type: inp.type });
      continue;
    }

    if (hit.node.type === 'file') {
      const t = await pushFileCtx(tenant, hit.wsId, hit.node, out, totalInlined);
      totalInlined = t;
    } else {
      const files = collectFiles(hit.node).slice(0, MAX_FILES_FROM_FOLDER);
      for (const f of files) {
        const t = await pushFileCtx(tenant, hit.wsId, f, out, totalInlined);
        totalInlined = t;
      }
    }
  }
  return out;
}

async function pushFileCtx(
  tenant: TenantCtx, wsId: string, node: WsNode, out: CtxFile[],
  currentTotal: number,
): Promise<number> {
  const fsPath = nodeFsPath(tenant, wsId, node.key);
  let preview: string | undefined;
  let size: number | undefined;
  let nextTotal = currentTotal;

  // 还有 budget 才解析
  if (currentTotal < MAX_INLINE_TOTAL) {
    const remainingBudget = Math.min(MAX_INLINE_PER_FILE, MAX_INLINE_TOTAL - currentTotal);
    const parsed = await parseFile(fsPath, node.name, remainingBudget);
    if (parsed) {
      size = parsed.totalBytes;
      // 写入 preview 时带上"类型"提示，让 LLM 知道这是 PDF/docx 等
      if (parsed.text) {
        preview = `[type: ${parsed.kind}]\n${parsed.text}`;
        nextTotal += preview.length;
      } else {
        preview = `[type: ${parsed.kind}, size: ${parsed.totalBytes}B, 无文本内容可提取]`;
        nextTotal += preview.length;
      }
    }
  }

  out.push({
    key: node.key, name: node.name, type: 'file',
    fsPath, preview, size,
  });
  return nextTotal;
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
