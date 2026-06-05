import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { ChatMessage, ChatSession, ContextFile, SkillCandidate, TokenUsage } from '@/types';
import { mockMessages, mockSessions, mockSkills, mockWorkspaces } from '@/mock/data';

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string;
  messages: Record<string, ChatMessage[]>;

  workspaceId: string;
  selectedContext: ContextFile[];

  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightWidth: number;

  skillCenterOpen: boolean;

  /* actions */
  setActiveSession: (id: string) => void;
  newSession: () => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;

  toggleLeft: () => void;
  toggleRight: () => void;
  setRightWidth: (w: number) => void;
  openSkillCenter: () => void;
  closeSkillCenter: () => void;

  setSelectedContext: (files: ContextFile[]) => void;
  setWorkspace: (id: string) => void;

  appendMessage: (msg: ChatMessage) => void;
  /** 用户发送一条文本 + 触发一次"AI 识别 → 确认卡"流程（mock） */
  sendUserText: (content: string) => void;
  /** 主动从技能中心选了一个技能，插入待执行卡 */
  insertSkillTrigger: (skill: SkillCandidate) => void;
  /** 模拟执行一个技能：插入 progress → result */
  runSkill: (skill: SkillCandidate) => Promise<void>;
}

const useChatStore = create<ChatState>((set, get) => ({
  sessions: mockSessions,
  activeSessionId: mockSessions[0].id,
  messages: { [mockSessions[0].id]: mockMessages },

  workspaceId: mockWorkspaces[0].id,
  selectedContext: [
    { key: 'f-s1', name: 'Site01_CRF_W23.xlsx', type: 'file' },
    { key: 'f-s2', name: 'Site02_CRF_W23.xlsx', type: 'file' },
    { key: 'd-dict', name: '02_数据字典', type: 'folder' },
  ],

  leftCollapsed: false,
  rightCollapsed: false,
  rightWidth: 340,
  skillCenterOpen: false,

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

  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setRightWidth: (w) => set({ rightWidth: w }),
  openSkillCenter: () => set({ skillCenterOpen: true }),
  closeSkillCenter: () => set({ skillCenterOpen: false }),

  setSelectedContext: (files) => set({ selectedContext: files }),
  setWorkspace: (id) => set({ workspaceId: id }),

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

    // mock: 200ms 后回一条 AI 文本，附带 token 用量
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
      fields: [
        { key: 'note', label: '自然语言参数补充（可选）', type: 'text', value: '',
          helper: '例如：仅保留 W22 之后的访视' },
      ],
      etaSeconds: 30,
      etaTokens: 800,
      tokenUsage: mockUsage(120, 80),
    };
    get().appendMessage(msg);
  },

  runSkill: async (skill) => {
    // progress
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

    // 渐进更新百分比
    const updates: { percent: number; caption: string; steps: ChatMessage['type'] extends never ? never : any[] }[] = [];
    const phases = [
      { p: 30, c: '解析输入文件…', s: [['done'], ['running'], ['pending'], ['pending']] },
      { p: 60, c: '执行主流程…', s: [['done'], ['done'], ['running'], ['pending']] },
      { p: 90, c: '归档输出文件…', s: [['done'], ['done'], ['done'], ['running']] },
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
                steps: m.steps.map((st, i) => ({
                  ...st,
                  status: phase.s[i][0] as any,
                })),
              }
            : m,
        );
        return { messages: { ...s.messages, [s.activeSessionId]: next } };
      });
    }

    await sleep(500);
    // 结果
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

export default useChatStore;
export { mockSkills };
