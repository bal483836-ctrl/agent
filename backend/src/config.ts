/**
 * 配置层。所有环境变量集中读取，方便测试时替换。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    expiresIn: '7d',
  },

  llm: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    /** 系统提示词 — 引导模型用"工具调用"形式调用 skills */
    systemPrompt: `你是「量子链 Quantum Chain」临床试验智能助手，服务于疫苗临床试验数据管理。
你的能力：
1) 直接用中文回答用户问题
2) 当用户需求匹配某个已注册的 Skill 时，输出一段 JSON：
   <tool_call>{"skillId":"<id>","reason":"为什么选这个","params":{...}}</tool_call>
3) 用户在右侧工作区已选中文件作为上下文，文件信息会在 user 消息附带

请保持回答简洁、专业。`,
  },

  paths: {
    dataDir: path.resolve(process.cwd(), process.env.DATA_DIR ?? './data'),
    skillsDir: path.resolve(process.cwd(), process.env.SKILLS_DIR ?? './skills'),
  },

  upload: {
    maxFileBytes: Number(process.env.MAX_FILE_BYTES ?? 500 * 1024 * 1024),
    maxTotalBytes: Number(process.env.MAX_TOTAL_BYTES ?? 2 * 1024 * 1024 * 1024),
    maxFilesPerBatch: Number(process.env.MAX_FILES_PER_BATCH ?? 200),
  },

  /** dev 默认用户：供前端 mock 模式接通后端时直接签发 token */
  devUser: {
    orgId: process.env.DEV_DEFAULT_ORG ?? 'org-xiehe',
    orgName: process.env.DEV_DEFAULT_ORG_NAME ?? '协和疫苗研究中心',
    userId: process.env.DEV_DEFAULT_USER ?? 'u-001',
    name: process.env.DEV_DEFAULT_NAME ?? '张研究员',
    email: process.env.DEV_DEFAULT_EMAIL ?? 'zhang.researcher@example.com',
    role: process.env.DEV_DEFAULT_ROLE ?? '主要研究员（PI）',
  },
};

export { __dirname as backendRoot };
