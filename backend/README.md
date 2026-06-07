# 量子链 · 后端

Fastify + TypeScript + Anthropic Claude SDK，承载前端所需的全部接口。

## 1. 能力

- 邮箱登录签发 JWT（mock 任意密码通过；可平滑替换为真实账号体系）
- 会话 CRUD（JSON 文件持久化，按 `(orgId, userId)` 物理隔离）
- 消息：历史拉取 + **SSE 流式调用真实 LLM（Claude）**
- 工作区：树形结构 + 节点 CRUD + 拖拽移动
- 文件：multipart 上传到本地 FS、临时上传 24h 清理、断点下载
- Skills：扫描 `SKILLS_DIR` 目录加载，每个子目录含 `manifest.json` + 入口脚本
- 技能执行：HTTP 启动 Python 子进程 + WS 推送 step / progress / result / usage
- 业务约束：单文件 ≤500 MB / 单次总量 ≤2 GB / 单批 ≤200 文件（前后端双重校验）

## 2. 多租户隔离

按需求："组织间物理隔离（独立 VM）+ 组织内用户每人一个 gateway"：

- **组织隔离（物理）**：每个组织独占一套容器栈，部署上由 K8s namespace 或独立 VM 完成
- **用户隔离（进程内）**：JWT 携带 `(orgId, userId)`，所有持久化路径都按 `<DATA_DIR>/<orgId>/<userId>/` 切分，互不可见
- 防越权：`tenant.safeResolve()` 强制所有路径必须落在用户根目录下

## 3. 启动

```bash
cp .env.example .env          # 至少填 ANTHROPIC_API_KEY
npm install
npm run dev                   # 开发，热重载
```

或者：

```bash
npm run build && npm start
```

## 4. 关键配置

| 环境变量 | 说明 |
| --- | --- |
| `PORT` | 监听端口（默认 8080） |
| `JWT_SECRET` | JWT 签名密钥，生产必须改 |
| `ANTHROPIC_API_KEY` | LLM 调用必需 |
| `ANTHROPIC_MODEL` | 模型 ID，默认 `claude-sonnet-4-6` |
| `DATA_DIR` | 数据根目录，默认 `./data` |
| `SKILLS_DIR` | Skills 根目录，默认 `./skills` |
| `MAX_FILE_BYTES` / `MAX_TOTAL_BYTES` / `MAX_FILES_PER_BATCH` | 上传约束 |
| `DEV_DEFAULT_*` | dev 模式默认用户身份 |

## 5. 目录结构

```
backend/
├── src/
│   ├── server.ts        # 入口
│   ├── config.ts        # 环境变量
│   ├── tenant.ts        # (orgId, userId) 路径隔离
│   ├── auth.ts          # JWT plugin + /auth/* 路由
│   ├── store.ts         # 会话 / 消息 / 工作区 JSON 持久化
│   ├── sessions.ts      # /sessions CRUD
│   ├── llm.ts           # Anthropic Claude 流式包装
│   ├── messages.ts      # SSE 路由（调 llm.ts）
│   ├── skills.ts        # 扫描 manifest + /skills + /intent/parse
│   ├── workspaces.ts    # 工作区树形 CRUD
│   ├── files.ts         # 上传/下载/临时
│   └── runs.ts          # 技能执行 + WebSocket
└── skills/
    └── csv_diff/
        ├── manifest.json
        └── main.py      # 示例：跨中心比对（纯标准库）
```

## 6. 加一个 Skill

把一个目录放进 `skills/`，包含：

```
skills/my_skill/
├── manifest.json
└── main.py
```

`manifest.json`：

```json
{
  "id": "my_skill",
  "name": "我的技能",
  "description": "干啥用",
  "category": "数据比对",
  "icon": "🧪",
  "entry": "main.py",
  "params": [
    { "key": "tol", "label": "容差", "type": "text", "value": "0.01" }
  ]
}
```

`main.py` 启动协议：

```
python3 main.py --params <json> --files <json> --out <dir>
```

通过 **stdout 逐行 JSON** 推送事件（参考 `skills/csv_diff/main.py`）：

```json
{"type":"step","label":"读文件","status":"running"}
{"type":"progress","percent":50,"caption":"..."}
{"type":"result","payload":{...}}
```

子进程退出码 0 后端自动补 `usage` + `done`；非 0 自动 `error`。

## 7. 完整跑通最小验证

```bash
# 1. 后端
cd backend && cp .env.example .env
echo "ANTHROPIC_API_KEY=sk-..." >> .env   # 填你的 key
npm install && npm run dev
# → http://localhost:8080  /api/health 200，hasLlmKey: true

# 2. 前端
cd .. && cp .env.example .env.local
echo "VITE_USE_MOCK=false" > .env.local
echo "VITE_API_BASE_URL=/api" >> .env.local
echo "VITE_DEV_BACKEND=http://localhost:8080" >> .env.local
npm install && npm run dev
# → http://localhost:5173

# 3. 在 UI 里：
#    - 默认会自动用 mock 用户登录（任意邮箱/密码均通过）
#    - 发消息：走真实 Claude SSE
#    - 上传文件：落盘到 backend/data/<org>/<user>/workspaces/<wsId>/
#    - 触发 csv_diff：通过 / 调起技能 → 执行 → WS 实时进度 → 结果卡
```

## 8. 生产部署提示

- 每个组织独立栈：`docker-compose` 或 K8s namespace
- 后端前置 nginx，转发：
  - `/api/*` → backend:8080
  - `/ws/*` → backend:8080（启用 WebSocket 升级）
- `JWT_SECRET` 与 `ANTHROPIC_API_KEY` 用 K8s secret
- `DATA_DIR` 挂卷到持久化存储（云盘 / NFS / S3-FUSE）
- 文件层将来要换 MinIO 时：把 `files.ts` 的本地 FS 操作换成 MinIO SDK 即可，前端无感
- 日志：当前用 fastify 内置 pino；接入 ELK / Loki 时直接收集 stdout
