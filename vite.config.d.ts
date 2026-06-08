/**
 * 开发期 proxy 配置：
 *   /api  → 本地 backend (VITE_DEV_BACKEND，默认 http://localhost:8080)
 *   /ws   → 本地 backend WebSocket
 *   /ext  → 同事的 OpenClaw 后端 (VITE_EXTERNAL_DEV_BACKEND)
 *           路径前缀会被剥掉再转发，所以前端代码用 /ext/api/connect，实际打到 ${target}/api/connect
 */
declare const _default: import("vite").UserConfigFnObject;
export default _default;
