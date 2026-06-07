/**
 * OpenClaw Gateway 协议（ACP-lite）
 *
 * Skills 子进程与 Gateway 之间通过 stdout 逐行 JSON 通信。
 * 这是 Anthropic Claude Skills + OpenClaw Office 架构在本工程的最小实现。
 */

export type ClawEventType =
  | 'progress' | 'step' | 'log' | 'result' | 'usage' | 'error' | 'done';

export interface ClawProgressEvent { type: 'progress'; percent: number; caption: string }
export interface ClawStepEvent     { type: 'step'; label: string; status: 'done' | 'running' | 'pending' | 'failed' }
export interface ClawLogEvent      { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
export interface ClawResultEvent   { type: 'result'; payload: Record<string, unknown> }
export interface ClawUsageEvent    { type: 'usage'; usage: { prompt: number; completion: number; total: number; durationMs: number } }
export interface ClawErrorEvent    { type: 'error'; reason: string; suggestion?: string }
export interface ClawDoneEvent     { type: 'done' }

export type ClawEvent =
  | ClawProgressEvent | ClawStepEvent | ClawLogEvent
  | ClawResultEvent | ClawUsageEvent | ClawErrorEvent | ClawDoneEvent;

/** Skill 入口参数（传给子进程的 CLI 参数） */
export interface ClawSkillCall {
  skillId: string;
  runId: string;
  params: Record<string, unknown>;
  files: { key: string; name: string; path?: string; size?: number }[];
  outDir: string;
}
