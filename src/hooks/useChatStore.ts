import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  ChatMessage, ChatSession, ContextFile, CurrentUser, SkillCandidate,
  SkillResultMessage, Workspace, WsNode,
} from '@/types';
import { api } from '@/api';
import type { Closeable } from '@/api';

/**
 * 全局对话状态 + 业务动作。
 *
 * 所有副作用均通过 `api`（src/api）发出，store 只持有「已经在客户端的数据 + UI 状态」。
 * 后端就绪后只需切换 `VITE_USE_MOCK=false`，store 代码不动。
 *
 *  - 初次挂载时调用 bootstrap()：加载用户/会话/工作区/技能
 *  - sendUserText() → api.messages.send(SSE) → 按事件累加 assistant 消息
 *  - insertSkillTrigger() → api.skills.parseIntent() → 落地 skill-confirm 消息
 *  - runSkill() → api.runs.start() → api.runs.subscribe(WS) → 更新 progress / 落地 result
 *  - 工作区树操作均经 api.workspaces.*，UI 立即乐观更新
 */
interface ChatState {
  /* —— 数据 —— */
  currentUser: CurrentUser | null;
  sessions: ChatSession[];
  activeSessionId: string;
  messages: Record<string, ChatMessage[]>;

  workspaces: Workspace[];
  workspaceId: string;
  workspaceTrees: Record<string, WsNode[]>;
  selectedContext: ContextFile[];

  skills: SkillCandidate[];

  /* —— UI 状态 —— */
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightWidth: number;
  skillCenterOpen: boolean;
  loggedOut: boolean;
  loading: boolean;

  /* —— 初始化 —— */
  bootstrap: () => Promise<void>;

  /* —— 会话 —— */
  setActiveSession: (id: string) => Promise<void>;
  newSession: () => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  /* —— UI —— */
  toggleLeft: () => void;
  toggleRight: () => void;
  setRightWidth: (w: number) => void;
  openSkillCenter: () => void;
  closeSkillCenter: () => void;

  /* —— 工作区 —— */
  setSelectedContext: (files: ContextFile[]) => void;
  setWorkspace: (id: string) => Promise<void>;
  renameWsNode: (key: string, newName: string) => Promise<void>;
  deleteWsNode: (key: string) => Promise<void>;
  moveWsNode: (dragKey: string, dropKey: string, dropToGap: boolean) => Promise<void>;
  addWsNode: (parentKey: string | null, node: WsNode) => void;

  /* —— 鉴权 —— */
  logout: () => Promise<void>;
  loginAgain: () => Promise<void>;

  /* —— 消息 —— */
  appendMessage: (msg: ChatMessage) => void;
  sendUserText: (content: string) => Promise<void>;
  insertSkillTrigger: (skill: SkillCandidate) => Promise<void>;
  runSkill: (skill: SkillCandidate) => Promise<void>;
}

