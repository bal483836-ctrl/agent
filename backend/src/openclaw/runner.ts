/**
 * OpenClaw Skill Runner —— 启动子进程 + 解析 ACP-lite 协议 + 输出归档。
 *
 * 输出包结构（参考需求 3.3.4）：
 *   Outputs/<skillName>_<YYYYMMDD_HHMMSS>/
 *     ├── execution.log           # 完整事件流水
 *     ├── run_params.json         # 执行参数
 *     ├── inputs_snapshot.json    # 输入文件清单（path + sha256）
 *     └── (skill 自己产出的文件)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { LoadedSkill } from './registry.js';
import type { ClawEvent, ClawSkillCall } from './protocol.js';

export interface RunnerOpts {
  skill: LoadedSkill;
  call: ClawSkillCall;
  onEvent: (e: ClawEvent) => void;
}

export async function runSkill(opts: RunnerOpts): Promise<void> {
  const { skill, call, onEvent } = opts;
  const startedAt = Date.now();

  // 1) 归档输入快照（带 sha256）
  await fs.mkdir(call.outDir, { recursive: true });
  const snapshot = await buildInputsSnapshot(call.files);
  await fs.writeFile(
    path.join(call.outDir, 'inputs_snapshot.json'),
    JSON.stringify(snapshot, null, 2),
    'utf-8',
  );
  await fs.writeFile(
    path.join(call.outDir, 'run_params.json'),
    JSON.stringify(call.params, null, 2),
    'utf-8',
  );

  // 2) 边推送事件边写 execution.log
  const logPath = path.join(call.outDir, 'execution.log');
  const log = await fs.open(logPath, 'w');
  const writeLog = async (line: string) => log.write(line + '\n');
  await writeLog(`# Skill ${skill.id} | run ${call.runId} | started ${new Date().toISOString()}`);

  // 将 result.payload.outputs[].path 改写为相对 user outputs/ 根的相对路径
  // 这样前端可通过 /api/outputs/download?path=<run>/<file> 下载
  const userOutputsRoot = path.dirname(call.outDir);
  const rewriteResult = (e: ClawEvent): ClawEvent => {
    if (e.type !== 'result') return e;
    const payload = e.payload as any;
    if (Array.isArray(payload?.outputs)) {
      payload.outputs = payload.outputs.map((o: any) => {
        if (typeof o?.path === 'string' && o.path.startsWith(userOutputsRoot)) {
          return { ...o, path: path.relative(userOutputsRoot, o.path) };
        }
        return o;
      });
    }
    return e;
  };

  const wrapped = async (e: ClawEvent) => {
    await writeLog(JSON.stringify(e));
    onEvent(rewriteResult(e));
  };

  // 3) 启动子进程
  const scriptPath = path.join(skill.dir, skill.entry);
  const isPython = skill.entry.endsWith('.py');
  const cmd = isPython ? 'python3' : 'node';
  const args = [
    scriptPath,
    '--params', JSON.stringify(call.params),
    '--files', JSON.stringify(call.files),
    '--out', call.outDir,
  ];

  await wrapped({ type: 'progress', percent: 3, caption: `启动 ${skill.name} 进程…` });

  return new Promise<void>((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdoutBuf = '';
    child.stdout.on('data', async (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf-8');
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line) as ClawEvent;
          await wrapped(ev);
        } catch (e) {
          await writeLog(`# non-JSON: ${line}`);
        }
      }
    });
    child.stderr.on('data', async (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim();
      await wrapped({ type: 'log', level: 'warn', message: text });
    });
    child.on('error', async (err) => {
      await wrapped({ type: 'error', reason: err.message });
      await log.close();
      resolve();
    });
    child.on('exit', async (code) => {
      if (code === 0) {
        await wrapped({
          type: 'usage',
          usage: { prompt: 0, completion: 0, total: 0, durationMs: Date.now() - startedAt },
        });
        await wrapped({ type: 'done' });
      } else {
        await wrapped({ type: 'error', reason: `skill exit ${code}` });
      }
      await writeLog(`# exit ${code} | duration ${Date.now() - startedAt}ms`);
      await log.close();
      resolve();
    });
  });
}

async function buildInputsSnapshot(files: ClawSkillCall['files']) {
  const out: { key: string; name: string; size?: number; sha256?: string; path?: string }[] = [];
  for (const f of files) {
    if (!f.path) { out.push(f); continue; }
    try {
      const buf = await fs.readFile(f.path);
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      out.push({ key: f.key, name: f.name, size: buf.length, sha256: sha, path: f.path });
    } catch {
      out.push(f);
    }
  }
  return out;
}
