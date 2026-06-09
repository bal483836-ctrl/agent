import { USE_MOCK } from './env';
import { request, getUserID } from './http';
import type { SkillCandidate } from '@/types';
import { mockSkills } from '@/mock/data';

export interface SkillsApi {
  list(opts?: { q?: string; category?: string }): Promise<SkillCandidate[]>;
  detail(id: string): Promise<SkillCandidate>;
  upload(form: FormData): Promise<SkillCandidate>;
  remove(id: string): Promise<void>;
  apply(id: string, reason?: string): Promise<{ applyId: string; status: 'pending' }>;
  parseIntent(text: string, contextKeys: string[]): Promise<{
    main: SkillCandidate;
    alternatives: SkillCandidate[];
    fields: { key: string; label: string; type: 'text' | 'select' | 'number'; value: string | number;
              options?: { label: string; value: string }[]; helper?: string }[];
    etaSeconds: number;
    etaTokens: number;
  }>;
}

/**
 * 适配 gateway：只有 GET /api/agents 可用。
 * 把每个 agent 映射成一个 SkillCandidate 展示在技能中心。
 * upload/remove/apply gateway 不支持 → no-op；parseIntent 退化为占位返回。
 */
const realApi: SkillsApi = {
  async list(_opts) {
    const userID = getUserID() ?? '';
    try {
      const raw = await request<unknown>('/agents', { query: { userID } });
      return normalizeAgents(raw);
    } catch (e) {
      console.warn('agents fetch failed', e);
      return [];
    }
  },
  async detail(id) {
    const all = await realApi.list();
    return all.find((s) => s.id === id) ?? {
      id, name: id, description: '', category: '其他', icon: '🧩', uses: 0,
    };
  },
  async upload(_form) {
    throw new Error('当前后端不支持技能上传');
  },
  async remove(_id) { /* no-op */ },
  async apply(id) { return { applyId: `apply-${Date.now()}-${id}`, status: 'pending' }; },
  async parseIntent(_text, _ctx) {
    const list = await realApi.list();
    const main = list[0] ?? { id: 'noop', name: '通用', description: '', category: '其他', icon: '🧩', uses: 0 };
    return {
      main: { ...main, confidence: 80 },
      alternatives: list.slice(1, 3).map((s) => ({ ...s, confidence: 60 })),
      fields: [],
      etaSeconds: 30,
      etaTokens: 800,
    };
  },
};

function normalizeAgents(raw: unknown): SkillCandidate[] {
  let arr: any[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['agents', 'data', 'list', 'items', 'result']) {
      if (Array.isArray(o[k])) { arr = o[k] as any[]; break; }
    }
  }
  return arr.map((a, i): SkillCandidate => ({
    id: String(a.id ?? a.agentId ?? a.key ?? a.name ?? `agent-${i}`),
    name: String(a.name ?? a.title ?? a.id ?? `Agent ${i + 1}`),
    description: String(a.description ?? a.desc ?? ''),
    category: String(a.category ?? 'Agent'),
    icon: String(a.icon ?? '🤖'),
    uses: Number(a.uses ?? 0),
    mine: Boolean(a.mine ?? false),
  }));
}

/* ---------- mock ---------- */
const mockApi: SkillsApi = {
  async list(opts) {
    let arr = mockSkills.slice();
    if (opts?.q) arr = arr.filter((s) => s.name.includes(opts.q!) || s.description.includes(opts.q!));
    if (opts?.category && opts.category !== 'all') arr = arr.filter((s) => s.category === opts.category);
    return arr;
  },
  async detail(id) {
    const s = mockSkills.find((x) => x.id === id);
    if (!s) throw new Error('not found');
    return s;
  },
  async upload(_form) {
    const fake: SkillCandidate = {
      id: `sk-${Date.now()}`, icon: '🆕', name: '新上传技能',
      description: '这是 mock 模式下的占位技能', category: '其他', uses: 0, mine: true,
    };
    return fake;
  },
  async remove(_id) { /* no-op */ },
  async apply(id) { return { applyId: `apply-${Date.now()}-${id}`, status: 'pending' }; },
  async parseIntent(_text, _ctx) {
    return {
      main: { ...mockSkills[0], confidence: 92 },
      alternatives: [
        { ...mockSkills[7], confidence: 76 },
        { ...mockSkills[3], confidence: 61 },
      ],
      fields: [
        { key: 'dim', label: '比对维度', type: 'select', value: 'eff-ae',
          options: [
            { label: '主要疗效 + 不良事件（推荐）', value: 'eff-ae' },
            { label: '全字段', value: 'all' },
            { label: '仅人口学', value: 'demo' },
          ]},
        { key: 'tol', label: '数值容差', type: 'text', value: '0.01', helper: '小于此值视为一致' },
        { key: 'note', label: '语言描述', type: 'text', value: '',
          helper: '可用自然语言补充：例如"仅保留 W22 之后的访视"' },
      ],
      etaSeconds: 45,
      etaTokens: 1200,
    };
  },
};

export const skillsApi: SkillsApi = USE_MOCK ? mockApi : realApi;
