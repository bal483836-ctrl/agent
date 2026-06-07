# 量子链 Quantum Chain

面向疫苗临床试验数据管理与安全监察场景的 LLM 助手。

仓库包含：
- **前端**：根目录（本 README），React + TypeScript + Ant Design
- **后端**：`backend/`，Fastify + TypeScript + Anthropic Claude SDK

## 一键跑通

```bash
# 后端
cd backend
cp .env.example .env
# 编辑 .env，至少填 ANTHROPIC_API_KEY=sk-...
npm install
npm run dev           # http://localhost:8080

# 另开一个终端 → 前端
cd ..
cp .env.example .env.local
# .env.local 里设置：
#   VITE_USE_MOCK=false
#   VITE_API_BASE_URL=/api
#   VITE_DEV_BACKEND=http://localhost:8080
npm install
npm run dev           # http://localhost:5173
```

打开浏览器即可进入 UI，登录页面输入任意邮箱/密码均通过（mock 鉴权），登录后即可：
- 发送消息走真实 Claude 流式回复
- 上传文件落到 `backend/data/<orgId>/<userId>/`
- 触发 `csv_diff` Skill，看到实时 WS 进度 + 结果卡

后端能力与协议详见 [`backend/README.md`](./backend/README.md)，接口契约详见 [`BACKEND_CONTRACT.md`](./BACKEND_CONTRACT.md)。

---

## 前端

---

## 1. 技术栈

| 类别 | 选型 |
| --- | --- |
| 构建 | Vite 5 |
| 语言 | TypeScript 5 |
| 框架 | React 18 |
| UI 库 | Ant Design 5 + `@ant-design/icons` |
| 状态管理 | Zustand 4 |
| 工具 | dayjs、nanoid |

---

## 2. 启动 / 构建

```bash
npm install
cp .env.example .env.local        # 调整环境变量（默认 mock 模式）
npm run dev      # 开发：http://localhost:5173
npm run build    # 生产构建产物在 dist/
npm run preview  # 预览生产产物
```

Node ≥ 18。

### 切换 mock / 真后端

`.env.local`：

```
VITE_USE_MOCK=true              # 默认离线 mock
# VITE_USE_MOCK=false            # 连真后端
VITE_API_BASE_URL=/api
VITE_DEV_BACKEND=http://localhost:8080  # vite proxy 目标
```

切换不需要改任何业务代码，所有副作用都收敛在 `src/api/`。

---

## 3. 与后端对接

**接口契约见 [`BACKEND_CONTRACT.md`](./BACKEND_CONTRACT.md)**（按资源逐个列了请求/响应示例）。

`src/api/` 中每个文件都定义了 `interface XxxApi`，并提供 `mockApi` 和 `realApi` 两种实现，由 `USE_MOCK` 开关选择：

```
src/api/
├── env.ts          # 环境开关
├── http.ts         # fetch 封装 + JWT + 401 拦截 + SSE 流解析 + WS URL 构造
├── types.ts        # API 专属类型（LoginResponse, StreamEvent...）
├── auth.ts
├── sessions.ts
├── messages.ts     # SSE 流式回复
├── skills.ts
├── workspaces.ts
├── files.ts        # 上传 + SHA-256 + 业务约束
├── runs.ts         # 技能执行 + WS 进度
└── index.ts        # `api.{auth,sessions,messages,skills,workspaces,files,runs}` 总出口
```

后端就绪时：

1. 先实现 `BACKEND_CONTRACT.md` 中的任意接口；
2. 把 `.env.local` 中 `VITE_USE_MOCK` 设为 `false`；
3. **业务代码不动**，前端会自动走 real 实现。
4. 未实现的接口可保留 mock —— 因为 `mockApi` / `realApi` 是按资源粒度的，可单独切换（在 `src/api/<resource>.ts` 中临时硬编码 `mockApi`）。

## 4. 目录结构

