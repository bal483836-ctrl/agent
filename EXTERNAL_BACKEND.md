# 接入同事的 OpenClaw 后端

## 切换方法

复制 `.env.example` 到 `.env.local`，确认这几行：

```
VITE_BACKEND_MODE=external
VITE_EXTERNAL_API_BASE=/ext
VITE_EXTERNAL_DEV_BACKEND=http://47.116.192.78:8080
VITE_EXTERNAL_USER_ID=林轩辉
VITE_EXTERNAL_USER_DEPT=质量管理部
```

然后 `npm run dev`，顶栏右上会出现 🌐 **OpenClaw** 紫色标签，说明已切到 external。

## 前端功能 ↔ 7 个接口映射

| 前端动作 | 调用的接口 | 备注 |
|---|---|---|
| 应用启动 / 切换用户 | `POST /api/connect` | 必须第一个，后续接口要先 connect；同一 userID 幂等 |
| 顶部头像点开"重新登录" | `POST /api/connect` | 用 EXTERNAL_USER_ID + DEPT |
| 左侧历史对话列表 | `GET /api/sessions?userID=` | |
| 点击历史 → 加载消息 | `GET /api/chat/history?userID=&sessionKey=` | sessionKey 即 ChatSession.id |
| 新建对话 | `POST /api/sessions/new?userID=` body=`{agentId:'main'}` | |
| 发送消息 | `POST /api/chat/send` body=`{userID,message,sessionKey}` → runId | |
| 流式回复 | `GET /api/chat/stream?userID=&runId=&sessionKey=` (SSE) | EventSource |
| 技能中心列表 | `GET /api/agents?userID=` | agent → SkillCandidate |

## external 模式下被禁用的功能

后端尚未提供，前端会抛 "同事的后端暂未支持「xxx」"：

- 重命名 / 删除会话
- 工作区文件上传 / 下载 / 预览 / 拖拽 / 描述
- 技能 zip 上传 / 删除
- 技能独立执行（runs）

UI 还在，只是点了会提示。等后端补上对应接口即可解禁。

## OpenClaw 原始数据兼容

后端"未处理"返回，字段名可能变。`src/api/external/normalize.ts` 已经对常见命名做兼容：

- **session**: `sessionKey / session_key / id / key / sessionId`
- **message role**: `role / sender / from / author`
- **message content**: `content / text / message / body / choices[0].delta.content`
- **message time**: `createdAt / created_at / timestamp / ts`
- **agent**: `id / agentId / agent_id / key / name`
- **usage**: `prompt / prompt_tokens / input_tokens` 等多变体

后端变了字段，**只动 normalize.ts 这一个文件**就行。

## SSE 事件结构兼容

后端 `/api/chat/stream` 推啥前端都试着解：

```jsonc
// OpenAI 风格
{"choices":[{"delta":{"content":"你"}}]}
// 通用 delta
{"delta":"你"}                {"text":"你"}              {"content":"你"}
// 结束
{"done":true}    {"finished":true}    [DONE]            { "event":"done" }
// 用量
{"usage":{"prompt_tokens":..., "completion_tokens":...}}
```

任何 JSON parse 失败的行都按 **裸文本 delta** 处理。

## 调试小贴士

1. 浏览器 F12 → Network 看 `/ext/api/*` 请求是否 200
2. `/ext/api/chat/stream` 是 EventSource，类型显示 **eventsource**，点开 Messages 标签看推送
3. 调不通可以先在终端手工 curl 一次（参考 README 顶部）确认后端响应；前端的 `extRequest` 会把原始返回打到 console
4. 调成功一次后，后续刷新页面**不会重复 connect**（前端按 userID 幂等）；切换 userID 才会 reconnect

## 切回本地后端

`.env.local` 改：
```
VITE_BACKEND_MODE=local
```
然后 `cd backend && npm run dev` 起本地服务。两套并存，互不干扰。