const useChatStore = create<ChatState>((set, get) => ({
  currentUser: null,
  sessions: [],
  activeSessionId: '',
  messages: {},

  workspaces: [],
  workspaceId: '',
  workspaceTrees: {},
  selectedContext: [],

  skills: [],

  leftCollapsed: false,
  rightCollapsed: false,
  rightWidth: 340,
  skillCenterOpen: false,
  loggedOut: false,
  loading: true,

  /* ---------- 初始化 ---------- */

  async bootstrap() {
    set({ loading: true });
    try {
      const [me, sessions, workspaces, skills] = await Promise.all([
        api.auth.me(),
        api.sessions.list(),
        api.workspaces.list(),
        api.skills.list(),
      ]);
      const activeSession = sessions[0];
      const activeWs = workspaces[0];
      const tree = activeWs ? await api.workspaces.tree(activeWs.id) : [];
      const messages = activeSession
        ? await api.messages.list(activeSession.id)
        : [];

      set({
        currentUser: me,
        sessions,
        activeSessionId: activeSession?.id ?? '',
        messages: activeSession ? { [activeSession.id]: messages } : {},
        workspaces,
        workspaceId: activeWs?.id ?? '',
        workspaceTrees: activeWs ? { [activeWs.id]: tree } : {},
        skills,
        selectedContext: defaultContext(tree),
      });
    } finally {
      set({ loading: false });
    }
  },

  /* ---------- 会话 ---------- */

  async setActiveSession(id) {
    set({ activeSessionId: id });
    if (!get().messages[id]) {
      const msgs = await api.messages.list(id);
      set((s) => ({ messages: { ...s.messages, [id]: msgs } }));
    }
  },
  async newSession() {
    const s = await api.sessions.create('新对话');
    set((st) => ({
      sessions: [s, ...st.sessions],
      activeSessionId: s.id,
      messages: { ...st.messages, [s.id]: [] },
    }));
  },
  async renameSession(id, title) {
    const updated = await api.sessions.rename(id, title);
    set((st) => ({ sessions: st.sessions.map((x) => (x.id === id ? updated : x)) }));
  },
  async deleteSession(id) {
    await api.sessions.remove(id);
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const msgs = { ...s.messages };
      delete msgs[id];
      return {
        sessions, messages: msgs,
        activeSessionId: s.activeSessionId === id ? sessions[0]?.id ?? '' : s.activeSessionId,
      };
    });
  },

  /* ---------- UI ---------- */
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setRightWidth: (w) => set({ rightWidth: w }),
  openSkillCenter: () => set({ skillCenterOpen: true }),
  closeSkillCenter: () => set({ skillCenterOpen: false }),

  /* ---------- 工作区 ---------- */
  setSelectedContext: (files) => set({ selectedContext: files }),

  async setWorkspace(id) {
    set({ workspaceId: id });
    if (!get().workspaceTrees[id]) {
      const tree = await api.workspaces.tree(id);
      set((s) => ({ workspaceTrees: { ...s.workspaceTrees, [id]: tree } }));
    }
  },

  async renameWsNode(key, newName) {
    const { workspaceId } = get();
    // 乐观更新
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [workspaceId]: renameInTree(s.workspaceTrees[workspaceId] ?? [], key, newName),
      },
      selectedContext: s.selectedContext.map((c) => (c.key === key ? { ...c, name: newName } : c)),
    }));
    await api.workspaces.rename(workspaceId, key, newName);
  },

  async deleteWsNode(key) {
    const { workspaceId } = get();
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [workspaceId]: deleteFromTree(s.workspaceTrees[workspaceId] ?? [], key),
      },
      selectedContext: s.selectedContext.filter((c) => c.key !== key),
    }));
    await api.workspaces.remove(workspaceId, key);
  },

  async moveWsNode(dragKey, dropKey, dropToGap) {
    const { workspaceId } = get();
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [workspaceId]: moveInTree(s.workspaceTrees[workspaceId] ?? [], dragKey, dropKey, dropToGap),
      },
    }));
    await api.workspaces.move(workspaceId, dragKey, dropKey, dropToGap);
  },

  addWsNode: (parentKey, node) =>
    set((s) => ({
      workspaceTrees: {
        ...s.workspaceTrees,
        [s.workspaceId]: addToTree(s.workspaceTrees[s.workspaceId] ?? [], parentKey, node),
      },
    })),

  /* ---------- 鉴权 ---------- */
  async logout() {
    await api.auth.logout();
    set({ loggedOut: true });
  },
  async loginAgain() {
    // mock 模式下直接重启 bootstrap；真实模式应导航到登录页
    set({ loggedOut: false });
    await get().bootstrap();
  },

  /* ---------- 消息 ---------- */
  appendMessage: (msg) =>
    set((s) => {
      const list = s.messages[s.activeSessionId] ?? [];
      return { messages: { ...s.messages, [s.activeSessionId]: [...list, msg] } };
    }),

  async sendUserText(content) {
    const sessionId = get().activeSessionId;
    // 1) 立即追加用户消息
    const userMsg: ChatMessage = {
      id: nanoid(), role: 'user', type: 'text', content, createdAt: nowHHMM(),
    };
    get().appendMessage(userMsg);

    // 2) 落一条占位的 assistant text 消息，由 SSE 累加 delta
    const assistantId = nanoid();
    const assistantMsg: ChatMessage = {
      id: assistantId, role: 'assistant', type: 'text',
      content: '', createdAt: nowHHMM(),
    };
    get().appendMessage(assistantMsg);

    let buffer = '';
    let stream: Closeable | null = null;
    stream = api.messages.send(sessionId, content, (e) => {
      if (e.type === 'text-delta') {
        buffer += e.chunk;
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: (s.messages[sessionId] ?? []).map((m) =>
              m.id === assistantId && m.type === 'text' ? { ...m, content: buffer } : m,
            ),
          },
        }));
      } else if (e.type === 'usage') {
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: (s.messages[sessionId] ?? []).map((m) =>
              m.id === assistantId ? { ...m, tokenUsage: e.usage } : m,
            ),
          },
        }));
      } else if (e.type === 'tool-call') {
        // 后端识别到要调技能：替换占位为 skill-confirm
        // MVP：交给上层 UI 决定，此处仅追加一条文本提示
      } else if (e.type === 'done' || e.type === 'error') {
        stream?.close();
      }
    });
  },

  async insertSkillTrigger(skill) {
    const sessionId = get().activeSessionId;
    // 走意图识别 API 拿参数 schema（mock 也走同样接口）
    const intent = await api.skills.parseIntent(skill.name, get().selectedContext.map((c) => c.key));
    const msg: ChatMessage = {
      id: nanoid(), role: 'assistant', type: 'skill-confirm',
      createdAt: nowHHMM(),
      skillName: '技能调用',
      candidate: { ...skill, confidence: 100 },
      alternatives: [],
      inputFiles: get().selectedContext,
      fields: intent.fields,
      etaSeconds: intent.etaSeconds,
      etaTokens: intent.etaTokens,
    };
    void sessionId;
    get().appendMessage(msg);
  },

  async runSkill(skill) {
    const progressId = nanoid();
    const progressMsg: ChatMessage = {
      id: progressId, role: 'assistant', type: 'skill-progress',
      createdAt: nowHHMM(),
      skillName: skill.name,
      percent: 0, caption: `准备执行 ${skill.name}…`,
      steps: [],
    };
    get().appendMessage(progressMsg);

    const params = {};
    const fileKeys = get().selectedContext.map((c) => c.key);
    const { runId } = await api.runs.start(skill.id, params, fileKeys);

    const sessionId = get().activeSessionId;
    let resultPayload: Partial<SkillResultMessage> | null = null;
    let resultUsage: ChatMessage['tokenUsage'] | undefined;

    const conn = api.runs.subscribe(runId, (e) => {
      if (e.type === 'progress') {
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: (s.messages[sessionId] ?? []).map((m) =>
              m.id === progressId && m.type === 'skill-progress'
                ? { ...m, percent: e.percent, caption: e.caption }
                : m,
            ),
          },
        }));
      } else if (e.type === 'step') {
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: (s.messages[sessionId] ?? []).map((m) => {
              if (m.id !== progressId || m.type !== 'skill-progress') return m;
              const idx = m.steps.findIndex((st) => st.label === e.label);
              const next = idx >= 0
                ? m.steps.map((st, i) => (i === idx ? { ...st, status: e.status } : st))
                : [...m.steps, { label: e.label, status: e.status }];
              return { ...m, steps: next };
            }),
          },
        }));
      } else if (e.type === 'result') {
        resultPayload = e.payload as Partial<SkillResultMessage>;
      } else if (e.type === 'usage') {
        resultUsage = e.usage;
      } else if (e.type === 'done') {
        if (resultPayload) {
          const final: ChatMessage = {
            id: nanoid(), role: 'assistant', type: 'skill-result',
            createdAt: nowHHMM(),
            skillName: skill.name,
            summary: resultPayload.summary ?? `${skill.name} 已完成`,
            metrics: resultPayload.metrics ?? [],
            table: resultPayload.table,
            totalRows: resultPayload.totalRows,
            previewRows: resultPayload.previewRows,
            outputs: resultPayload.outputs ?? [],
            runtimeMs: resultPayload.runtimeMs ?? 0,
            needsHumanReview: resultPayload.needsHumanReview,
            tokenUsage: resultUsage,
          };
          get().appendMessage(final);
        }
        conn.close();
      } else if (e.type === 'error') {
        const err: ChatMessage = {
          id: nanoid(), role: 'assistant', type: 'skill-error',
          createdAt: nowHHMM(),
          skillName: skill.name,
          reason: e.reason,
          suggestion: e.suggestion,
          attempt: 1,
        };
        get().appendMessage(err);
        conn.close();
      }
    });
  },
}));

