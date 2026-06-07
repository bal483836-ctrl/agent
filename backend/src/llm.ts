/**
 * LLM 适配器。默认对接 Anthropic Claude。
 *  - streamReply(): 流式产出 text-delta / tool-call / usage 事件
 *  - 上下文：会话历史 + 系统提示 + 用户已选文件清单
 *
 * 模型回复中如包含 `<tool_call>{ skillId, params, reason }</tool_call>` 段，
 * 视为请求执行某个 skill；上层据此构造 skill-confirm 消息推给前端。
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import type { PersistedMessage } from './store.js';

export interface LlmTokenUsage {
  prompt: number; completion: number; total: number; durationMs: number;
}

export interface LlmEvent {
  /** 文本 delta */
  type: 'text-delta';
  chunk: string;
}
export interface ToolCallEvent {
  type: 'tool-call';
  skillId: string;
  reason: string;
  params: Record<string, unknown>;
}
export interface UsageEvent {
  type: 'usage';
  usage: LlmTokenUsage;
}
export interface DoneEvent { type: 'done'; messageId: string }
export interface ErrorEvent { type: 'error'; reason: string }

export type StreamEvent = LlmEvent | ToolCallEvent | UsageEvent | DoneEvent | ErrorEvent;

const client = new Anthropic({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
});

export interface SkillSummary {
  id: string; name: string; description: string;
}

/** 把历史对话格式化成 Anthropic 接口需要的 messages 数组 */
function buildMessages(
  history: PersistedMessage[], userText: string, contextFiles: { name: string; type: string }[],
): { role: 'user' | 'assistant'; content: string }[] {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of history) {
    if (h.role === 'user' && h.type === 'text' && typeof h.content === 'string') {
      msgs.push({ role: 'user', content: h.content });
    } else if (h.role === 'assistant' && h.type === 'text' && typeof h.content === 'string') {
      msgs.push({ role: 'assistant', content: h.content });
    }
  }
  // 当前 user：附带上下文文件
  let ctxBlock = '';
  if (contextFiles.length) {
    ctxBlock = `\n[CONTEXT FILES]\n${contextFiles
      .map((f) => `- ${f.name} (${f.type})`)
      .join('\n')}\n[END CONTEXT FILES]\n`;
  }
  msgs.push({ role: 'user', content: ctxBlock + userText });
  return msgs;
}

/**
 * 流式 chat。回调形式推送事件给上层。
 *
 * @param history    已经持久化的历史
 * @param userText   本次用户输入
 * @param contextFiles 当前对话上下文文件清单
 * @param skills     已注册 skills 摘要（注入 system，让模型有机会发起 tool_call）
 * @param onEvent    事件回调
 */
export async function streamReply(opts: {
  history: PersistedMessage[];
  userText: string;
  contextFiles: { name: string; type: string }[];
  skills: SkillSummary[];
  onEvent: (e: StreamEvent) => void;
}): Promise<void> {
  const { history, userText, contextFiles, skills, onEvent } = opts;
  const t0 = Date.now();

  if (!config.llm.apiKey) {
    onEvent({ type: 'error', reason: '未配置 ANTHROPIC_API_KEY' });
    return;
  }

  const skillsBlock = skills.length
    ? `\n\n[AVAILABLE SKILLS]\n${skills.map((s) => `- ${s.id}: ${s.name} — ${s.description}`).join('\n')}\n[END SKILLS]\n如需调用其中一个，在回答末尾用一行输出：\n<tool_call>{"skillId":"<id>","reason":"why","params":{...}}</tool_call>`
    : '';

  try {
    const stream = await client.messages.stream({
      model: config.llm.model,
      max_tokens: 1024,
      system: config.llm.systemPrompt + skillsBlock,
      messages: buildMessages(history, userText, contextFiles),
    });

    let full = '';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        const chunk = ev.delta.text;
        full += chunk;
        onEvent({ type: 'text-delta', chunk });
      }
    }

    // 解析尾部的 tool_call（如果有）
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
      } catch { /* ignore parse errors */ }
    }

    const finalMsg = await stream.finalMessage();
    const usage: LlmTokenUsage = {
      prompt: finalMsg.usage.input_tokens,
      completion: finalMsg.usage.output_tokens,
      total: finalMsg.usage.input_tokens + finalMsg.usage.output_tokens,
      durationMs: Date.now() - t0,
    };
    onEvent({ type: 'usage', usage });
    onEvent({ type: 'done', messageId: finalMsg.id });
  } catch (e: any) {
    onEvent({ type: 'error', reason: e?.message ?? String(e) });
  }
}