```
src/
├── App.tsx                              # 三栏布局根（左折叠 + 右拖宽）
├── main.tsx                             # 全局 ConfigProvider / 主题 / zh_CN
├── styles/global.css                    # 仅放与布局/气泡相关的全局样式
│
├── types/index.ts                       # 业务领域类型集中定义
├── mock/data.ts                         # 全部 mock 数据（替换为 API 即可）
├── hooks/useChatStore.ts                # 全局状态 + 业务动作（关键文件）
│
└── components/
    ├── TopBar.tsx                       # 顶部品牌栏 + 头像入口
    ├── UserProfileModal.tsx             # 用户信息弹层（角色 + 组织）
    │
    ├── Sidebar/
    │   └── ChatHistory.tsx              # 左侧历史对话（搜索/重命名/删除）
    │
    ├── Chat/
    │   ├── ChatPanel.tsx                # 对话头（含累计 tokens 行）+ 流 + 输入
    │   ├── MessageList.tsx              # 列表 + 自动滚到底
    │   ├── MessageBubble.tsx            # 单条消息（用户右 / AI 左）
    │   ├── InputBox.tsx                 # textarea + 上传 + 斜杠菜单 + 技能中心入口
    │   └── cards/
    │       ├── SkillConfirmCard.tsx     # 意图识别确认卡
    │       ├── ProgressCard.tsx         # 异步执行进度
    │       ├── ResultCard.tsx           # 结果指标 + 表格 + 输出
    │       ├── ErrorCard.tsx            # 错误 + 重试 / 转人工
    │       └── TokenUsage.tsx           # 每条 AI 输出底部的 tokens 消耗胶囊
    │
    ├── Workspace/
    │   └── WorkspacePanel.tsx           # 右侧工作区（多选 + 右键 + 拖拽 + 搜索）
    │
    └── SkillCenter/
        ├── SkillCenterModal.tsx         # 入口弹层（浏览 / 我上传 / 上传 三 Tab）
        ├── SkillGrid.tsx                # 卡片网格
        ├── SkillDetailModal.tsx         # 技能详情（直接使用 / 申请使用）
        └── UploadSkillForm.tsx          # 上传技能（manifest 校验 + 表单）
```

---

## 4. 前端关键交互

| 模块 | 关键能力 |
| --- | --- |
| 左侧对话 | 新建 / 搜索 / 重命名 / 删除 |
| 中间对话 | 用户气泡靠右、AI 气泡靠左；每条 AI 消息附 token 用量；顶部显示当前对话累计 tokens |
| 输入框 | 多行 textarea；`/` 调起技能菜单；上传文件（临时）；技能中心入口 |
| 意图卡 | 主候选 + 置信度 + 备选；动态参数表单含「语言描述」 |
| 进度卡 | 百分比 + 步骤；模拟实时推送 |
| 结果卡 | 指标 + 预览表格 + 输出文件 + 下载/保存/高亮/请人工复核 |
| 右侧工作区 | 切换工作区；多选绑定上下文；上传 / 新建文件夹 / 刷新 / 搜索；右键重命名/删除；节点拖拽 |
| 技能中心 | 搜索 / 分类筛选；点卡片看详情；申请使用（带申请理由）；上传技能（manifest 校验） |
| 用户信息 | 头像点击展示当前用户、组织、角色、加入时间 |

---

## 5. 后端对接指南（核心）

### 5.1 替换 mock 的总原则

所有"会数据驱动 UI"的地方都在 `src/hooks/useChatStore.ts` 与 `src/mock/data.ts`。**后端就绪后只需替换 store 方法的实现，组件不需要改动。**

`useChatStore` 的方法是**唯一的副作用入口**：

```ts
sendUserText(content)        // 发送文本消息
insertSkillTrigger(skill)    // 主动调用某个技能
runSkill(skill)              // 执行技能并模拟进度 + 结果
newSession / renameSession / deleteSession
renameWsNode / deleteWsNode / moveWsNode
setSelectedContext / setWorkspace
```

建议建一个 `src/api/` 目录，按以下表实现，然后在 store 内部调用：

### 5.2 推荐 REST + WS 接口契约

| 前端方法 | 推荐 HTTP / WS | 期望返回 |
| --- | --- | --- |
| 拉取当前用户 | `GET /api/me` | `CurrentUser` |
| 拉取会话列表 | `GET /api/sessions` | `ChatSession[]` |
| 拉取会话详情消息 | `GET /api/sessions/{id}/messages` | `ChatMessage[]` |
| 新建会话 | `POST /api/sessions` | `ChatSession` |
| 重命名会话 | `PATCH /api/sessions/{id}` body=`{title}` | `ChatSession` |
| 删除会话 | `DELETE /api/sessions/{id}` | `204` |
| 发送消息（流式） | `POST /api/sessions/{id}/messages`（SSE / fetch ReadableStream） | 服务端按 chunk 推：`text-delta` / `usage` |
| 意图识别 | `POST /api/intent/parse` body=`{text, contextFileKeys}` | `{candidate, alternatives, fields}` |
| 拉技能详情 | `GET /api/skills/{id}` | `Skill`（含 schema） |
| 执行技能（异步） | `POST /api/skills/{id}/run` body=`{params, fileKeys}` | `{runId}` |
| 推送执行进度 | `WS /api/runs/{runId}/events` | 事件：`progress` / `step` / `result` / `error` / `usage` |
| 工作区列表 | `GET /api/workspaces` | `Workspace[]` |
| 工作区文件树 | `GET /api/workspaces/{id}/tree` | `WsNode[]` |
| 上传文件 | `POST /api/workspaces/{id}/files` (multipart) | `WsNode` |
| 重命名 / 删除 / 移动 | `PATCH/DELETE /api/files/{key}` 或 `POST /api/files/{key}/move` | `WsNode \| 204` |
| 临时上传 | `POST /api/temp-files` (multipart) | `{tempKey, expireAt}` |
| 浏览技能 | `GET /api/skills?cat=&q=` | `SkillCandidate[]` |
| 上传技能包 | `POST /api/skills` (multipart, zip + meta) | `Skill` |
| 删除技能 | `DELETE /api/skills/{id}` | `204` |
| 申请使用技能 | `POST /api/skills/{id}/apply` body=`{reason}` | `{applyId, status}` |

