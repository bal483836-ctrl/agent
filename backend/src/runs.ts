/**
 * 技能执行路由：HTTP 启动 + WebSocket 推送 OpenClaw 事件。
 *
 * - POST /api/skills/:id/run    → 启动子进程，返回 runId
 * - WS  /ws/runs/:runId/events  → 实时推送 step / progress / result / usage / done
 *
 * 结果归档命名按需求 3.3.4：Outputs/<skillName>_YYYYMMDD_HHMMSS/
 * 用户可在参数 outputPath 中指定相对工作区的目标目录（可选）。
 */
import { FastifyInstance } from 'fastify';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { getSkillForOrg } from './skills.js';
import { outputsRoot, type TenantCtx, safeResolve } from './tenant.js';
import { gatewayManager } from './gateway.js';
import { resolveContextFiles } from './context.js';
import { runSkill } from './openclaw/runner.js';
import type { ClawEvent } from './openclaw/protocol.js';
import { audit } from './audit.js';

interface RunSession {
  runId: string;
  tenant: TenantCtx;
  events: ClawEvent[];
  subscribers: Set<(e: ClawEvent) => void>;
  done: boolean;
}

const runs = new Map<string, RunSession>();

/**
 * 同会话失败计数（用于"连续 2 次失败 → 转人工"提示）
 *  key: sessionId + ':' + skillId
 */
const failureCounter = new Map<string, number>();
export function getRecentFailureCount(sessionId: string, skillId: string): number {
  return failureCounter.get(`${sessionId}:${skillId}`) ?? 0;
}

export async function registerRuns(app: FastifyInstance) {
  app.post<{
    Params: { id: string };
    Body: {
      params?: Record<string, unknown>;
      fileKeys?: string[];
      contextFiles?: { key: string; name: string; type: 'folder' | 'file' }[];
      /** 可选：相对工作区根目录的输出路径，例如 "MyReports" */
      outputPath?: string;
      /** 可选：当前会话 id，用于失败计数 */
      sessionId?: string;
    };
  }>(
    '/api/skills/:id/run',
    async (req, reply) => {
      const tenant = (req as any).tenant as TenantCtx;
      await gatewayManager.getFor(tenant);

      const skill = await getSkillForOrg(tenant.orgId, req.params.id);
      if (!skill) { reply.code(404).send({ message: 'skill not found' }); return; }

      const runId = `run-${nanoid(10)}`;
      const session: RunSession = {
        runId, tenant, events: [], subscribers: new Set(), done: false,
      };
      runs.set(runId, session);

      // 解析勾选文件
      const inputs = req.body?.contextFiles
        ?? (req.body?.fileKeys ?? []).map((k) => ({ key: k, name: k, type: 'file' as const }));
      const resolved = await resolveContextFiles(tenant, inputs);
      const filesArg = resolved
        .filter((f) => f.fsPath)
        .map((f) => ({ key: f.key, name: f.name, path: f.fsPath, size: f.size }));

      // 决定输出目录
      const ts = stamp();
      const outName = `${slug(skill.name)}_${ts}`;
      const outDir = req.body?.outputPath
        ? safeResolve(tenant, 'workspaces', req.body.outputPath, outName)
        : outputsRoot(tenant, outName);
      await fs.mkdir(outDir, { recursive: true });

      // 审计：启动
      const auditInputs = filesArg.map((f) => ({ key: f.key, name: f.name }));
      await audit(tenant, {
        action: 'skill.run.start',
        skillId: skill.id, runId,
        inputs: auditInputs, params: req.body?.params,
        status: 'pending',
      });

      // 异步跑
      const sessionId = req.body?.sessionId;
      void runSkill({
        skill,
        call: {
          skillId: skill.id, runId,
          params: req.body?.params ?? {},
          files: filesArg, outDir,
        },
        onEvent: (e) => pushEvent(session, e),
      }).then(async () => {
        const lastErr = session.events.find((e) => e.type === 'error');
        const status: 'success' | 'failure' = lastErr ? 'failure' : 'success';
        await audit(tenant, {
          action: 'skill.run.end', skillId: skill.id, runId,
          status, reason: lastErr?.type === 'error' ? lastErr.reason : undefined,
          outputRefs: [path.basename(outDir)],
        });
        if (sessionId) {
          const key = `${sessionId}:${skill.id}`;
          if (status === 'failure') failureCounter.set(key, (failureCounter.get(key) ?? 0) + 1);
          else failureCounter.delete(key);
        }
      });

      return { runId, outDir: path.basename(outDir) };
    },
  );

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
      const handler = (e: ClawEvent) => socket.send(JSON.stringify(e));
      session.subscribers.add(handler);
      socket.on('close', () => session.subscribers.delete(handler));
    },
  );

  /** 查询某 skill 在某会话的近期失败次数（前端用来决定是否提示"转人工"） */
  app.get<{ Querystring: { sessionId: string; skillId: string } }>(
    '/api/runs/failure-count',
    async (req) => {
      const { sessionId, skillId } = req.query;
      return { count: getRecentFailureCount(sessionId, skillId) };
    },
  );
}

function pushEvent(session: RunSession, e: ClawEvent) {
  session.events.push(e);
  for (const sub of session.subscribers) sub(e);
  if (e.type === 'done' || e.type === 'error') {
    session.done = true;
    setTimeout(() => runs.delete(session.runId), 60_000);
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function slug(s: string): string {
  return s.replace(/[\s\\/]+/g, '_').replace(/[^\w\-一-龥]/g, '');
}
