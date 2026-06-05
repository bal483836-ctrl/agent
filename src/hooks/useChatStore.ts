import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  ChatMessage, ChatSession, ContextFile, CurrentUser, SkillCandidate, TokenUsage,
  WsNode,
} from '@/types';
import { mockMessages, mockSessions, mockSkills, mockWorkspaces } from '@/mock/data';

/**
 * 全局对话状态。
 *
 * 设计原则：
 *  - 所有 mock 数据均集中在 mock/data.ts；后端就绪后，只需替换以下方法的实现：
 *      sendUserText        → POST /chat/messages（SSE/WS 流式）
 *      runSkill            → POST /skills/{id}/run  + WS 进度推送
 *      insertSkillTrigger  → 拉 GET /skills/{id} 的 schema
 *      rename/deleteSession→ PATCH /sessions/{id} / DELETE /sessions/{id}
 *      renameWsNode/deleteWsNode/moveWsNode → 工作区文件 API
 *  - UI 行为（折叠、宽度、弹层）也放在 store，避免组件间冗余传递
 */
interface ChatState {
  /* —— 当前登录用户（后端就绪后从 /me 拉取）—— */
  currentUser: CurrentUser;

  /* —— 会话 —— */
  sessions: ChatSession[];
  activeSessionId: string;
  messages: Record<string, ChatMessage[]>;

  /* —— 工作区 —— */
  workspaceId: string;
  /** 工作区文件树（id → 树根数组），从 mockWorkspaces 初始化 */
  workspaceTrees: Record<string, WsNode[]>;
  selectedContext: ContextFile[];

  /* —— UI 状态 —— */
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightWidth: number;
  skillCenterOpen: boolean;
  profileOpen: boolean;

  /* —— 会话操作 —— */
  setActiveSession: (id: string) => void;
  newSession: () => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;

  /* —— UI 操作 —— */
  toggleLeft: () => void;
  toggleRight: () => void;
  setRightWidth: (w: number) => void;
  openSkillCenter: () => void;
  closeSkillCenter: () => void;
  openProfile: () => void;
  closeProfile: () => void;

  /* —— 工作区操作 —— */
  setSelectedContext: (files: ContextFile[]) => void;
  setWorkspace: (id: string) => void;
  renameWsNode: (key: string, newName: string) => void;
  deleteWsNode: (key: string) => void;
  moveWsNode: (dragKey: string, dropKey: string, dropToGap: boolean) => void;
  /** 在指定父节点下追加新节点（parentKey=null 表示根） */
  addWsNode: (parentKey: string | null, node: WsNode) => void;

  /* —— 鉴权（mock） —— */
  loggedOut: boolean;
  logout: () => void;
  loginAgain: () => void;

  /* —— 消息操作 —— */
  appendMessage: (msg: ChatMessage) => void;
  sendUserText: (content: string) => void;
  insertSkillTrigger: (skill: SkillCandidate) => void;
  runSkill: (skill: SkillCandidate) => Promise<void>;
}

const initialTrees: Record<string, WsNode[]> = Object.fromEntries(
  mockWorkspaces.map((w) => [w.id, w.tree]),
);