> 临时文件按需求 24 小时后清除，建议在 `temp-files` 实体加 `expireAt`，由后端定时任务清理 + MinIO lifecycle。

### 5.3 流式消息推送格式（推荐 SSE）

```
event: text-delta
data: {"chunk":"已识别到..."}

event: tool-call
data: {"skillName":"CRF 跨中心数据比对","candidate":{...},"fields":[...]}

event: usage
data: {"prompt":420,"completion":108,"total":528,"durationMs":1120}

event: done
data: {"messageId":"m_xxx"}
```

前端建议在 store 中维护一个 `streamingMessageId`，把 delta 累加到最后一条消息，`usage` 直接写入 `tokenUsage`。

### 5.4 异步技能执行 / 进度推送

```
// WS 入口
ws://.../api/runs/{runId}/events

→ {"type":"step","label":"输入文件加载","status":"done"}
→ {"type":"progress","percent":30,"caption":"解析输入文件…"}
→ {"type":"step","label":"参数校验","status":"running"}
…
→ {"type":"result","payload":{ ...SkillResultMessage 的字段... }}
→ {"type":"usage","payload":{...TokenUsage...}}
→ {"type":"done"}
```

前端的 `runSkill` 已经按"渐进更新进度 → 最终插入结果消息"的方式实现，只要事件结构对齐即可无缝替换。

### 5.5 鉴权

- 登录后端发 JWT，前端持久化到 `localStorage`，所有请求带 `Authorization: Bearer <jwt>`
- WS 连接通过 query 参数携带：`?token=<jwt>`
- 路由保护建议在 `App.tsx` 外加一层 `<AuthGate />`（MVP 阶段未实现，后端联调时补）

### 5.6 多租户隔离

按设计文档：
- 组织级隔离：JWT 中携带 `org_id`，Gateway Router 据此路由到对应 OpenClaw gateway 实例
- 用户级隔离：每用户一个 gateway 进程，前端无感知

前端**不需要**在请求里手动带 `org_id` / `user_id`，由后端 JWT 自动解析。

---

## 6. 类型契约（前后端共享）

`src/types/index.ts` 是单一来源。如果后端用 TS，可直接复用；用 Python 则按以下对照：

```
TokenUsage  → { prompt:int, completion:int, total:int, duration_ms:int }
ChatMessage → discriminated union by `type`（text / skill-confirm / skill-progress / skill-result / skill-error）
SkillCandidate / SkillField → 技能定义
WsNode (folder|file) → 树节点
```

强烈建议后端用 OpenAPI 生成 TS 类型，覆盖到 `src/api/types.gen.ts`，并跟 `src/types/index.ts` 做对齐。

---

## 7. 已知 TODO / 联调时再补

- [ ] 登录页 + JWT 注入（后端管理员后台先建账号）
- [ ] 真实上传走 MinIO 预签名 URL，校验单文件 ≤500MB、单次总量 ≤2GB、文件数 ≤200
- [ ] 文件上传时计算 SHA-256 并校验
- [ ] 文件版本管理 UI（MinIO 版本号列表）
- [ ] 文件夹描述 `description.md` 富文本编辑器
- [ ] 转人工通道（websocket + agent inbox）
- [ ] 高风险技能（SAE 报告）结果卡的"请人工复核"流程闭环
- [ ] 错误重试卡：连续失败 2 次后自动弹"是否需要转人工？"

---

## 8. 推荐的本地开发流程（前后端并行）

1. 后端先把 `GET /api/me`、`GET /api/sessions`、`POST /api/sessions/{id}/messages` 三个接口跑通
2. 前端在 `src/api/` 新建 `client.ts`，替换 `useChatStore` 中对应 mock 方法
3. Skill 执行接口（`/skills/{id}/run` + WS 进度）由后端先 mock 返回，前端 store 已经按此假设实现
4. 工作区文件相关接口最后联调（MinIO 准备好之后）

如果需要约定具体接口字段的细节，把 `src/types/index.ts` 发给后端同学，对齐字段即可。
