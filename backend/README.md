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

### 组织间（物理）
- 每个组织独占一套容器栈：K8s namespace 或独立 VM；本进程在该组织栈内运行
- 部署层职责，代码层不感知组织间存在

### 组织内每用户一个 Gateway（`src/gateway.ts`）
- 后端启动时实例化全局 `GatewayManager`
- 用户首次发请求 → `gatewayManager.getFor(tenant)` 按需创建 `Gateway` 对象
- 每个 `Gateway` 拥有：独立 Anthropic LLM 客户端、独占的数据目录、空闲计时
- 所有 authenticated 请求都会 `touch()` 当前用户的 Gateway，刷新生命周期
- 空闲 30 分钟未活动 → 自动回收（每分钟 GC 扫描）
- 调试端点 `GET /api/admin/gateways` 返回当前活跃实例列表

### 为什么不是真的"每用户一进程"？
- MVP 阶段：单 Node 进程持有多个 `Gateway` 对象，逻辑上隔离
- 生产：直接把 `Gateway` 类的职责放到独立容器，K8s 按 (orgId, userId) 起 pod
  - 触发器：用户登录 → 控制面 `kubectl run` 起新 pod → Service 路由
  - 销毁：pod 自带空闲生命周期（30 分钟无活动自动 terminate）
- 关于"OpenClaw"框架：当前实现采用同等架构模式（Gateway 抽象 + Skills 子进程协议），
  没有直接依赖该框架名，方便独立部署与维护

### 数据目录隔离
- `<DATA_DIR>/<orgId>/<userId>/`：所有持久化（会话/消息/工作区/outputs/temp）都在此根目录
- 防越权：`tenant.safeResolve()` 强制路径必须落在用户根目录下，越界即抛错

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

## 7. 工作区到底"勾选了"有什么用？

典型场景（按需求文档）：

> 我有一个 `imgs/` 文件夹，里面 20 张图，想批量提取拍摄时间。

操作：
1. 右侧工作区**勾选 `imgs/` 这个文件夹**（复选框）
2. 触发 `batch_extract` 技能（或自定义的图片信息提取 skill）
3. 后端 `resolveContextFiles()` 把文件夹展开为该文件夹下所有文件（最多 20 个）
4. 每个文件被解析为**绝对路径**传给 Python 子进程：
   ```json
   --files '[{"key":"f-xx","name":"a.jpg","path":"/data/.../a.jpg","size":12345}, ...]'
   ```
5. Python skill 直接打开这些路径处理
6. 输出归档到 `<DATA_DIR>/<orgId>/<userId>/outputs/<runId>/`，前端结果卡可下载

同样的机制也用于"聊天上下文"：
- 勾选若干文本文件 → 发送对话时 backend 读取每个小文本文件的前 8KB → 注入到 user message
- 这样模型真的"看到"了文件内容，不只是文件名

代码入口：
- `src/context.ts` `resolveContextFiles()`：folder → files 展开 + 路径解析 + 文本预览
- `src/runs.ts`：把 resolved files 传给 Python subprocess
- `src/messages.ts`：把 resolved files 的 preview 注入 LLM prompt

## 8. 完整跑通最小验证

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

## 9. 生产部署提示

- 每个组织独立栈：`docker-compose` 或 K8s namespace
- 后端前置 nginx，转发：
  - `/api/*` → backend:8080
  - `/ws/*` → backend:8080（启用 WebSocket 升级）
- `JWT_SECRET` 与 `ANTHROPIC_API_KEY` 用 K8s secret
- `DATA_DIR` 挂卷到持久化存储（云盘 / NFS / S3-FUSE）
- 文件层将来要换 MinIO 时：把 `files.ts` 的本地 FS 操作换成 MinIO SDK 即可，前端无感
- 日志：当前用 fastify 内置 pino；接入 ELK / Loki 时直接收集 stdout
