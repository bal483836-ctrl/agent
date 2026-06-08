import { BACKEND_MODE } from './env';
import { request, streamSSE } from './http';
import type { ChatMessage } from '@/types';
import type { Closeable, MessageStreamEvent } from './types';
import { mockMessages } from '@/mock/data';
import { externalMessagesApi } from './external';

export interface MessagesApi {
  /** 拉取一个会话的历史消息 */
  list(sessionId: string): Promise<ChatMessage[]>;
  /** 发送一条文本，开启 SSE 流，事件通过 onEvent 推送 */
  send(
    sessionId: string,
    content: string,
    onEvent: (e: MessageStreamEvent) => void,
    contextFiles?: { key: string; name: string; type: 'folder' | 'file' }[],
  ): Closeable;
}

/* ---------- real：SSE 流 ---------- */
const realApi: MessagesApi = {
  list: (sessionId) => request<ChatMessage[]>(`/sessions/${sessionId}/messages`),
  send(sessionId, content, onEvent, contextFiles) {
    const ctrl = new AbortController();
    streamSSE(
      `/sessions/${sessionId}/messages`,
      { content, contextFiles: contextFiles ?? [] },
      ({ event, data }) => {
        try {
          const parsed = JSON.parse(data);
          onEvent({ type: event as MessageStreamEvent['type'], ...parsed });
        } catch (e) {
          onEvent({ type: 'error', reason: `bad event: ${String(e)}` });
        }
      },
      ctrl.signal,
    ).catch((e) => onEvent({ type: 'error', reason: String(e) }));
    return { close: () => ctrl.abort() };
  },
};

/* ---------- mock：用 timer 模拟流式回复 ---------- */
const mockApi: MessagesApi = {
  async list(sessionId) {
    // 仅默认会话返回示例消息，其它会话从空开始
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
  // 拆成小片段模拟 token 流
  return text.match(/.{1,4}/g) ?? [text];
}

function pickMessagesApi(): MessagesApi {
  if (BACKEND_MODE === 'external') return externalMessagesApi;
  if (BACKEND_MODE === 'local') return realApi;
  return mockApi;
}
export const messagesApi: MessagesApi = pickMessagesApi();