const useChatStore = create<ChatState>((set, get) => ({
  currentUser: {
    id: 'u-001',
    name: '张研究员',
    email: 'zhang.researcher@example.com',
    role: '主要研究员（PI）',
    organization: '协和疫苗研究中心',
    joinedAt: '2025-09-12',
  },

  sessions: mockSessions,
  activeSessionId: mockSessions[0].id,
  messages: { [mockSessions[0].id]: mockMessages },

  workspaceId: mockWorkspaces[0].id,
  workspaceTrees: initialTrees,
  selectedContext: [
    { key: 'f-s1', name: 'Site01_CRF_W23.xlsx', type: 'file' },
    { key: 'f-s2', name: 'Site02_CRF_W23.xlsx', type: 'file' },
    { key: 'd-dict', name: '02_数据字典', type: 'folder' },
  ],

  leftCollapsed: false,
  rightCollapsed: false,
  rightWidth: 340,
  skillCenterOpen: false,
  profileOpen: false,
  loggedOut: false,

  /* ---------- 会话 ---------- */
  setActiveSession: (id) => set({ activeSessionId: id }),
  newSession: () => {
    const session: ChatSession = {
      id: nanoid(), title: '新对话', updatedAt: '刚刚', group: 'today',
    };
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
      messages: { ...s.messages, [session.id]: [] },
    }));
  },
  renameSession: (id, title) =>
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)) })),
  deleteSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const msgs = { ...s.messages };
      delete msgs[id];
      return {
        sessions,
        messages: msgs,
        activeSessionId: s.activeSessionId === id ? sessions[0]?.id ?? '' : s.activeSessionId,
      };
    }),

  /* ---------- UI ---------- */
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setRightWidth: (w) => set({ rightWidth: w }),
  openSkillCenter: () => set({ skillCenterOpen: true }),
  closeSkillCenter: () => set({ skillCenterOpen: false }),
  openProfile: () => set({ profileOpen: true }),
  closeProfile: () => set({ profileOpen: false }),

  /* ---------- 工作区 ---------- */
  setSelectedContext: (files) => set({ selectedContext: files }),
  setWorkspace: (id) => set({ workspaceId: id }),

  renameWsNode: (key, newName) =>
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [s.workspaceId]: renameInTree(s.workspaceTrees[s.workspaceId], key, newName),
      },
      selectedContext: s.selectedContext.map((c) => (c.key === key ? { ...c, name: newName } : c)),
    })),
  deleteWsNode: (key) =>
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [s.workspaceId]: deleteFromTree(s.workspaceTrees[s.workspaceId], key),
      },
      selectedContext: s.selectedContext.filter((c) => c.key !== key),
    })),
  moveWsNode: (dragKey, dropKey, dropToGap) =>
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [s.workspaceId]: moveInTree(s.workspaceTrees[s.workspaceId], dragKey, dropKey, dropToGap),
      },
    })),
  addWsNode: (parentKey, node) =>
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [s.workspaceId]: addToTree(s.workspaceTrees[s.workspaceId], parentKey, node),
      },
    })),

  /* ---------- 登录 / 退出（mock） ---------- */
  logout: () => set({ loggedOut: true }),
  loginAgain: () => set({ loggedOut: false }),

  /* ---------- 消息 ---------- */
  appendMessage: (msg) =>
    set((s) => {
      const list = s.messages[s.activeSessionId] ?? [];
      return { messages: { ...s.messages, [s.activeSessionId]: [...list, msg] } };
    }),

  sendUserText: (content) => {
    const userMsg: ChatMessage = {
      id: nanoid(), role: 'user', type: 'text', content, createdAt: nowHHMM(),
    };
    get().appendMessage(userMsg);

    setTimeout(() => {
      const usage: TokenUsage = mockUsage(280, 420);
      const reply: ChatMessage = {
        id: nanoid(), role: 'assistant', type: 'text',
        content:
          '已收到您的请求。如果需要调用技能，请使用 / 调出技能列表，或在右侧选择文件作为上下文。',
        createdAt: nowHHMM(),
        tokenUsage: usage,
      };
      get().appendMessage(reply);
    }, 400);
  },

  insertSkillTrigger: (skill) => {
    const msg: ChatMessage = {
      id: nanoid(), role: 'assistant', type: 'skill-confirm',
      createdAt: nowHHMM(),
      skillName: '技能调用',
      candidate: { ...skill, confidence: 100 },
      alternatives: [],
      inputFiles: get().selectedContext,
      // 主动调用时只保留"语言描述"，参数由 LLM 解析填充
      fields: [
        {
          key: 'note',
          label: '语言描述',
          type: 'text',
          value: '',
          helper: '用自然语言补充说明，例如：仅保留 W22 之后的访视',
        },
      ],
      etaSeconds: 30,
      etaTokens: 800,
      tokenUsage: mockUsage(120, 80),
    };
    get().appendMessage(msg);
  },

  runSkill: async (skill) => {
    const progressMsg: ChatMessage = {
      id: nanoid(), role: 'assistant', type: 'skill-progress',
      createdAt: nowHHMM(),
      skillName: skill.name,
      percent: 10, caption: `开始执行 ${skill.name}…`,
      steps: [
        { label: '输入文件加载', status: 'running' },
        { label: '参数校验', status: 'pending' },
        { label: '主流程执行', status: 'pending' },
        { label: '输出归档', status: 'pending' },
      ],
    };
    get().appendMessage(progressMsg);

    const phases = [
      { p: 30, c: '解析输入文件…', s: ['done', 'running', 'pending', 'pending'] as const },
      { p: 60, c: '执行主流程…', s: ['done', 'done', 'running', 'pending'] as const },
      { p: 90, c: '归档输出文件…', s: ['done', 'done', 'done', 'running'] as const },
    ];
    for (const phase of phases) {
      await sleep(700);
      set((s) => {
        const list = s.messages[s.activeSessionId] ?? [];
        const next = list.map((m) =>
          m.id === progressMsg.id && m.type === 'skill-progress'
            ? {
                ...m,
                percent: phase.p,
                caption: phase.c,
                steps: m.steps.map((st, i) => ({ ...st, status: phase.s[i] })),
              }
            : m,
        );
        return { messages: { ...s.messages, [s.activeSessionId]: next } };
      });
    }

    await sleep(500);
    const result: ChatMessage = {
      id: nanoid(), role: 'assistant', type: 'skill-result',
      createdAt: nowHHMM(),
      skillName: skill.name,
      summary: `${skill.name} 已完成，输出包已归档到 Outputs/ 目录。`,
      metrics: [
        { label: '处理记录', value: '128', tone: 'primary' },
        { label: '命中项', value: '12' },
        { label: '异常项', value: '2', tone: 'danger' },
        { label: '完成率', value: '100%', tone: 'success' },
      ],
      table: {
        columns: [
          { key: 'k', title: '项目' },
          { key: 'v', title: '取值' },
          { key: 'r', title: '备注' },
        ],
        rows: [
          { k: '受试者数', v: '128', r: '入组完成' },
          { k: '采集点数', v: '512', r: '覆盖全部访视' },
          { k: '异常事件', v: '2', r: '已自动标记' },
        ],
      },
      totalRows: 12,
      previewRows: 3,
      outputs: [
        { name: 'report.xlsx', path: `Outputs/${skill.name}_${stamp()}/report.xlsx` },
        { name: 'run_params.json', path: `Outputs/${skill.name}_${stamp()}/run_params.json` },
      ],
      runtimeMs: 4200,
      tokenUsage: mockUsage(3200, 1100),
    };
    get().appendMessage(result);
  },
}));

