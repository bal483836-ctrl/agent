/**
 * 量子链后端入口。
 * Fastify + JWT + CORS + multipart + websocket，模块化注册各路由。
 */
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { registerAuth } from './auth.js';
import { registerSessions } from './sessions.js';
import { registerMessages } from './messages.js';
import { registerSkills } from './skills.js';
import { registerWorkspaces } from './workspaces.js';
import { registerFiles } from './files.js';
import { registerRuns } from './runs.js';

const app = Fastify({
  logger: { level: config.nodeEnv === 'production' ? 'info' : 'debug' },
});

await app.register(cors, { origin: true, credentials: true });
await app.register(multipart, {
  limits: {
    fileSize: config.upload.maxFileBytes,
    files: config.upload.maxFilesPerBatch,
  },
});
await app.register(websocket);

await registerAuth(app);
await registerSessions(app);
await registerMessages(app);
await registerSkills(app);
await registerWorkspaces(app);
await registerFiles(app);
await registerRuns(app);

// 启动 24h 临时文件清理
const { startTempCleanup } = await import('./cleanup.js');
startTempCleanup();

app.get('/api/health', async () => ({
  status: 'ok',
  time: new Date().toISOString(),
  llm: {
    provider: config.llm.provider,
    model: config.llm.model,
    hasKey: Boolean(config.llm.apiKey),
  },
}));

/** 管理：列出当前活跃的 per-user gateway 实例（用于观察隔离与生命周期） */
app.get('/api/admin/gateways', async () => {
  const { gatewayManager } = await import('./gateway.js');
  return { instances: gatewayManager.list() };
});

/** 管理：查看当天审计日志（每用户仅看自己的） */
app.get('/api/admin/audit', async (req) => {
  const tenant = (req as any).tenant;
  const fsp = await import('node:fs/promises');
  const path = await import('node:path');
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(
    config.paths.dataDir,
    tenant.orgId.replace(/[^A-Za-z0-9_-]/g, '_'),
    '_audit', `${day}.jsonl`,
  );
  try {
    const data = await fsp.readFile(file, 'utf-8');
    const lines = data.split('\n').filter(Boolean);
    return { records: lines.slice(-100).map((l) => JSON.parse(l)).filter((r) => r.userId === tenant.userId) };
  } catch { return { records: [] }; }
});

const port = config.port;
try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`量子链后端已启动: http://localhost:${port}`);
  console.log(`  LLM:    provider=${config.llm.provider} · model=${config.llm.model} · ${config.llm.apiKey ? '已配置 API key' : '⚠ 未配置 API key，对话功能不可用'}`);
  console.log(`  数据:   ${config.paths.dataDir}`);
  console.log(`  Skills: ${config.paths.skillsDir}`);
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
