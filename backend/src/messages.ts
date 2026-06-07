/**
 * 消息路由：
 *  - GET /sessions/:id/messages         历史
 *  - POST /sessions/:id/messages        SSE 流式发送（取当前用户 Gateway 的 LLM 客户端）
 */
import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { appendMessage, listMessages, type PersistedMessage } from './store.js';
import { streamReply } from './llm.js';
import { listSkillSummaries } from './skills.js';
import { gatewayManager } from './gateway.js';
import { resolveContextFiles, type ContextFileInput } from './context.js';

export async function registerMessages(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/messages',
    async (req) => listMessages((req as any).tenant, req.params.id),
  );

  app.post<{ Params: { id: string }; Body: { content: string; contextFiles?: ContextFileInput[] } }>(
    '/api/sessions/:id/messages',
    async (req, reply) => {
      const tenant = (req as any).tenant;
      const sessionId = req.params.id;
      const { content, contextFiles = [] } = req.body ?? ({} as any);

      // 1) 拿到这个用户专属的 gateway 实例
      const gateway = await gatewayManager.getFor(tenant);

      // 2) 持久化用户消息
      const userMsg: PersistedMessage = {
        id: `m-${nanoid(8)}`, role: 'user', type: 'text', content,
        createdAt: nowHHMM(),
      };
      await appendMessage(tenant, sessionId, userMsg);

      // 3) SSE 头
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

      let clientGone = false;
      req.raw.on('close', () => { clientGone = true; });

      // 4) 历史 + 已注册 skills + **真实读取勾选文件内容**
      const history = await listMessages(tenant, sessionId);
      const skills = await listSkillSummaries();
      const ctxFiles = await resolveContextFiles(tenant, contextFiles);

      // 5) 跑 LLM
      const assistantId = `m-${nanoid(8)}`;
      let fullText = '';
      let usage: PersistedMessage['tokenUsage'] | undefined;

      await streamReply({
        gateway,
        history,
        userText: content,
        ctxFiles,
        skills,
        onEvent: (e) => {
          if (clientGone) return;
          if (e.type === 'text-delta') {
            fullText += e.chunk;
            write('text-delta', { chunk: e.chunk });
          } else if (e.type === 'tool-call') {
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

      // 6) 持久化 assistant 文本（去掉 tool_call 段）
      const cleaned = fullText.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      const assistantMsg: PersistedMessage = {
        id: assistantId, role: 'assistant', type: 'text',
        content: cleaned, createdAt: nowHHMM(), tokenUsage: usage,
      };
      await appendMessage(tenant, sessionId, assistantMsg);

      reply.raw.end();
    },
  );
}

function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) { return n.toString().padStart(2, '0'); }
