/**
 * 临时文件清理：扫描所有用户的 temp/ 目录，删除 mtime > 24h 的文件。
 * 启动后每小时跑一次。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const TTL_MS = 24 * 60 * 60 * 1000;

export function startTempCleanup() {
  const tick = async () => {
    try { await sweep(); } catch (e) { console.warn('[cleanup]', (e as Error).message); }
  };
  setTimeout(tick, 30_000);          // 启动 30 秒后跑一次
  setInterval(tick, 60 * 60 * 1000); // 之后每小时
}

async function sweep() {
  const root = config.paths.dataDir;
  let removed = 0;
  let orgs: string[] = [];
  try { orgs = await fs.readdir(root); } catch { return; }
  for (const org of orgs) {
    if (org.startsWith('_')) continue;
    const orgDir = path.join(root, org);
    let users: string[] = [];
    try { users = await fs.readdir(orgDir); } catch { continue; }
    for (const u of users) {
      const tempDir = path.join(orgDir, u, 'temp');
      removed += await sweepDir(tempDir);
    }
  }
  if (removed) console.log(`[cleanup] removed ${removed} expired temp files`);
}

async function sweepDir(dir: string): Promise<number> {
  let entries: any[] = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return 0; }
  const now = Date.now();
  let removed = 0;
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    try {
      const stat = await fs.stat(p);
      if (now - stat.mtimeMs > TTL_MS) {
        await fs.rm(p, { recursive: true, force: true });
        removed += 1;
      }
    } catch { /* ignore */ }
  }
  return removed;
}
