# 量子链 · 前后端接口契约

> 前端通过 `src/api/` 的封装调用以下接口。当 `VITE_USE_MOCK=false` 时启用真实实现，**字段名按本文档对齐**即可即插即用。
>
> 所有接口默认走 JSON，错误格式：`{ message: string, code?: string }`，鉴权用 `Authorization: Bearer <jwt>`，401 时前端自动跳登录。

---

## 0. 通用约定

| 项 | 值 |
| --- | --- |
| REST 基址 | `VITE_API_BASE_URL`（默认 `/api`） |
| WS 基址 | `VITE_WS_BASE_URL`（默认与当前 host 同源） |
| 鉴权 | `Authorization: Bearer <jwt>`，WS 通过 query `?token=` 携带 |
| 时间 | ISO 8601 字符串 |
| 字段命名 | **camelCase**（如后端用 snake_case，请在 gateway 转换） |
| 失败统一返回 | HTTP 4xx/5xx + `{ "message": "..." }` |

---

## 1. 鉴权

### POST /api/auth/login
```jsonc
// 请求
{ "email": "zhang@example.com", "password": "***" }
// 响应 200
{
  "token": "eyJ...",
  "user": {
    "id": "u-001", "name": "张研究员", "email": "zhang@example.com",
    "role": "主要研究员（PI）", "organization": "协和疫苗研究中心",
    "joinedAt": "2025-09-12"
  }
}
```

### GET /api/auth/me
返回 `CurrentUser`，字段同上 `user`。

### POST /api/auth/logout
返回 204。

---

## 2. 会话

### GET /api/sessions → `ChatSession[]`
```jsonc
[
  { "id": "s1", "title": "中心01与中心02 CRF比对",
    "updatedAt": "09:42", "group": "today", "pinned": true }
]
```
`group` 取值：`today | yesterday | week | earlier`

### POST /api/sessions
请求 `{ "title": "新对话" }`，返回 `ChatSession`。

### PATCH /api/sessions/{id}
请求 `{ "title": "新标题" }`，返回更新后的 `ChatSession`。

### DELETE /api/sessions/{id} → 204

---

## 3. 消息

### GET /api/sessions/{id}/messages → `ChatMessage[]`

`ChatMessage` 是按 `type` 区分的辨别联合（见 `src/types/index.ts`）：
- `text`
- `skill-confirm`
- `skill-progress`
- `skill-result`
- `skill-error`

每条 AI 消息可携带 `tokenUsage`：
```jsonc
{ "prompt": 4820, "completion": 1640, "total": 6460, "durationMs": 4200 }
```

### POST /api/sessions/{id}/messages （SSE）

请求：
```jsonc
{ "content": "帮我比对中心01和中心02的 CRF" }
```

响应：`Content-Type: text/event-stream`，事件序列：
```
event: text-delta
data: {"chunk":"已识别到..."}

event: tool-call
data: {"toolCallId":"tc_1","skillName":"CRF 跨中心数据比对","payload":{ ... }}

event: usage
data: {"prompt":420,"completion":108,"total":528,"durationMs":1120}

event: done
data: {"messageId":"m_xxx"}

event: error
data: {"reason":"..."}
```

前端在 `src/api/messages.ts` 的 `MessagesApi.send` 中已实现解析。

---

## 4. 技能

### GET /api/skills?q=&category= → `SkillCandidate[]`
```jsonc
[{
  "id": "sk1", "icon": "📊", "name": "CRF 跨中心数据比对",
  "description": "...", "category": "数据比对",
  "uses": 128, "mine": true
}]
```

### GET /api/skills/{id} → `SkillCandidate`（含完整描述、参数 schema）

### POST /api/skills （multipart/form-data）
字段：`file=<zip>`，其余 meta 表单字段（`name/desc/category/inputs/params`）。
返回新建的 `SkillCandidate`。

### DELETE /api/skills/{id} → 204

### POST /api/skills/{id}/apply
请求 `{ "reason": "..." }`，返回 `{ "applyId": "...", "status": "pending" }`。

