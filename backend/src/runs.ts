/**
 * 技能执行：HTTP 启动 + WebSocket 推送进度。
 *
 * 流程：
 *  1) POST /api/skills/:id/run  → 启动子进程跑 Python，返回 runId
 *  2) WS  /ws/runs/:runId/events → 推送 step / progress / result / usage / done
 *
 * 子进程通信约定：
 *  - skill 脚本通过 stdout 输出**逐行 JSON**，每行一个事件
 *    { "type": "step", "label": "...", "status": "running" }
 *    { "type": "progress", "percent": 30, "caption": "..." }
 *    { "type": "result", "payload": { ... } }
 */
import { FastifyInstance } from 'fastify';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { getSkill } from './skills.js';
import { outputsRoot, type TenantCtx } from './tenant.js';

interface RunSession {
  runId: string;
  tenant: TenantCtx;
  events: any[];                          // 已发出事件缓存（迟到的订阅者可补订）
  subscribers: Set<(e: any) => void>;
  done: boolean;
}

const runs = new Map<string, RunSession>();

export async function registerRuns(app: FastifyInstance) {
  // 启动一次执行
  app.post<{ Params: { id: string }; Body: { params?: Record<string, unknown>; fileKeys?: string[] } }>(
    '/api/skills/:id/run',
    async (req, reply) => {
      const tenant = (req as any).tenant as TenantCtx;
      const skill = await getSkill(req.params.id);
      if (!skill) { reply.code(404).send({ message: 'skill not found' }); return; }

      const runId = `run-${nanoid(10)}`;
      const session: RunSession = {
        runId, tenant, events: [], subscribers: new Set(), done: false,
      };
      runs.set(runId, session);

      // 异步启动子进程
      const outDir = outputsRoot(tenant, runId);
      await fs.mkdir(outDir, { recursive: true });
      startSkillProcess(session, skill.dir, skill.entry, req.body?.params ?? {}, req.body?.fileKeys ?? [], outDir);

      return { runId };
    },
  );

  // WS 订阅（@fastify/websocket v10+ 签名：handler 第一参是 socket 本身）
  app.get<{ Params: { runId: string } }>(
    '/ws/runs/:runId/events',
    { websocket: true } as any,
    (socket: any, req: any) => {
      const session = runs.get(req.params.runId);
      if (!session) {
        socket.send(JSON.stringify({ type: 'error', reason: 'run not found' }));
        socket.close();
        return;
      }
      // 补发已有事件（迟到订阅者可拿到完整历史）
      for (const ev of session.events) socket.send(JSON.stringify(ev));
      if (session.done) { socket.close(); return; }
      const handler = (e: any) => socket.send(JSON.stringify(e));
      session.subscribers.add(handler);
      socket.on('close', () => session.subscribers.delete(handler));
    },
  );
}

function pushEvent(session: RunSession, e: any) {
  session.events.push(e);
  for (const sub of session.subscribers) sub(e);
  if (e.type === 'done' || e.type === 'error') {
    session.done = true;
    setTimeout(() => runs.delete(session.runId), 60_000); // 1 分钟后清理
  }
}

function startSkillProcess(
  session: RunSession,
  skillDir: string,
  entry: string,
  params: Record<string, unknown>,
  fileKeys: string[],
  outDir: string,
) {
  // 入口默认是 main.py；可扩展为 .js
  const scriptPath = path.join(skillDir, entry);
  const startedAt = Date.now();

  pushEvent(session, { type: 'progress', percent: 5, caption: '启动 skill 进程…' });

  const child = spawn('python3', [
    scriptPath,
    '--params', JSON.stringify(params),
    '--files', JSON.stringify(fileKeys),
    '--out', outDir,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let buf = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf-8');
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { pushEvent(session, JSON.parse(line)); }
      catch { /* ignore non-JSON */ }
    }
  });
  child.stderr.on('data', (chunk: Buffer) => {
    // 子进程 stderr 仅打到服务端日志
    console.warn(`[skill ${session.runId}]`, chunk.toString('utf-8').trim());
  });

  child.on('error', (err) => {
    pushEvent(session, { type: 'error', reason: err.message });
  });

  child.on('exit', (code) => {
    if (code === 0) {
      pushEvent(session, {
        type: 'usage',
        usage: { prompt: 0, completion: 0, total: 0, durationMs: Date.now() - startedAt },
      });
      pushEvent(session, { type: 'done' });
    } else {
      pushEvent(session, { type: 'error', reason: `skill exit ${code}` });
    }
  });
}
