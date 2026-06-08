/**
 * 同事 OpenClaw 后端的 HTTP 客户端。
 *
 * 与本地 backend 的差异：
 *  - 无 JWT，用户身份用 query/body 的 userID 字段传
 *  - SSE 流式接口是 GET（带 query），不是 POST
 *  - 返回数据是 OpenClaw 原始结构，需要在上层 normalize
 */
import { EXTERNAL_API_BASE } from '../env';

export class ExternalApiError extends Error {
  status: number;
  payload?: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

interface ReqOpts extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  raw?: boolean;
}

function buildUrl(path: string, query?: ReqOpts['query']): string {
  const base = EXTERNAL_API_BASE.endsWith('/')
    ? EXTERNAL_API_BASE.slice(0, -1)
    : EXTERNAL_API_BASE;
  const p = path.startsWith('/') ? path : `/${path}`;
  let url = `${base}${p}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      params.set(k, String(v));
    }
    const q = params.toString();
    if (q) url += `?${q}`;
  }
  return url;
}

export async function extRequest<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const resp = await fetch(url, {
    ...opts,
    headers,
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });
  if (!resp.ok) {
    let payload: unknown;
    try { payload = await resp.json(); } catch { /* ignore */ }
    throw new ExternalApiError(`HTTP ${resp.status} ${url}`, resp.status, payload);
  }
  if (opts.raw) return resp as unknown as T;
  if (resp.status === 204) return undefined as unknown as T;
  // 后端返回 OpenClaw 原始结构 —— 先 text 再 JSON.parse，避免空响应崩
  const text = await resp.text();
  if (!text) return undefined as unknown as T;
  try { return JSON.parse(text) as T; }
  catch { return text as unknown as T; }
}

/** 构造 SSE 流式 URL（GET，带 query） */
export function buildExtSseUrl(path: string, query: Record<string, string>): string {
  return buildUrl(path, query);
}
