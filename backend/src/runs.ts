/**
 * 技能执行：
 *  - POST /api/skills/:id/run  → 启动子进程，返回 runId
 *  - WS  /ws/runs/:runId/events → 推送 step / progress / result / usage / done
 *
 * 关键：fileKeys 在本服务端解析为**绝对路径**后再传给 Python，保证子进程能直接打开文件。
 *
 * 子进程通信约定（stdout 逐行 JSON）：
 *  {"type":"step","label":"...","status":"running"}
 *  {"type":"progress","percent":30,"caption":"..."}
 *  {"type":"result","payload":{...}}
 */
import { FastifyInstance } from 'fastify';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { getSkill } from './skills.js';
import { outputsRoot, type TenantCtx } from './tenant.js';
import { gatewayManager } from './gateway.js';
import { resolveContextFiles } from './context.js';

interface RunSession {
  runId: string;
  tenant: TenantCtx;
  events: any[];
  subscribers: Set<(e: any) => void>;
  done: boolean;
}

const runs = new Map<string, RunSession>();

export async function registerRuns(app: FastifyInstance) {
  app.post<{
    Params: { id: string };
    Body: {
      params?: Record<string, unknown>;
      fileKeys?: string[];                                  // 兼容老调用
      contextFiles?: { key: string; name: string; type: 'folder' | 'file' }[];
    };
  }>(
    '/api/skills/:id/run',
    async (req, reply) => {
      const tenant = (req as any).tenant as TenantCtx;
      await gatewayManager.getFor(tenant);              // touch gateway
      const skill = await getSkill(req.params.id);
      if (!skill) { reply.code(404).send({ message: 'skill not found' }); return; }

      const runId = `run-${nanoid(10)}`;
      const session: RunSession = {
        runId, tenant, events: [], subscribers: new Set(), done: false,
      };
      runs.set(runId, session);

      // 解析勾选项 → 拿到含 fsPath 的真实文件清单
      const inputs = req.body?.contextFiles
        ?? (req.body?.fileKeys ?? []).map((k) => ({ key: k, name: k, type: 'file' as const }));
      const resolved = await resolveContextFiles(tenant, inputs);
      const filesArg = resolved
        .filter((f) => f.fsPath)
        .map((f) => ({ key: f.key, name: f.name, path: f.fsPath, size: f.size }));

      const outDir = outputsRoot(tenant, runId);
      await fs.mkdir(outDir, { recursive: true });

      startSkillProcess(
        session, skill.dir, skill.entry,
        req.body?.params ?? {}, filesArg, outDir,
      );

      return { runId };
    },
  );

  // WS（@fastify/websocket v10：handler 第一参是 socket）
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
    setTimeout(() => runs.delete(session.runId), 60_000);
  }
}

function startSkillProcess(
  session: RunSession,
  skillDir: string,
  entry: string,
  params: Record<string, unknown>,
  files: { key: string; name: string; path?: string; size?: number }[],
  outDir: string,
) {
  const scriptPath = path.join(skillDir, entry);
  const startedAt = Date.now();

  pushEvent(session, { type: 'progress', percent: 5, caption: `启动 skill 进程…（输入 ${files.length} 个文件）` });

  const child = spawn('python3', [
    scriptPath,
    '--params', JSON.stringify(params),
    '--files', JSON.stringify(files),
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
    console.warn(`[skill ${session.runId}]`, chunk.toString('utf-8').trim());
  });
  child.on('error', (err) => pushEvent(session, { type: 'error', reason: err.message }));
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
