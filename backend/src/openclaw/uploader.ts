/**
 * 真正的 skill zip 上传器：
 *   - 解压到 临时目录
 *   - 校验 manifest.json + entry 存在
 *   - 通过则原子移到 <DATA_DIR>/<orgId>/_skills/<skillId>/
 *   - 重复 id 报错（除非是同一上传者覆盖）
 *
 * 依赖：MVP 用 Node 内置 zlib + 简易 zip 解析；为可靠性使用 spawn unzip 命令（POSIX 通用）。
 */
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { orgSkillsDir, validateManifest } from './registry.js';
import { tempRoot, type TenantCtx } from '../tenant.js';
import { nanoid } from '../store.js';

export interface SkillUploadResult {
  id: string;
  name: string;
  description: string;
  category: string;
}

/**
 * 把上传的 zip 解压、校验、注册为组织级 skill。
 *
 * @param tenant   当前用户上下文
 * @param zipStream 上传的 zip 流（来自 multipart part.file）
 * @returns SkillUploadResult
 */
export async function uploadSkillZip(
  tenant: TenantCtx,
  zipStream: NodeJS.ReadableStream,
): Promise<SkillUploadResult> {
  // 1) 写入临时 zip 文件
  await fs.mkdir(tempRoot(tenant), { recursive: true });
  const zipPath = path.join(tempRoot(tenant), `upload-${nanoid(8)}.zip`);
  await streamToFile(zipStream, zipPath);

  // 2) 解压到临时目录
  const stageDir = path.join(tempRoot(tenant), `stage-${nanoid(8)}`);
  await fs.mkdir(stageDir, { recursive: true });
  await unzip(zipPath, stageDir);

  try {
    // 3) 找 manifest.json；若不存在但有 SKILL.md，按 markdown 技能合成 manifest
    const manifestInfo = await locateManifestOrSkillMd(stageDir);
    const manifestRaw = await fs.readFile(manifestInfo.manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    validateManifest(manifest);

    // 4) 入口脚本/SKILL.md 必须存在
    const entryPath = path.join(manifestInfo.root, manifest.entry);
    try { await fs.access(entryPath); }
    catch { throw new Error(`找不到入口文件：${manifest.entry}`); }

    // 5) 防止重名（除非是同一上传者覆盖）
    const targetDir = path.join(orgSkillsDir(tenant.orgId), manifest.id);
    await guardOverwrite(targetDir, tenant.userId, manifest.id);

    // 6) 写入上传者元信息 + 原子复制到 _skills/
    manifest.uploadedBy = tenant.userId;
    manifest.uploadedAt = new Date().toISOString();
    await fs.writeFile(manifestInfo.manifestPath, JSON.stringify(manifest, null, 2));

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await copyDir(manifestInfo.root, targetDir);

    return {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      category: manifest.category,
    };
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {});
    await fs.unlink(zipPath).catch(() => {});
  }
}

/**
 * 上传单个 SKILL.md（Claude Code 风格）：
 *   - 解析 YAML frontmatter 中的 name / description
 *   - 合成 manifest.json，entry 指向 SKILL.md
 *   - 写入 <orgSkillsDir>/<skillId>/
 */
export async function uploadSkillMarkdown(
  tenant: TenantCtx,
  mdStream: NodeJS.ReadableStream,
  originalFilename = 'SKILL.md',
): Promise<SkillUploadResult> {
  await fs.mkdir(tempRoot(tenant), { recursive: true });
  const tmpPath = path.join(tempRoot(tenant), `skill-${nanoid(8)}.md`);
  await streamToFile(mdStream, tmpPath);

  try {
    const raw = await fs.readFile(tmpPath, 'utf-8');
    const fm = parseFrontmatter(raw);
    const manifest = synthesizeManifestFromFrontmatter(fm, originalFilename, tenant.userId);

    const targetDir = path.join(orgSkillsDir(tenant.orgId), manifest.id);
    await guardOverwrite(targetDir, tenant.userId, manifest.id);

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'SKILL.md'), raw, 'utf-8');
    await fs.writeFile(
      path.join(targetDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );

    return {
      id: manifest.id, name: manifest.name,
      description: manifest.description, category: manifest.category,
    };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

/**
 * 删除组织级 skill。只允许上传者本人删除。
 */
export async function deleteSkill(tenant: TenantCtx, skillId: string): Promise<void> {
  const targetDir = path.join(orgSkillsDir(tenant.orgId), skillId);
  let manifest: any;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(targetDir, 'manifest.json'), 'utf-8'));
  } catch {
    throw new Error('skill 不存在');
  }
  if (!manifest.uploadedBy) throw new Error('系统内置技能不可删除');
  if (manifest.uploadedBy !== tenant.userId) {
    throw new Error('只有上传者本人可以删除该技能');
  }
  await fs.rm(targetDir, { recursive: true, force: true });
}

