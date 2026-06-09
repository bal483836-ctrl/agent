import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
/**
 * 开发期把 /api 和 /ws 代理到本地后端，避免跨域。
 * 后端地址通过 VITE_DEV_BACKEND 环境变量配置（默认 http://localhost:8080）。
 */
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var backend = env.VITE_DEV_BACKEND || 'http://47.116.192.78:8080';
    return {
        plugins: [react()],
        resolve: {
            alias: { '@': path.resolve(__dirname, 'src') },
        },
        server: {
            port: 5173,
            host: true,
            proxy: {
                '/api': { target: backend, changeOrigin: true },
                '/ws': { target: backend.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
            },
        },
    };
});
