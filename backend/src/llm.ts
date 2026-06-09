/**
 * LLM 适配器 — 同时支持 OpenAI 兼容协议（DeepSeek/Kimi/Qwen…）与 Anthropic Claude。
 *
 * 通过 Gateway 持有的 SDK 实例发起调用：
 *   - streamReply(): 流式产出 text-delta / tool-call / usage 事件
 *   - 上下文：历史消息 + 系统提示 + 用户已选文件的元信息和部分内容
 *
 * 模型回复中如包含 `<tool_call>{ skillId, params, reason }</tool_call>` 段，
 * 视为请求执行某个 skill，由上层据此构造 skill-confirm 推给前端。
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
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
  /** markdown 类技能的 SKILL.md 正文，可选。若提供将完整注入到 system prompt。 */
  instructions?: string;
}

/** 注入到对话的上下文文件项 */
export interface CtxFile {
  key: string;
  name: string;
  type: 'folder' | 'file';
  fsPath?: string;
  preview?: string;
  size?: number;
}

function buildSystemPrompt(skills: SkillSummary[]): string {
  if (!skills.length) return config.llm.systemPrompt;
  const listing = skills
    .map((s) => `- ${s.id}: ${s.name} — ${s.description}`)
    .join('\n');
  const callHint = `如需调用其中一个 Skill，在回答末尾用一行输出：\n<tool_call>{"skillId":"<id>","reason":"原因","params":{...}}</tool_call>`;
  const instructionsBlocks = skills
    .filter((s) => s.instructions && s.instructions.trim())
    .map((s) => `<<<SKILL id="${s.id}" name="${s.name}">>>\n${s.instructions!.trim()}\n<<<END SKILL>>>`)
    .join('\n\n');
  const instructionsSection = instructionsBlocks
    ? `\n\n[SKILL INSTRUCTIONS]\n以下技能附带详细操作说明。当用户请求匹配某个技能的触发场景时，请严格按对应说明执行。\n${instructionsBlocks}\n[END SKILL INSTRUCTIONS]`
    : '';
  return `${config.llm.systemPrompt}\n\n[AVAILABLE SKILLS]\n${listing}\n[END SKILLS]\n${callHint}${instructionsSection}`;
}

function buildUserMessageContent(userText: string, ctxFiles: CtxFile[]): string {
  if (!ctxFiles.length) return userText;
  let ctxBlock = `[CONTEXT FILES]\n${ctxFiles
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
  return ctxBlock + userText;
}

function historyToMessages(
  history: PersistedMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of history) {
    if (h.role === 'user' && h.type === 'text' && typeof h.content === 'string') {
      msgs.push({ role: 'user', content: h.content });
    } else if (h.role === 'assistant' && h.type === 'text' && typeof h.content === 'string') {
      msgs.push({ role: 'assistant', content: h.content });
    }
  }
  return msgs;
}

function parseToolCall(full: string, onEvent: (e: StreamEvent) => void) {
  const m = full.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!m) return;
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

export async function streamReply(opts: {
  gateway: Gateway;
  history: PersistedMessage[];
  userText: string;
  ctxFiles: CtxFile[];
  skills: SkillSummary[];
  onEvent: (e: StreamEvent) => void;
}): Promise<void> {
  const { gateway, onEvent } = opts;
  const t0 = Date.now();

  if (!config.llm.apiKey) {
    onEvent({ type: 'error', reason: '未配置 LLM API key（LLM_API_KEY / DEEPSEEK_API_KEY / ANTHROPIC_API_KEY 之一）' });
    return;
  }

  try {
    if (gateway.provider === 'anthropic') {
      await streamAnthropic(opts, t0);
    } else {
      await streamOpenAICompat(opts, t0);
    }
  } catch (e: any) {
    onEvent({ type: 'error', reason: e?.message ?? String(e) });
  }
}

/* ===================== OpenAI 兼容（DeepSeek / OpenAI / 其他） ===================== */

async function streamOpenAICompat(
  opts: { gateway: Gateway; history: PersistedMessage[]; userText: string; ctxFiles: CtxFile[]; skills: SkillSummary[]; onEvent: (e: StreamEvent) => void },
  t0: number,
) {
  const client = opts.gateway.llm as OpenAI;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(opts.skills) },
    ...historyToMessages(opts.history) as OpenAI.ChatCompletionMessageParam[],
    { role: 'user', content: buildUserMessageContent(opts.userText, opts.ctxFiles) },
  ];

  const stream = await client.chat.completions.create({
    model: config.llm.model,
    messages,
    max_tokens: 1024,
    stream: true,
    stream_options: { include_usage: true },
  });

  let full = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let messageId = '';

  for await (const chunk of stream) {
    messageId = chunk.id || messageId;
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      opts.onEvent({ type: 'text-delta', chunk: delta });
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? 0;
      completionTokens = chunk.usage.completion_tokens ?? 0;
    }
  }

  parseToolCall(full, opts.onEvent);

  opts.onEvent({
    type: 'usage',
    usage: {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
      durationMs: Date.now() - t0,
    },
  });
  opts.onEvent({ type: 'done', messageId });
}

/* ===================== Anthropic Claude ===================== */

async function streamAnthropic(
  opts: { gateway: Gateway; history: PersistedMessage[]; userText: string; ctxFiles: CtxFile[]; skills: SkillSummary[]; onEvent: (e: StreamEvent) => void },
  t0: number,
) {
  const client = opts.gateway.llm as Anthropic;

  const stream = await client.messages.stream({
    model: config.llm.model,
    max_tokens: 1024,
    system: buildSystemPrompt(opts.skills),
    messages: [
      ...historyToMessages(opts.history),
      { role: 'user', content: buildUserMessageContent(opts.userText, opts.ctxFiles) },
    ],
  });

  let full = '';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      const chunk = ev.delta.text;
      full += chunk;
      opts.onEvent({ type: 'text-delta', chunk });
    }
  }

  parseToolCall(full, opts.onEvent);

  const finalMsg = await stream.finalMessage();
  opts.onEvent({
    type: 'usage',
    usage: {
      prompt: finalMsg.usage.input_tokens,
      completion: finalMsg.usage.output_tokens,
      total: finalMsg.usage.input_tokens + finalMsg.usage.output_tokens,
      durationMs: Date.now() - t0,
    },
  });
  opts.onEvent({ type: 'done', messageId: finalMsg.id });
}