/* ===== 工具 ===== */

async function guardOverwrite(targetDir: string, userId: string, skillId: string): Promise<void> {
  try {
    const existing = JSON.parse(await fs.readFile(path.join(targetDir, 'manifest.json'), 'utf-8'));
    if (existing.uploadedBy && existing.uploadedBy !== userId) {
      throw new Error(`技能 ${skillId} 已被其他用户上传，请改个 id`);
    }
  } catch (e: any) {
    if (e.code !== 'ENOENT' && !String(e.message).includes('Unexpected')) throw e;
  }
}

/**
 * 在解压目录中定位入口：
 *  1) 优先 manifest.json（兼容根目录或单层子目录）
 *  2) 否则若存在 SKILL.md，则按 frontmatter 合成 manifest.json
 */
async function locateManifestOrSkillMd(
  root: string,
): Promise<{ manifestPath: string; root: string }> {
  // 顶层 manifest.json
  try {
    const p = path.join(root, 'manifest.json');
    await fs.access(p);
    return { manifestPath: p, root };
  } catch {/* fallthrough */}

  // 顶层 SKILL.md
  const topMd = await firstSkillMd(root);
  if (topMd) return await synthesizeManifestInDir(topMd.dir, topMd.filename);

  // 单层子目录
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) {
    const sub = path.join(root, dirs[0].name);
    const p = path.join(sub, 'manifest.json');
    try { await fs.access(p); return { manifestPath: p, root: sub }; } catch {/* */}
    const subMd = await firstSkillMd(sub);
    if (subMd) return await synthesizeManifestInDir(subMd.dir, subMd.filename);
  }
  throw new Error('zip 内未找到 manifest.json 或 SKILL.md');
}

async function firstSkillMd(dir: string): Promise<{ dir: string; filename: string } | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && /^skill\.md$/i.test(e.name)) return { dir, filename: e.name };
  }
  return null;
}

async function synthesizeManifestInDir(
  dir: string, mdFilename: string,
): Promise<{ manifestPath: string; root: string }> {
  const raw = await fs.readFile(path.join(dir, mdFilename), 'utf-8');
  const fm = parseFrontmatter(raw);
  const manifest = synthesizeManifestFromFrontmatter(fm, mdFilename, undefined);
  const manifestPath = path.join(dir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return { manifestPath, root: dir };
}

/** 极简 YAML frontmatter 解析：支持 `key: value`、`key: > 折叠多行`、`key: | 字面多行`。 */
export function parseFrontmatter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw.startsWith('---')) return out;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return out;
  const block = raw.slice(3, end).replace(/^\r?\n/, '');
  const lines = block.split(/\r?\n/);
  let curKey: string | null = null;
  let mode: 'fold' | 'literal' | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (curKey == null) return;
    if (mode === 'literal') out[curKey] = buf.join('\n').trim();
    else if (mode === 'fold') out[curKey] = buf.map((s) => s.trim()).filter(Boolean).join(' ');
    else out[curKey] = (out[curKey] ?? '').trim();
    curKey = null; mode = null; buf = [];
  };
  for (const ln of lines) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(ln);
    if (m && !/^\s/.test(ln)) {
      flush();
      curKey = m[1];
      const rest = m[2];
      if (rest === '>') { mode = 'fold'; }
      else if (rest === '|') { mode = 'literal'; }
      else { out[curKey] = rest.trim(); curKey = null; }
    } else if (curKey && mode) {
      buf.push(ln);
    }
  }
  flush();
  return out;
}

function slugifyId(input: string): string {
  const cleaned = input.replace(/\.md$/i, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || `skill-${nanoid(6)}`;
}

function synthesizeManifestFromFrontmatter(
  fm: Record<string, string>,
  filenameHint: string,
  uploadedBy: string | undefined,
): any {
  const rawId = fm.id || fm.name || filenameHint;
  const id = slugifyId(rawId);
  const name = fm.name || id;
  const description = fm.description || '';
  return {
    id, name, description,
    category: fm.category || '其他',
    icon: fm.icon || '📄',
    entry: 'SKILL.md',
    inputs: [],
    params: [],
    uses: 0,
    ...(uploadedBy ? { uploadedBy, uploadedAt: new Date().toISOString() } : {}),
  };
}

function streamToFile(stream: NodeJS.ReadableStream, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = createWriteStream(target);
    stream.pipe(ws);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
    stream.on('error', reject);
  });
}

function unzip(zip: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-q', '-o', zip, '-d', dest]);
    let err = '';
    child.stderr.on('data', (b) => { err += b.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip exit ${code}: ${err}`));
    });
  });
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}