### POST /api/intent/parse
意图识别。前端在用户发送消息时调用（或直接由 chat 流的 `tool-call` 事件替代）。
```jsonc
// 请求
{ "text": "帮我比对中心01和中心02 CRF", "contextKeys": ["f-s1","f-s2"] }
// 响应
{
  "main":      { ...SkillCandidate, "confidence": 92 },
  "alternatives": [ ... ],
  "fields": [
    { "key":"dim","label":"比对维度","type":"select","value":"eff-ae",
      "options":[ {"label":"主要疗效 + 不良事件（推荐）","value":"eff-ae"} ]},
    { "key":"tol","label":"数值容差","type":"text","value":"0.01" },
    { "key":"note","label":"语言描述","type":"text","value":"" }
  ],
  "etaSeconds": 45,
  "etaTokens": 1200
}
```

---

## 5. 工作区

### GET /api/workspaces → `Workspace[]`
```jsonc
[{ "id":"ws-v203", "name":"V-203 三期临床", "description":"..." }]
```

### GET /api/workspaces/{id}/tree → `WsNode[]`
```jsonc
[
  { "key":"d-raw","name":"01_原始数据","type":"folder","hasDescription":true,
    "children": [{ "key":"f-s1","name":"Site01_CRF_W23.xlsx","type":"file","size":"4.2 MB" }] }
]
```

### POST /api/workspaces/{id}/folders
请求 `{ "parentKey": null | "d-x", "name": "新建文件夹" }`，返回 `WsNode`。

### PATCH /api/workspaces/{id}/nodes/{key}
请求 `{ "name": "新名称" }`，返回 `WsNode`。

### DELETE /api/workspaces/{id}/nodes/{key} → 204

### POST /api/workspaces/{id}/nodes/{key}/move
请求 `{ "dropKey": "d-other", "dropToGap": false }` → 204。

---

## 6. 文件

### POST /api/workspaces/{id}/files （multipart）
字段：`file=<binary>`，可选 `parentKey`。

业务约束（前端先校验，后端再校验）：
- 单文件 ≤500 MB
- 单次上传总量 ≤2 GB
- 文件数 ≤200
- 前端 `sha256` 字段可同时附带，便于后端校验完整性

返回 `WsNode`。

### POST /api/temp-files
临时文件（仅当次会话有效，24h 后清理）。
返回 `{ "tempKey":"tmp-xxx","name":"...","expireAt":"2026-..." }`。

### GET /api/files/{key}/download → 二进制流

---

## 7. 技能执行（异步 + WS 进度）

### POST /api/skills/{id}/run
```jsonc
// 请求
{ "params": { "dim":"eff-ae","tol":"0.01" }, "fileKeys": ["f-s1","f-s2","d-dict"] }
// 响应
{ "runId": "run_abc123" }
```

### WS /ws/runs/{runId}/events

事件流：
```jsonc
{"type":"step","label":"输入文件加载","status":"done"}
{"type":"progress","percent":30,"caption":"解析输入文件…"}
{"type":"step","label":"参数校验","status":"running"}
...
{"type":"result","payload":{
  "summary":"...", "metrics":[...], "table":{ "columns":[...], "rows":[...] },
  "totalRows":17,"previewRows":4,
  "outputs":[{"name":"diff_report.xlsx","path":"Outputs/.../diff_report.xlsx"}],
  "runtimeMs":42000,"needsHumanReview":true
}}
{"type":"usage","usage":{"prompt":4820,"completion":1640,"total":6460,"durationMs":42000}}
{"type":"done"}
{"type":"error","reason":"...", "suggestion":"..."}
```

前端 `src/api/runs.ts` 的 `RunsApi.subscribe` 已实现解析与状态合并。

---

## 8. 多租户隔离

按设计文档：
- 组织级隔离：JWT 中携带 `orgId`，Gateway Router 据此路由到对应 OpenClaw gateway 实例
- 用户级隔离：每用户一个 gateway 进程

前端**不需要**在请求里手动带 `orgId / userId`，由后端 JWT 解析后注入。

---

## 9. 联调清单

后端实现顺序建议：

1. `/auth/login` + `/auth/me` + `/auth/logout`
2. `/sessions` 系列
3. `/sessions/{id}/messages` (GET) → 先返回静态历史
4. `/workspaces` + `/workspaces/{id}/tree`
5. `/skills` (GET / 上传)
6. `/intent/parse`
7. `/sessions/{id}/messages` (POST SSE)
8. `/skills/{id}/run` + WS 进度
9. 文件上传 / 下载 / 临时上传

任一步落地后，前端把 `VITE_USE_MOCK=false` 即可逐步真接，未实现的接口暂时让 mock 兜底（每个 `src/api/*.ts` 的 mockApi 都能独立保留）。
