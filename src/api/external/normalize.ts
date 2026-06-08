/**
 * OpenClaw 原始数据 → 我们前端的领域模型。
 *
 * 后端返回结构未稳定（用户原话："openclaw 未处理的数据，后续会优化"），
 * 这里对常见字段名做兼容（id/key/sessionKey/sessionId，role/sender，content/text…）。
 */
import { nanoid } from 'nanoid';
import type { ChatMessage, ChatSession, SkillCandidate } from '@/types';

type AnyRecord = Record<string, any>;

/** OpenClaw session → ChatSession */
export function normalizeSession(raw: AnyRecord): ChatSession {
  const sessionKey = String(
    raw.sessionKey ?? raw.session_key ?? raw.id ?? raw.key ?? raw.sessionId ?? nanoid(),
  );
  const title = String(
    raw.title
    ?? raw.name
    ?? raw.summary
    ?? raw.firstMessage
    ?? raw.first_message
    ?? sessionKey.split(':').pop()
    ?? '新对话',
  );
  const t = raw.updatedAt ?? raw.updated_at ?? raw.createdAt ?? raw.created_at;
  const updatedAt = formatTime(t);
  return {
    id: sessionKey,                  // 用 sessionKey 作为前端 session id
    title,
    updatedAt,
    group: groupByTime(t),
  };
}

/** OpenClaw message → ChatMessage（text 类型） */
export function normalizeMessage(raw: AnyRecord): ChatMessage {
  const role = inferRole(raw);
  const content = extractContent(raw);
  const id = String(raw.id ?? raw.messageId ?? raw.message_id ?? nanoid());
  const t = raw.createdAt ?? raw.created_at ?? raw.timestamp ?? raw.ts ?? Date.now();

  // 提取 usage（如果有）
  const usage = raw.usage ?? raw.tokenUsage ?? raw.token_usage;
  const tokenUsage = usage
    ? {
        prompt: Number(usage.prompt ?? usage.prompt_tokens ?? usage.input_tokens ?? 0),
        completion: Number(usage.completion ?? usage.completion_tokens ?? usage.output_tokens ?? 0),
        total: Number(usage.total ?? usage.total_tokens ?? 0),
        durationMs: Number(usage.durationMs ?? usage.duration_ms ?? 0) || undefined,
      }
    : undefined;
  // 修正 total 如果没给
  if (tokenUsage && !tokenUsage.total) {
    tokenUsage.total = tokenUsage.prompt + tokenUsage.completion;
  }

  return {
    id,
    role,
    type: 'text',
    content,
    createdAt: formatTime(t),
    tokenUsage,
  };
}

/** OpenClaw agent → SkillCandidate（同事的 agent 模型 ≈ 我的 skill） */
export function normalizeAgent(raw: AnyRecord): SkillCandidate {
  const id = String(raw.id ?? raw.agentId ?? raw.agent_id ?? raw.key ?? raw.name ?? nanoid());
  return {
    id,
    name: String(raw.name ?? raw.title ?? raw.displayName ?? raw.display_name ?? id),
    description: String(raw.description ?? raw.desc ?? raw.summary ?? ''),
    category: String(raw.category ?? raw.type ?? raw.tag ?? '通用'),
    icon: String(raw.icon ?? raw.emoji ?? '🤖'),
    uses: Number(raw.uses ?? raw.useCount ?? raw.use_count ?? 0),
    mine: false,
  };
}

/* ===== 工具函数 ===== */

function inferRole(raw: AnyRecord): 'user' | 'assistant' {
  const r = String(raw.role ?? raw.sender ?? raw.from ?? raw.author ?? '').toLowerCase();
  if (['user', 'human', 'me', 'usr'].includes(r)) return 'user';
  return 'assistant';   // 缺省按 assistant 处理（含 ai/assistant/bot/system…）
}

function extractContent(raw: AnyRecord): string {
  const c = raw.content ?? raw.text ?? raw.message ?? raw.body ?? '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((x: any) => typeof x === 'string' ? x : (x?.text ?? x?.content ?? '')).join('');
  }
  if (typeof c === 'object' && c) return c.text ?? JSON.stringify(c);
  return String(c);
}

function formatTime(t: any): string {
  let d: Date;
  if (!t) d = new Date();
  else if (typeof t === 'number') d = new Date(t < 1e12 ? t * 1000 : t);
  else d = new Date(t);
  if (isNaN(d.getTime())) d = new Date();
  const today = new Date();
  if (sameDay(d, today)) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function pad(n: number) { return n.toString().padStart(2, '0'); }

function groupByTime(t: any): ChatSession['group'] {
  if (!t) return 'today';
  const d = typeof t === 'number' ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t);
  if (isNaN(d.getTime())) return 'today';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const week = new Date(today); week.setDate(week.getDate() - 7);
  if (d >= today) return 'today';
  if (d >= yest) return 'yesterday';
  if (d >= week) return 'week';
  return 'earlier';
}
