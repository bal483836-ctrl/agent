/**
 * LLM 适配器。每个 Gateway 拥有自己的 Anthropic 客户端实例。
 *  - streamReply(): 流式产出 text-delta / tool-call / usage 事件
 *  - 上下文：历史消息 + 系统提示 + 用户已选文件的元信息和**部分内容**
 *
 * 模型回复中如包含 `<tool_call>{ skillId, params, reason }</tool_call>` 段，
 * 视为请求执行某个 skill，由上层据此构造 skill-confirm 推给前端。
 */
import { config } from './config.js';
import type { Gateway } from './gateway.js';
import type { PersistedMessage } from './store.js';

export interface LlmTokenUsage {
  prompt: number; completion: number; total: number; durationMs: number;
}

export type StreamEvent =
  | { type: 'text-delta'; chunk: string }
  | { type: 'tool-call'; skillId: string; reason: string; params: Record<string, unknown> }
  | { type: 'usage'; usage: LlmTokenUsage }
  | { type: 'done'; messageId: string }
  | { type: 'error'; reason: string };

export interface SkillSummary {
  id: string; name: string; description: string;
}

/** 注入到对话的上下文文件项 */
export interface CtxFile {
  key: string;
  name: string;
  type: 'folder' | 'file';
  /** 物理路径（用于读取内容） */
  fsPath?: string;
  /** 已读出的小型文本片段，会嵌入到 user message */
  preview?: string;
  /** 字节数 */
  size?: number;
}

function buildMessages(
  history: PersistedMessage[],
  userText: string,
  ctxFiles: CtxFile[],
): { role: 'user' | 'assistant'; content: string }[] {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of history) {
    if (h.role === 'user' && h.type === 'text' && typeof h.content === 'string') {
      msgs.push({ role: 'user', content: h.content });
    } else if (h.role === 'assistant' && h.type === 'text' && typeof h.content === 'string') {
      msgs.push({ role: 'assistant', content: h.content });
    }
  }

  // 上下文：先列清单，再嵌入小型文本文件的内容
  let ctxBlock = '';
  if (ctxFiles.length) {
    ctxBlock = `\n[CONTEXT FILES]\n${ctxFiles
      .map((f) => `- ${f.name} (${f.type}${f.size != null ? `, ${f.size}B` : ''})`)
      .join('\n')}\n`;
    const previews = ctxFiles.filter((f) => f.preview);
    if (previews.length) {
      ctxBlock += '\n以下为部分文件内容（截断后）：\n';
      for (const f of previews) {
        ctxBlock += `\n<<<FILE name="${f.name}">>>\n${f.preview}\n<<<END>>>\n`;
      }
    }
    ctxBlock += '[END CONTEXT]\n\n';
  }
  msgs.push({ role: 'user', content: ctxBlock + userText });
  return msgs;
}

export async function streamReply(opts: {
  gateway: Gateway;
  history: PersistedMessage[];
  userText: string;
  ctxFiles: CtxFile[];
  skills: SkillSummary[];
  onEvent: (e: StreamEvent) => void;
}): Promise<void> {
  const { gateway, history, userText, ctxFiles, skills, onEvent } = opts;
  const t0 = Date.now();

  if (!config.llm.apiKey) {
    onEvent({ type: 'error', reason: '未配置 ANTHROPIC_API_KEY' });
    return;
  }

  const skillsBlock = skills.length
    ? `\n\n[AVAILABLE SKILLS]\n${skills.map((s) => `- ${s.id}: ${s.name} — ${s.description}`).join('\n')}\n[END SKILLS]\n如需调用其中一个 Skill，在回答末尾用一行输出：\n<tool_call>{"skillId":"<id>","reason":"原因","params":{...}}</tool_call>`
    : '';

  try {
    const stream = await gateway.llm.messages.stream({
      model: config.llm.model,
      max_tokens: 1024,
      system: config.llm.systemPrompt + skillsBlock,
      messages: buildMessages(history, userText, ctxFiles),
    });

    let full = '';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        const chunk = ev.delta.text;
        full += chunk;
        onEvent({ type: 'text-delta', chunk });
      }
    }

    const m = full.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
    if (m) {
      try {
        const parsed = JSON.parse(m[1].trim());
        onEvent({
          type: 'tool-call',
          skillId: String(parsed.skillId ?? ''),
          reason: String(parsed.reason ?? ''),
          params: parsed.params ?? {},
        });
      } catch { /* ignore */ }
    }

    const finalMsg = await stream.finalMessage();
    onEvent({
      type: 'usage',
      usage: {
        prompt: finalMsg.usage.input_tokens,
        completion: finalMsg.usage.output_tokens,
        total: finalMsg.usage.input_tokens + finalMsg.usage.output_tokens,
        durationMs: Date.now() - t0,
      },
    });
    onEvent({ type: 'done', messageId: finalMsg.id });
  } catch (e: any) {
    onEvent({ type: 'error', reason: e?.message ?? String(e) });
  }
}
