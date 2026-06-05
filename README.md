# 量子链 Quantum Chain · 前端

面向疫苗临床试验数据管理与安全监察场景的 LLM 助手，MVP 阶段前端。

## 技术栈

- React 18 + TypeScript + Vite
- Ant Design 5（中文 locale）
- Zustand（轻量状态管理）

## 核心目录

```
src/
├── App.tsx                       # 三栏布局 + 拖拽改宽
├── main.tsx                      # 全局 ConfigProvider / 主题
├── types/                        # 业务领域类型（消息、技能、工作区…）
├── mock/data.ts                  # 全部 mock 数据（后端就绪后替换为 API）
├── hooks/useChatStore.ts         # 全局会话/消息/上下文 store
├── styles/global.css
└── components/
    ├── TopBar.tsx                # 品牌、组织、用量、用户
    ├── Sidebar/
    │   └── ChatHistory.tsx       # 左侧：历史对话（搜索/重命名/删除）
    ├── Chat/
    │   ├── ChatPanel.tsx         # 中间：会话头 + 消息流 + 输入
    │   ├── MessageList.tsx
    │   ├── MessageBubble.tsx     # 用户气泡靠右、AI 气泡靠左
    │   ├── InputBox.tsx          # /-斜杠菜单、上传文件、技能中心入口
    │   └── cards/
    │       ├── SkillConfirmCard  # 意图识别确认卡（含候选/参数表单）
    │       ├── ProgressCard      # 异步执行进度
    │       ├── ResultCard        # 结果摘要 + 指标 + 表格 + 输出归档
    │       ├── ErrorCard         # 错误 + 重试 / 转人工
    │       └── TokenUsage        # ⚠ 每次 AI 输出下方的 token 消耗
    ├── Workspace/
    │   └── WorkspacePanel.tsx    # 右侧：工作区切换、文件树、多选上下文
    └── SkillCenter/
        ├── SkillCenterModal.tsx  # 技能中心弹层（三个 Tab）
        ├── SkillGrid.tsx         # 卡片网格
        └── UploadSkillForm.tsx   # 上传技能包（manifest 校验、表单）
```

## 启动

```bash
npm install
npm run dev
```

## 与后端对接

所有交互目前由 `useChatStore` 在前端用 mock 数据模拟。后端就绪后只需替换以下方法的实现：

| store 方法 | 对应后端能力 |
|---|---|
| `sendUserText` | POST /chat/messages（流式） |
| `runSkill` | POST /skills/{id}/run + WS 进度推送 |
| `insertSkillTrigger` | GET /skills/{id}（获取参数 schema） |
| `mockSessions / mockMessages / mockWorkspaces` | 对应列表/详情接口 |

TokenUsage 数据来源于 LLM gateway 的 usage 字段（prompt / completion / total / duration_ms），渲染在 `<MessageBubble>` 内 AI 消息正文下方。
