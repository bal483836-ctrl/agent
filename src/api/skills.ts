import { USE_MOCK } from './env';
import { request } from './http';
import type { SkillCandidate } from '@/types';
import { mockSkills } from '@/mock/data';

export interface SkillsApi {
  list(opts?: { q?: string; category?: string }): Promise<SkillCandidate[]>;
  detail(id: string): Promise<SkillCandidate>;
  /** 上传技能包 zip */
  upload(form: FormData): Promise<SkillCandidate>;
  remove(id: string): Promise<void>;
  /** 申请使用 */
  apply(id: string, reason?: string): Promise<{ applyId: string; status: 'pending' }>;
  /** 意图识别：根据当前文本 + 上下文文件返回最相关技能 */
  parseIntent(text: string, contextKeys: string[]): Promise<{
    main: SkillCandidate;
    alternatives: SkillCandidate[];
    fields: { key: string; label: string; type: 'text' | 'select' | 'number'; value: string | number;
              options?: { label: string; value: string }[]; helper?: string }[];
    etaSeconds: number;
    etaTokens: number;
  }>;
}

const realApi: SkillsApi = {
  list: (opts) => request<SkillCandidate[]>('/skills', { query: opts }),
  detail: (id) => request<SkillCandidate>(`/skills/${id}`),
  upload: (form) => request<SkillCandidate>('/skills', { method: 'POST', body: form }),
  remove: (id) => request<void>(`/skills/${id}`, { method: 'DELETE' }),
  apply: (id, reason) => request<{ applyId: string; status: 'pending' }>(
    `/skills/${id}/apply`, { method: 'POST', body: { reason } },
  ),
  parseIntent: (text, contextKeys) => request('/intent/parse', {
    method: 'POST', body: { text, contextKeys },
  }),
};

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
