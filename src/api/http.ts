import { API_BASE, WS_BASE } from './env';

/* ===== JWT 存取 ===== */

const TOKEN_KEY = 'qc_jwt';
const USER_ID_KEY = 'qc_user_id';
const USER_DEPT_KEY = 'qc_user_dept';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_DEPT_KEY);
}

/* ===== 身份（gateway 用 userID + dept 替代 JWT 解析） ===== */
export function getUserID(): string | null { return localStorage.getItem(USER_ID_KEY); }
export function setUserID(id: string) { localStorage.setItem(USER_ID_KEY, id); }
export function getUserDept(): string | null { return localStorage.getItem(USER_DEPT_KEY); }
export function setUserDept(d: string) { localStorage.setItem(USER_DEPT_KEY, d); }

/* ===== 全局 401 处理 ===== */

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => {
  clearToken();
  // 默认行为：刷新页面，由 LoginGate 处理
  window.location.reload();
};
export function setUnauthorizedHandler(h: UnauthorizedHandler) {
  onUnauthorized = h;
}

/* ===== 错误类型 ===== */

export class ApiError extends Error {
  status: number;
  payload?: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

/* ===== 核心 fetch 包装 ===== */

interface ReqOpts extends Omit<RequestInit, 'body'> {
  body?: unknown;        // 自动 JSON 序列化
  query?: Record<string, string | number | boolean | undefined>;
  raw?: boolean;         // true 时不解析为 JSON
}

export async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const init: RequestInit = {
    ...opts,
    headers,
    body: opts.body == null
      ? undefined
      : opts.body instanceof FormData
        ? (delete headers['Content-Type'], opts.body)
        : JSON.stringify(opts.body),
  };

  const resp = await fetch(url, init);
  if (resp.status === 401) {
    onUnauthorized();
    throw new ApiError('未登录或登录已过期', 401);
  }
  if (!resp.ok) {
    let payload: unknown;
    try { payload = await resp.json(); } catch { /* ignore */ }
    throw new ApiError(`HTTP ${resp.status}`, resp.status, payload);
  }
  if (opts.raw) return resp as unknown as T;
  if (resp.status === 204) return undefined as unknown as T;
  return (await resp.json()) as T;
}

function buildUrl(path: string, query?: ReqOpts['query']): string {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
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

/* ===== WebSocket / SSE 工具 ===== */

/** 构造完整 WS URL（带 token） */
export function buildWsUrl(path: string): string {
  const base = WS_BASE || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  const p = path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  return `${base}${p}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

/** SSE 流式响应解析（fetch + ReadableStream）。回调收到每条 SSE event。 */
export async function streamSSE(
  path: string,
  body: unknown,
  onEvent: (event: { event: string; data: string }) => void,
  abort?: AbortSignal,
): Promise<void> {
  const url = buildUrl(path);
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: abort,
  });
  if (resp.status === 401) { onUnauthorized(); throw new ApiError('未登录', 401); }
  if (!resp.ok || !resp.body) throw new ApiError(`HTTP ${resp.status}`, resp.status);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  // 按 SSE 规范，事件由空行分隔；每行可能是 event: / data: 前缀
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) {
        onEvent({ event, data: dataLines.join('\n') });
        currentEvent = event;
      }
    }
  }
  void currentEvent;
}

/**
 * GET 方式的 SSE 流（用于 gateway 的 /api/chat/stream）。
 * EventSource 不支持自定义 header，gateway 也无需鉴权 header，正好可用。
 * 兼容三种情况：
 *  - 默认 message 事件
 *  - 命名事件（先用 onmessage 兜底，再尝试 listen 常见名）
 *  - 普通文本（不一定是 JSON）
 */
export function streamSSEGet(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  onEvent: (event: { event: string; data: string }) => void,
  onError?: (err: unknown) => void,
): { close: () => void } {
  const url = buildUrl(path, query);
  const es = new EventSource(url);
  es.onmessage = (ev) => onEvent({ event: 'message', data: ev.data });
  // 常见自定义事件名，统一转给同一回调
  const named = ['delta', 'text-delta', 'chunk', 'token', 'message', 'usage', 'done', 'error', 'tool-call', 'end'];
  for (const name of named) {
    es.addEventListener(name, (ev: MessageEvent) => onEvent({ event: name, data: ev.data }));
  }
  es.onerror = (e) => {
    // EventSource 在流自然结束时也会触发 error，统一交由上层判定
    if (onError) onError(e);
  };
  return { close: () => es.close() };
}
