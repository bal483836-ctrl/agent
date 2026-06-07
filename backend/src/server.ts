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

app.get('/api/health', async () => ({
  status: 'ok', time: new Date().toISOString(),
  hasLlmKey: Boolean(config.llm.apiKey),
}));

const port = config.port;
try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`量子链后端已启动: http://localhost:${port}`);
  console.log(`  LLM:    ${config.llm.apiKey ? '已配置' : '⚠ 未配置 ANTHROPIC_API_KEY，对话功能不可用'}`);
  console.log(`  数据:   ${config.paths.dataDir}`);
  console.log(`  Skills: ${config.paths.skillsDir}`);
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
