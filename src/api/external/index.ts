/**
 * 同事 OpenClaw 后端的适配器集合。
 * 实现 ../{auth,sessions,messages,skills,workspaces,files,runs}.ts 中定义的接口。
 *
 * 未支持的能力（工作区文件、技能上传、文件预览、技能执行 WS、审计…）：
 *   抛 NotSupported 或返回空，由上层 UI 友好提示。
 */
import type { AuthApi } from '../auth';
import type { SessionsApi } from '../sessions';
import type { MessagesApi } from '../messages';
import type { SkillsApi } from '../skills';
import type { WorkspacesApi } from '../workspaces';
import type { FilesApi } from '../files';
import type { RunsApi } from '../runs';
import type { ChatMessage, CurrentUser } from '@/types';
import type { Closeable, MessageStreamEvent } from '../types';
import { extRequest, buildExtSseUrl } from './client';
import {
  ensureConnected, forceConnect, getExternalUserId, getExternalDept, setExternalUser,
} from './connect';
import { normalizeAgent, normalizeMessage, normalizeSession } from './normalize';

function notSupported(feature: string) {
  return new Error(`同事的后端暂未支持「${feature}」`);
}

/* ============ AUTH ============ */

export const externalAuthApi: AuthApi = {
  async login(req) {
    // 同事后端没有真正的登录，email 即 userID
    const uid = req.email || getExternalUserId();
    setExternalUser(uid, getExternalDept());
    await forceConnect();
    return {
      token: `external:${uid}`,
      user: {
        id: uid, name: uid, email: uid,
        role: getExternalDept(), organization: getExternalDept(),
        joinedAt: new Date().toISOString().slice(0, 10),
      },
    };
  },
  async me(): Promise<CurrentUser> {
    await ensureConnected();
    const uid = getExternalUserId();
    return {
      id: uid, name: uid, email: uid,
      role: getExternalDept(), organization: getExternalDept(),
      joinedAt: new Date().toISOString().slice(0, 10),
    };
  },
  async logout() {
    // 后端无 logout，仅前端清理
    setExternalUser('', '');
  },
};

/* ============ SESSIONS ============ */

export const externalSessionsApi: SessionsApi = {
  async list() {
    await ensureConnected();
    const raw = await extRequest<any>('/api/sessions', { query: { userID: getExternalUserId() } });
    const arr = extractArray(raw, ['sessions', 'data', 'list', 'items']);
    return arr.map(normalizeSession);
  },
  async create(title?: string) {
    await ensureConnected();
    const raw = await extRequest<any>('/api/sessions/new', {
      method: 'POST',
      query: { userID: getExternalUserId() },
      body: { agentId: 'main', title: title || '新对话' },
    });
    // 后端返回可能就是 session 对象或包了一层
    const session = raw?.session ?? raw?.data ?? raw;
    return normalizeSession(session);
  },
  async rename(_id, _title) {
    throw notSupported('重命名会话');
  },
  async remove(_id) {
    throw notSupported('删除会话');
  },
};

/* ============ MESSAGES ============ */

export const externalMessagesApi: MessagesApi = {
  async list(sessionId) {
    await ensureConnected();
    const raw = await extRequest<any>('/api/chat/history', {
      query: { userID: getExternalUserId(), sessionKey: sessionId },
    });
    const arr = extractArray(raw, ['messages', 'history', 'data', 'list', 'items']);
    return arr.map(normalizeMessage);
  },

  send(sessionId, content, onEvent, _contextFiles): Closeable {
    let aborted = false;
    let es: EventSource | null = null;

    (async () => {
      try {
        await ensureConnected();

        // 1) POST /api/chat/send → runId
        const resp = await extRequest<any>('/api/chat/send', {
          method: 'POST',
          body: {
            userID: getExternalUserId(),
            message: content,
            sessionKey: sessionId,
          },
        });
        const runId = String(resp?.runId ?? resp?.run_id ?? resp?.id ?? resp);
        if (!runId) throw new Error('后端未返回 runId');

        if (aborted) return;

        // 2) GET /api/chat/stream?runId=...
        const url = buildExtSseUrl('/api/chat/stream', {
          userID: getExternalUserId(),
          runId,
          sessionKey: sessionId,
        });

        es = new EventSource(url);
        let buffer = '';

        es.onmessage = (ev) => {
          if (aborted) return;
          const data = ev.data?.trim();
          if (!data || data === '[DONE]') {
            onEvent({ type: 'done', messageId: runId });
            es?.close();
            return;
          }
          // 尝试 JSON parse，失败时按裸文本 delta 处理
          try {
            const parsed = JSON.parse(data);
            handleStreamPayload(parsed, onEvent, () => buffer, (s) => { buffer = s; });
          } catch {
            onEvent({ type: 'text-delta', chunk: data });
          }
        };
        es.onerror = () => {
          if (!aborted) {
            onEvent({ type: 'done', messageId: runId });
          }
          es?.close();
        };
      } catch (e) {
        onEvent({ type: 'error', reason: (e as Error).message });
      }
    })();

    return {
      close: () => { aborted = true; es?.close(); },
    };
  },
};

