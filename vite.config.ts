import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * 开发期 proxy 配置：
 *   /api  → 本地 backend (VITE_DEV_BACKEND，默认 http://localhost:8080)
 *   /ws   → 本地 backend WebSocket
 *   /ext  → 同事的 OpenClaw 后端 (VITE_EXTERNAL_DEV_BACKEND)
 *           路径前缀会被剥掉再转发，所以前端代码用 /ext/api/connect，实际打到 ${target}/api/connect
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localBackend = env.VITE_DEV_BACKEND || 'http://localhost:8080';
  const externalBackend = env.VITE_EXTERNAL_DEV_BACKEND || 'http://47.116.192.78:8080';
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: localBackend, changeOrigin: true },
        '/ws': { target: localBackend.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
        '/ext': {
          target: externalBackend,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ext/, ''),
        },
      },
    },
  };
});