/* ===================== 工具 ===================== */

function nowHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) { return n.toString().padStart(2, '0'); }

function defaultContext(tree: WsNode[]): ContextFile[] {
  // 演示用：默认勾选前 2 个文件
  const flat: WsNode[] = [];
  const walk = (ns: WsNode[]) => ns.forEach((n) => { flat.push(n); n.children && walk(n.children); });
  walk(tree);
  return flat.filter((n) => n.type === 'file').slice(0, 2).map((n) => ({
    key: n.key, name: n.name, type: n.type,
  }));
}

/* ===== 不可变树操作 ===== */

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
function renameInTree(nodes: WsNode[], key: string, name: string): WsNode[] {
  return nodes.map((n) => {
    if (n.key === key) return { ...n, name };
    if (n.children) return { ...n, children: renameInTree(n.children, key, name) };
    return n;
  });
}
function deleteFromTree(nodes: WsNode[], key: string): WsNode[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => (n.children ? { ...n, children: deleteFromTree(n.children, key) } : n));
}
function takeFromTree(nodes: WsNode[], key: string): { taken?: WsNode; rest: WsNode[] } {
  let taken: WsNode | undefined;
  const rest: WsNode[] = [];
  for (const n of nodes) {
    if (n.key === key) { taken = n; continue; }
    if (n.children) {
      const r = takeFromTree(n.children, key);
      if (r.taken) taken = r.taken;
      rest.push({ ...n, children: r.rest });
    } else rest.push(n);
  }
  return { taken, rest };
}
function moveInTree(nodes: WsNode[], dragKey: string, dropKey: string, dropToGap: boolean): WsNode[] {
  if (dragKey === dropKey) return nodes;
  const { taken, rest } = takeFromTree(nodes, dragKey);
  if (!taken) return nodes;
  const insert = (arr: WsNode[]): WsNode[] => {
    const idx = arr.findIndex((n) => n.key === dropKey);
    if (idx === -1) return arr.map((n) => (n.children ? { ...n, children: insert(n.children) } : n));
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