/**
 * 解析单条 SSE payload，兼容若干常见结构：
 *   { delta: "...", finish?: false }
 *   { text: "..." }
 *   { content: "..." }
 *   { choices: [{delta:{content:"..."}}] }    OpenAI 风格
 *   { type: "text", text: "..." }              Anthropic 风格
 *   { event: "message" | "done", data: {...} }
 *   { usage: {...} }
 */
function handleStreamPayload(
  payload: any,
  onEvent: (e: MessageStreamEvent) => void,
  _getBuf: () => string,
  _setBuf: (s: string) => void,
) {
  // 完成事件
  if (payload?.done === true || payload?.finished === true
      || payload?.event === 'done' || payload?.type === 'done') {
    onEvent({ type: 'done', messageId: payload?.messageId ?? payload?.id ?? '' });
    return;
  }
  // usage
  if (payload?.usage) {
    const u = payload.usage;
    onEvent({
      type: 'usage',
      usage: {
        prompt: Number(u.prompt ?? u.prompt_tokens ?? u.input_tokens ?? 0),
        completion: Number(u.completion ?? u.completion_tokens ?? u.output_tokens ?? 0),
        total: Number(u.total ?? u.total_tokens ?? 0)
          || Number(u.prompt ?? u.prompt_tokens ?? 0) + Number(u.completion ?? u.completion_tokens ?? 0),
        durationMs: u.durationMs ?? u.duration_ms,
      },
    });
    return;
  }
  // 找文本 delta
  const text =
    payload?.delta
    ?? payload?.text
    ?? payload?.content
    ?? payload?.message
    ?? payload?.choices?.[0]?.delta?.content
    ?? payload?.data?.text
    ?? payload?.data?.content;
  if (typeof text === 'string' && text.length) {
    onEvent({ type: 'text-delta', chunk: text });
  }
  // 还可能是数组段
  if (Array.isArray(payload?.choices)) {
    for (const c of payload.choices) {
      const t = c?.delta?.content ?? c?.message?.content;
      if (typeof t === 'string' && t) onEvent({ type: 'text-delta', chunk: t });
    }
  }
}

/* ============ SKILLS = AGENTS ============ */

export const externalSkillsApi: SkillsApi = {
  async list(_opts) {
    await ensureConnected();
    const raw = await extRequest<any>('/api/agents', { query: { userID: getExternalUserId() } });
    const arr = extractArray(raw, ['agents', 'data', 'list', 'items']);
    return arr.map(normalizeAgent);
  },
  async detail(id) {
    const list = await this.list();
    const s = list.find((x) => x.id === id);
    if (!s) throw new Error('agent 不存在');
    return s;
  },
  async upload(_form) { throw notSupported('上传技能'); },
  async remove(_id) { throw notSupported('删除技能'); },
  async apply(id) { return { applyId: `external-${id}`, status: 'pending' as const }; },
  async parseIntent(_text, _ctx) {
    // 后端尚未提供，前端给个最小占位（直接选第一个 agent）
    const list = await this.list();
    const main = list[0];
    return {
      main: { ...main, confidence: 80 },
      alternatives: list.slice(1, 3).map((s) => ({ ...s, confidence: 50 })),
      fields: [],
      etaSeconds: 30,
      etaTokens: 800,
    };
  },
};

/* ============ WORKSPACES / FILES / RUNS：暂不支持 ============ */

export const externalWorkspacesApi: WorkspacesApi = {
  async list() { return []; },
  async tree(_id) { return []; },
  async createFolder(_id, _parent, _name) { throw notSupported('创建文件夹'); },
  async rename(_id, _key, _name) { throw notSupported('重命名'); },
  async remove(_id, _key) { throw notSupported('删除文件'); },
  async move(_id, _drag, _drop, _gap) { throw notSupported('移动文件'); },
  async getFolderDescription(_id, _key) { return ''; },
  async setFolderDescription(_id, _key, _content) { throw notSupported('文件夹描述'); },
  async previewFile(_id, _key) { throw notSupported('文件预览'); },
};

export const externalFilesApi: FilesApi = {
  async uploadToWorkspace(_w, _p, _file) { throw notSupported('上传到工作区'); },
  async uploadTemp(file) {
    return { tempKey: `tmp-${Date.now()}`, name: file.name, expireAt: new Date(Date.now() + 86400000).toISOString() };
  },
  async download(_key) { throw notSupported('下载文件'); },
  downloadOutput: (_relPath) => '#',
  async sha256(file: File) {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  },
};

export const externalRunsApi: RunsApi = {
  async start(_skillId, _params, _ctx) { throw notSupported('独立执行技能'); },
  subscribe(_runId, _onEvent) { return { close: () => {} }; },
};

/* ===== 工具 ===== */

function extractArray(raw: any, keys: string[]): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  return [];
}

/** 未使用但导出占位，避免 TS 报 unused */
void normalizeMessage;
export {
  ensureConnected, getExternalUserId, getExternalDept, setExternalUser,
} from './connect';
export const externalMessagesNormalize = { normalizeMessage } as const;
