/**
 * OpenClaw Skills 注册：
 *   - 组织级 SKILLS_DIR 是共享 skill 库（系统内置）
 *   - 每个用户上传的 skill 落到 <DATA_DIR>/<orgId>/_skills/<skillId>/
 *     该组织全员可见可用，删除权限仅限上传者
 *
 * Skill 目录约束：
 *   manifest.json  必需
 *   main.py        必需（入口脚本由 manifest.entry 指定）
 *   requirements.txt 可选
 *   sample.png     可选（卡片缩略图）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  entry: string;
  inputs?: string[];
  params?: SkillParam[];
  uses?: number;
  /** 上传者 user id，系统内置 skill 留空 */
  uploadedBy?: string;
  uploadedAt?: string;
  /** 用户身份显示，会被加上"我上传"标签 */
  mine?: boolean;
  /** 输出示例 thumbnail 相对路径 */
  thumbnail?: string;
  version?: string;
}

export interface SkillParam {
  key: string; label: string;
  type: 'text' | 'select' | 'number';
  value: string | number;
  options?: { label: string; value: string }[];
  helper?: string;
}

export interface LoadedSkill extends SkillManifest {
  /** 物理目录 */
  dir: string;
  /** 来源：system（内置）/ org（组织内用户上传） */
  source: 'system' | 'org';
}

const REQUIRED_KEYS: (keyof SkillManifest)[] = ['id', 'name', 'description', 'category', 'entry'];

export function orgSkillsDir(orgId: string): string {
  return path.join(config.paths.dataDir, orgId.replace(/[^A-Za-z0-9_-]/g, '_'), '_skills');
}

/** 系统内置 + 当前组织上传的全部技能 */
export async function loadAllSkills(orgId: string): Promise<LoadedSkill[]> {
  const [system, org] = await Promise.all([
    loadFromDir(config.paths.skillsDir, 'system'),
    loadFromDir(orgSkillsDir(orgId), 'org'),
  ]);
  return [...system, ...org];
}

async function loadFromDir(root: string, source: 'system' | 'org'): Promise<LoadedSkill[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const result: LoadedSkill[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(root, ent.name);
      const skill = await tryLoadManifest(dir);
      if (skill) result.push({ ...skill, dir, source });
    }
    return result;
  } catch (e: any) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function tryLoadManifest(dir: string): Promise<SkillManifest | null> {
  try {
    const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf-8');
    const m = JSON.parse(raw) as SkillManifest;
    validateManifest(m);
    return m;
  } catch (e) {
    console.warn(`[skills] skip ${dir}: ${(e as Error).message}`);
    return null;
  }
}

export function validateManifest(m: any): asserts m is SkillManifest {
  if (typeof m !== 'object' || !m) throw new Error('manifest must be object');
  for (const k of REQUIRED_KEYS) {
    if (!(k in m)) throw new Error(`manifest 缺字段：${k}`);
  }
  if (!/^[a-z0-9_-]+$/i.test(String(m.id))) throw new Error('id 只能是字母/数字/下划线/连字符');
  if (!m.entry.endsWith('.py') && !m.entry.endsWith('.js')) {
    throw new Error('entry 必须是 .py 或 .js');
  }
}

export async function getSkillByIdForOrg(orgId: string, id: string): Promise<LoadedSkill | undefined> {
  const all = await loadAllSkills(orgId);
  return all.find((s) => s.id === id);
}