/* ===================== 工具函数 ===================== */

function nowHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) { return n.toString().padStart(2, '0'); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function stamp() {
  const d = new Date();
  return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate()), '_', pad(d.getHours()), pad(d.getMinutes())].join('');
}
function mockUsage(prompt: number, completion: number): TokenUsage {
  const p = prompt + Math.floor(Math.random() * 60);
  const c = completion + Math.floor(Math.random() * 60);
  return { prompt: p, completion: c, total: p + c, durationMs: 600 + Math.floor(Math.random() * 1400) };
}

/* ===================== 树形操作（不可变更新） ===================== */

function renameInTree(nodes: WsNode[], key: string, name: string): WsNode[] {
  return nodes.map((n) => {
    if (n.key === key) return { ...n, name };
    if (n.children) return { ...n, children: renameInTree(n.children, key, name) };
    return n;
  });
}

function addToTree(nodes: WsNode[], parentKey: string | null, newNode: WsNode): WsNode[] {
  if (parentKey == null) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.key === parentKey && n.type === 'folder') {
      return { ...n, children: [...(n.children ?? []), newNode] };
    }
    if (n.children) return { ...n, children: addToTree(n.children, parentKey, newNode) };
    return n;
  });
}

function deleteFromTree(nodes: WsNode[], key: string): WsNode[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => (n.children ? { ...n, children: deleteFromTree(n.children, key) } : n));
}

/** 取出指定 key 的节点（返回节点本体 + 从原树移除后的新树） */
function takeFromTree(nodes: WsNode[], key: string): { taken?: WsNode; rest: WsNode[] } {
  let taken: WsNode | undefined;
  const rest: WsNode[] = [];
  for (const n of nodes) {
    if (n.key === key) { taken = n; continue; }
    if (n.children) {
      const r = takeFromTree(n.children, key);
      if (r.taken) taken = r.taken;
      rest.push({ ...n, children: r.rest });
    } else {
      rest.push(n);
    }
  }
  return { taken, rest };
}

/** 简化的拖拽放置：dropToGap=true 放到 dropKey 之后的同级，false 放入 dropKey 作为子节点 */
function moveInTree(nodes: WsNode[], dragKey: string, dropKey: string, dropToGap: boolean): WsNode[] {
  if (dragKey === dropKey) return nodes;
  const { taken, rest } = takeFromTree(nodes, dragKey);
  if (!taken) return nodes;

  const insert = (arr: WsNode[]): WsNode[] => {
    const idx = arr.findIndex((n) => n.key === dropKey);
    if (idx === -1) return arr.map((n) => n.children ? { ...n, children: insert(n.children) } : n);
    if (dropToGap) {
      const copy = arr.slice();
      copy.splice(idx + 1, 0, taken);
      return copy;
    }
    return arr.map((n) =>
      n.key === dropKey && n.type === 'folder'
        ? { ...n, children: [...(n.children ?? []), taken] }
        : n,
    );
  };
  return insert(rest);
}

export default useChatStore;
export { mockSkills };
