export type Role = 'user' | 'assistant';

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  durationMs?: number;
}

export interface BaseMessage {
  id: string;
  role: Role;
  createdAt: string;
  /** AI 消息可携带本次 token 消耗，会在内容下方展示 */
  tokenUsage?: TokenUsage;
  /** 关联的 skill 名称，用于在消息头部显示 */
  skillName?: string;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
}

export interface SkillConfirmMessage extends BaseMessage {
  type: 'skill-confirm';
  candidate: SkillCandidate;
  alternatives?: SkillCandidate[];
  inputFiles: ContextFile[];
  fields: SkillField[];
  etaSeconds: number;
  etaTokens: number;
}

export interface SkillProgressMessage extends BaseMessage {
  type: 'skill-progress';
  skillName: string;
  percent: number;
  caption: string;
  steps: { label: string; status: 'done' | 'running' | 'pending' }[];
}

export interface SkillResultMessage extends BaseMessage {
  type: 'skill-result';
  skillName: string;
  summary: string;
  metrics: { label: string; value: string; tone?: 'primary' | 'success' | 'danger' }[];
  table?: { columns: { key: string; title: string }[]; rows: Record<string, string>[]; warnKeys?: string[] };
  totalRows?: number;
  previewRows?: number;
  outputs: { name: string; path: string }[];
  runtimeMs: number;
  needsHumanReview?: boolean;
}

export interface SkillErrorMessage extends BaseMessage {
  type: 'skill-error';
  skillName: string;
  reason: string;
  suggestion?: string;
  attempt: number;
}

export type ChatMessage =
  | TextMessage
  | SkillConfirmMessage
  | SkillProgressMessage
  | SkillResultMessage
  | SkillErrorMessage;

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  group: 'today' | 'yesterday' | 'week' | 'earlier';
  pinned?: boolean;
}

export interface SkillCandidate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  uses: number;
  mine?: boolean;
  /** 匹配置信度 0-100 */
  confidence?: number;
}

export interface SkillField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number';
  value: string | number;
  options?: { label: string; value: string }[];
  helper?: string;
}

export type WsNodeType = 'folder' | 'file';

export interface WsNode {
  key: string;
  name: string;
  type: WsNodeType;
  size?: string;
  hasDescription?: boolean;
  children?: WsNode[];
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  tree: WsNode[];
}

export interface ContextFile {
  key: string;
  name: string;
  type: WsNodeType;
}
