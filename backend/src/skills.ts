/**
 * Skills REST 路由 —— 暴露 OpenClaw 注册表 + zip 上传 + 删除 + 意图识别。
 */
import { FastifyInstance } from 'fastify';
import { loadAllSkills, getSkillByIdForOrg, type LoadedSkill } from './openclaw/registry.js';
import { uploadSkillZip, deleteSkill } from './openclaw/uploader.js';
import { audit } from './audit.js';

/** 给 LLM 注入 system 用的摘要 */
export async function listSkillSummaries(orgId: string) {
  const all = await loadAllSkills(orgId);
  return all.map((s) => ({ id: s.id, name: s.name, description: s.description }));
}

/** 对外暴露用 */
export async function getSkillForOrg(orgId: string, id: string) {
  return getSkillByIdForOrg(orgId, id);
}

export async function registerSkills(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; category?: string } }>('/api/skills', async (req) => {
    const tenant = (req as any).tenant;
    let list = await loadAllSkills(tenant.orgId);
    const { q, category } = req.query;
    if (q) list = list.filter((s) => s.name.includes(q) || s.description.includes(q));
    if (category && category !== 'all') list = list.filter((s) => s.category === category);
    return list.map((s) => toApi(s, tenant.userId));
  });

  app.get<{ Params: { id: string } }>('/api/skills/:id', async (req, reply) => {
    const tenant = (req as any).tenant;
    const s = await getSkillByIdForOrg(tenant.orgId, req.params.id);
    if (!s) { reply.code(404).send({ message: 'not found' }); return; }
    return toApi(s, tenant.userId);
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/api/skills/:id/apply',
    async (req) => {
      const tenant = (req as any).tenant;
      await audit(tenant, {
        action: 'skill.apply', skillId: req.params.id, extra: { reason: req.body?.reason },
      });
      return { applyId: `apply-${Date.now()}`, status: 'pending' as const };
    },
  );

  /** 上传 zip：multipart 单文件 */
  app.post('/api/skills', async (req, reply) => {
    const tenant = (req as any).tenant;
    const parts = req.parts();
    for await (const p of parts) {
      if (p.type === 'file') {
        try {
          const result = await uploadSkillZip(tenant, p.file);
          await audit(tenant, { action: 'skill.upload', skillId: result.id, status: 'success' });
          return result;
        } catch (e) {
          await audit(tenant, {
            action: 'skill.upload', status: 'failure', reason: (e as Error).message,
          });
          return reply.code(400).send({ message: (e as Error).message });
        }
      }
    }
    return reply.code(400).send({ message: '未携带 zip 文件' });
  });

  /** 删除（仅上传者本人） */
  app.delete<{ Params: { id: string } }>('/api/skills/:id', async (req, reply) => {
    const tenant = (req as any).tenant;
    try {
      await deleteSkill(tenant, req.params.id);
      await audit(tenant, { action: 'skill.delete', skillId: req.params.id, status: 'success' });
      reply.code(204).send();
    } catch (e) {
      reply.code(403).send({ message: (e as Error).message });
    }
  });

  /** 意图识别（关键词命中 + 上下文 hint） */
  app.post<{ Body: { text: string; contextKeys: string[] } }>('/api/intent/parse', async (req) => {
    const tenant = (req as any).tenant;
    const all = await loadAllSkills(tenant.orgId);
    const text = req.body.text || '';
    const scored = all.map((s) => ({
      s, score: scoreMatch(text, s.name) + scoreMatch(text, s.description),
    })).sort((a, b) => b.score - a.score);
    const main = scored[0]?.s ?? all[0];
    const alts = scored.slice(1, 3).map((x) => ({
      ...toApi(x.s, tenant.userId), confidence: Math.min(95, x.score * 18),
    }));
    return {
      main: { ...toApi(main, tenant.userId), confidence: Math.min(99, (scored[0]?.score ?? 1) * 20) },
      alternatives: alts,
      fields: main?.params ?? [],
      etaSeconds: 30,
      etaTokens: 800,
    };
  });
}

function toApi(s: LoadedSkill, currentUserId: string) {
  const { dir, source, ...rest } = s;
  void dir; void source;
  return {
    ...rest,
    /** 是否为当前用户上传 → 决定能否删除/显示标签 */
    mine: !!s.uploadedBy && s.uploadedBy === currentUserId,
  };
}

function scoreMatch(text: string, needle: string): number {
  let score = 0;
  for (const token of needle.split(/[\s,，/]+/)) {
    if (token && text.includes(token)) score += 1;
  }
  return score;
}
