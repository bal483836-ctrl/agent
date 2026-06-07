/**
 * Skills 注册：扫描 SKILLS_DIR 下的目录，每个目录需包含 manifest.json。
 *
 * manifest.json 示例：
 * {
 *   "id": "csv_diff",
 *   "name": "CSV 跨中心数据比对",
 *   "description": "对两个 CSV 字段级行级比对",
 *   "category": "数据比对",
 *   "icon": "📊",
 *   "entry": "main.py",
 *   "inputs": [".csv", ".xlsx"],
 *   "params": [
 *     { "key": "tol", "label": "数值容差", "type": "text", "value": "0.01" }
 *   ]
 * }
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { FastifyInstance } from 'fastify';
import { config } from './config.js';

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  entry: string;          // 相对 manifest 的脚本路径，目前只支持 .py
  inputs?: string[];
  params?: SkillParam[];
  uses?: number;
  mine?: boolean;
}

export interface SkillParam {
  key: string; label: string;
  type: 'text' | 'select' | 'number';
  value: string | number;
  options?: { label: string; value: string }[];
  helper?: string;
}

const cache: { skills: (SkillManifest & { dir: string })[] | null } = { skills: null };

export async function loadSkills(): Promise<(SkillManifest & { dir: string })[]> {
  if (cache.skills) return cache.skills;
  const root = config.paths.skillsDir;
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const result: (SkillManifest & { dir: string })[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(root, ent.name);
      const m = path.join(dir, 'manifest.json');
      try {
        const raw = await fs.readFile(m, 'utf-8');
        const manifest = JSON.parse(raw) as SkillManifest;
        result.push({ ...manifest, dir });
      } catch (e) {
        console.warn(`[skills] failed to load ${ent.name}: ${(e as Error).message}`);
      }
    }
    cache.skills = result;
    return result;
  } catch (e: any) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function getSkill(id: string) {
  const all = await loadSkills();
  return all.find((s) => s.id === id);
}

/** 供 LLM 注入到 system prompt 的紧凑摘要 */
export async function listSkillSummaries() {
  const all = await loadSkills();
  return all.map((s) => ({ id: s.id, name: s.name, description: s.description }));
}

export async function registerSkills(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; category?: string } }>('/api/skills', async (req) => {
    let list = await loadSkills();
    const { q, category } = req.query;
    if (q) list = list.filter((s) => s.name.includes(q) || s.description.includes(q));
    if (category && category !== 'all') list = list.filter((s) => s.category === category);
    return list.map(stripDir);
  });

  app.get<{ Params: { id: string } }>('/api/skills/:id', async (req, reply) => {
    const s = await getSkill(req.params.id);
    if (!s) { reply.code(404).send({ message: 'not found' }); return; }
    return stripDir(s);
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/skills/:id/apply',
    async (req) => {
      return { applyId: `apply-${Date.now()}`, status: 'pending' as const, reason: req.body?.reason };
    },
  );

  /** 意图识别：MVP 走 keyword 简易匹配；真实场景由 LLM 出 tool_call */
  app.post<{ Body: { text: string; contextKeys: string[] } }>('/api/intent/parse', async (req) => {
    const all = await loadSkills();
    const text = req.body.text || '';
    const scored = all.map((s) => ({
      s,
      score: scoreMatch(text, s.name) + scoreMatch(text, s.description),
    })).sort((a, b) => b.score - a.score);
    const main = scored[0]?.s ?? all[0];
    const alts = scored.slice(1, 3).map((x) => ({ ...stripDir(x.s), confidence: Math.min(95, x.score * 18) }));
    return {
      main: { ...stripDir(main), confidence: Math.min(99, (scored[0]?.score ?? 1) * 20) },
      alternatives: alts,
      fields: main.params ?? [],
      etaSeconds: 30,
      etaTokens: 800,
    };
  });
}

function stripDir(s: SkillManifest & { dir: string }) {
  const { dir, ...rest } = s;
  void dir;
  return rest;
}

function scoreMatch(text: string, needle: string): number {
  let score = 0;
  for (const token of needle.split(/[\s,，/]+/)) {
    if (token && text.includes(token)) score += 1;
  }
  return score;
}
