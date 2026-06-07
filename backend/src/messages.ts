/**
 * 消息相关路由：
 *  - GET /sessions/:id/messages      历史消息
 *  - POST /sessions/:id/messages     SSE 流式发送（real LLM 调用）
 */
import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { appendMessage, listMessages, type PersistedMessage } from './store.js';
import { streamReply } from './llm.js';
import { listSkillSummaries } from './skills.js';

interface ContextFile { key: string; name: string; type: 'folder' | 'file' }

export async function registerMessages(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/messages',
    async (req) => listMessages((req as any).tenant, req.params.id),
  );

  app.post<{ Params: { id: string }; Body: { content: string; contextFiles?: ContextFile[] } }>(
    '/api/sessions/:id/messages',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const sessionId = req.params.id;
      const { content, contextFiles = [] } = req.body ?? ({} as any);

      // 1) 持久化用户消息
      const userMsg: PersistedMessage = {
        id: `m-${nanoid(8)}`, role: 'user', type: 'text', content,
        createdAt: nowHHMM(),
      };
      await appendMessage(tenant, sessionId, userMsg);

      // 2) 准备 SSE
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const write = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const aborted = req.raw.on.bind(req.raw);
      let aborted2 = false;
      aborted('close', () => { aborted2 = true; });

      // 3) 拉历史 + 已注册 skills
      const history = await listMessages(tenant, sessionId);
      const skills = await listSkillSummaries();

      // 4) 拼装 assistant 消息缓冲
      const assistantId = `m-${nanoid(8)}`;
      let fullText = '';
      let usage: PersistedMessage['tokenUsage'] | undefined;
      let toolCall: { skillId: string; params: Record<string, unknown> } | null = null;

      await streamReply({
        history,
        userText: content,
        contextFiles: contextFiles.map((f) => ({ name: f.name, type: f.type })),
        skills,
        onEvent: (e) => {
          if (aborted2) return;
          if (e.type === 'text-delta') {
            fullText += e.chunk;
            write('text-delta', { chunk: e.chunk });
          } else if (e.type === 'tool-call') {
            toolCall = { skillId: e.skillId, params: e.params };
            write('tool-call', { skillId: e.skillId, reason: e.reason, params: e.params });
          } else if (e.type === 'usage') {
            usage = e.usage;
            write('usage', { ...e.usage });
          } else if (e.type === 'done') {
            write('done', { messageId: assistantId });
          } else if (e.type === 'error') {
            write('error', { reason: e.reason });
          }
        },
      });

      // 5) 持久化 assistant 消息（去掉 tool_call 段，那段交给前端单独渲染）
      const cleaned = fullText.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      const assistantMsg: PersistedMessage = {
        id: assistantId, role: 'assistant', type: 'text',
        content: cleaned, createdAt: nowHHMM(), tokenUsage: usage,
      };
      await appendMessage(tenant, sessionId, assistantMsg);

      // 如果有 tool_call，再追加一条提示性消息（前端可用 tool-call 事件直接落 skill-confirm）
      void toolCall;

      reply.raw.end();
    },
  );
}

function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) { return n.toString().padStart(2, '0'); }
