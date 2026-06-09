import { USE_MOCK } from './env';
import { request, getUserID, streamSSEGet } from './http';
import type { ChatMessage } from '@/types';
import type { Closeable, MessageStreamEvent } from './types';
import { mockMessages } from '@/mock/data';
import { nanoid } from 'nanoid';

export interface MessagesApi {
  list(sessionId: string): Promise<ChatMessage[]>;
  send(
    sessionId: string,
    content: string,
    onEvent: (e: MessageStreamEvent) => void,
    contextFiles?: { key: string; name: string; type: 'folder' | 'file' }[],
  ): Closeable;
}

/**
 * 适配 gateway:
 *   GET  /api/chat/history?userID=...&sessionKey=...
 *   POST /api/chat/send  { userID, message, sessionKey } → { runId }
 *   GET  /api/chat/stream?userID=...&runId=...&sessionKey=...  (SSE)
 *
 * SSE 事件名前端无明确文档，解析做防御：
 *   - data 是 JSON 且有 chunk/content/delta → text-delta
 *   - data 是 "[DONE]" 或事件名 done/end → done
 *   - 否则按纯文本当作 chunk
 */
const realApi: MessagesApi = {
  async list(sessionId) {
    const userID = getUserID() ?? '';
    const raw = await request<unknown>('/chat/history', {
      query: { userID, sessionKey: sessionId },
    });
    return normalizeHistory(raw);
  },
  send(sessionId, content, onEvent, _contextFiles) {
    const userID = getUserID() ?? '';
    let closed = false;
    let stream: { close: () => void } | null = null;

    (async () => {
      try {
        const resp = await request<any>('/chat/send', {
          method: 'POST',
          body: { userID, message: content, sessionKey: sessionId },
        });
        if (closed) return;
        const runId = resp?.runId ?? resp?.run_id ?? resp?.id;
        if (!runId) {
          onEvent({ type: 'error', reason: 'chat/send 未返回 runId' });
          return;
        }
        stream = streamSSEGet(
          '/chat/stream',
          { userID, runId, sessionKey: sessionId },
          ({ event, data }) => {
            handleSseEvent(event, data, onEvent);
          },
          () => {
            // EventSource 流结束/出错时也兜底 done，避免气泡一直转圈
            if (!closed) {
              onEvent({ type: 'done', messageId: `m-${Date.now()}` });
              closed = true;
              stream?.close();
            }
          },
        );
      } catch (e) {
        onEvent({ type: 'error', reason: String(e) });
      }
    })();

    return {
      close: () => {
        closed = true;
        stream?.close();
      },
    };
  },
};

function handleSseEvent(
  event: string,
  data: string,
  onEvent: (e: MessageStreamEvent) => void,
) {
  const text = data?.trim() ?? '';
  if (!text) return;
  // 终止信号
  if (text === '[DONE]' || event === 'done' || event === 'end') {
    onEvent({ type: 'done', messageId: `m-${Date.now()}` });
    return;
  }
  // 尝试 JSON
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const j = JSON.parse(text);
      // 错误
      if (j.error || j.reason || event === 'error') {
        onEvent({ type: 'error', reason: String(j.error ?? j.reason ?? text) });
        return;
      }
      // usage
      if (j.usage || event === 'usage') {
        const u = j.usage ?? j;
        onEvent({
          type: 'usage',
          usage: {
            prompt: Number(u.prompt ?? u.promptTokens ?? u.prompt_tokens ?? 0),
            completion: Number(u.completion ?? u.completionTokens ?? u.completion_tokens ?? 0),
            total: Number(u.total ?? u.totalTokens ?? u.total_tokens ?? 0),
            durationMs: Number(u.durationMs ?? u.duration_ms ?? 0) || undefined,
          },
        });
        return;
      }
      // 文本增量：兼容 chunk / delta / content / text
      const chunk =
        j.chunk ?? j.delta ?? j.content ?? j.text ?? j.message ?? j.token ?? '';
      if (typeof chunk === 'string' && chunk.length) {
        onEvent({ type: 'text-delta', chunk });
        return;
      }
      // done 信号在 JSON 里
      if (j.type === 'done' || j.done === true || j.finished === true) {
        onEvent({ type: 'done', messageId: String(j.messageId ?? j.id ?? `m-${Date.now()}`) });
        return;
      }
      // 实在没识别出来，吞掉
      return;
    } catch {
      /* fallthrough：当纯文本处理 */
    }
  }
  // 纯文本：作为增量片段
  onEvent({ type: 'text-delta', chunk: text });
}

function normalizeHistory(raw: unknown): ChatMessage[] {
  let arr: any[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['messages', 'history', 'data', 'list', 'items', 'result']) {
      if (Array.isArray(o[k])) { arr = o[k] as any[]; break; }
    }
  }
  return arr
    .map((m): ChatMessage | null => {
      const role: 'user' | 'assistant' =
        m.role === 'user' || m.from === 'user' ? 'user' : 'assistant';
      const content = String(m.content ?? m.message ?? m.text ?? '');
      const createdAt = formatHHMM(m.createdAt ?? m.timestamp ?? m.time ?? m.ts);
      if (!content) return null;
      return {
        id: String(m.id ?? m.messageId ?? nanoid()),
        role,
        type: 'text',
        content,
        createdAt,
      };
    })
    .filter((x): x is ChatMessage => x != null);
}

function formatHHMM(v: unknown): string {
  if (!v) return '';
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) { return n.toString().padStart(2, '0'); }

/* ---------- mock：用 timer 模拟流式回复 ---------- */
const mockApi: MessagesApi = {
  async list(sessionId) {
    return sessionId === mockMessages[0]?.id ? mockMessages : [];
  },
  send(_sessionId, content, onEvent, _ctx) {
    let stopped = false;
    const replyChunks = mockReply(content);
    let i = 0;
    const tick = () => {
      if (stopped) return;
      if (i < replyChunks.length) {
        onEvent({ type: 'text-delta', chunk: replyChunks[i] });
        i++;
        setTimeout(tick, 60);
      } else {
        onEvent({ type: 'usage', usage: { prompt: 320, completion: 96, total: 416, durationMs: 980 } });
        onEvent({ type: 'done', messageId: `m-${Date.now()}` });
      }
    };
    setTimeout(tick, 200);
    return { close: () => { stopped = true; } };
  },
};

function mockReply(input: string): string[] {
  const text =
    '已收到您的请求。如果需要调用技能，请使用 / 调出技能列表，或在右侧选择文件作为上下文。';
  void input;
  return text.match(/.{1,4}/g) ?? [text];
}

export const messagesApi: MessagesApi = USE_MOCK ? mockApi : realApi;
