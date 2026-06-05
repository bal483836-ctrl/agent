import { nanoid } from 'nanoid';
import type { ChatMessage, ChatSession, SkillCandidate, Workspace } from '@/types';

export const mockSessions: ChatSession[] = [
  { id: 's1', title: '中心01与中心02 CRF比对', updatedAt: '09:42', group: 'today', pinned: true },
  { id: 's2', title: 'SAE 周报草稿', updatedAt: '08:20', group: 'today' },
  { id: 's3', title: '疫苗 V-203 不良反应汇总', updatedAt: '昨天', group: 'yesterday' },
  { id: 's4', title: '受试者入组数据提取', updatedAt: '昨天', group: 'yesterday' },
  { id: 's5', title: '三期临床方案要点摘录', updatedAt: '5月29日', group: 'week' },
  { id: 's6', title: '实验室检查异常值复核', updatedAt: '5月28日', group: 'week' },
  { id: 's7', title: 'DSMB 月度安全报告', updatedAt: '5月26日', group: 'week' },
];

export const mockSkills: SkillCandidate[] = [
  { id: 'sk1', icon: '📊', name: 'CRF 跨中心数据比对', description: '对两个研究中心相同字段进行行级比对，输出差异报告', category: '数据比对', uses: 128, mine: true },
  { id: 'sk2', icon: '⚠️', name: 'SAE 报告生成', description: '基于不良事件原始记录生成监管要求的严重不良事件报告', category: '安全报告', uses: 87 },
  { id: 'sk3', icon: '🔍', name: '受试者数据提取', description: '按入组日期、中心、访视等条件抽取受试者数据', category: '数据提取', uses: 213 },
  { id: 'sk4', icon: '📋', name: '实验室异常值筛查', description: '自动标记超出正常范围的检验值，按严重度分级', category: '统计分析', uses: 156 },
  { id: 'sk5', icon: '📈', name: '入组进度统计', description: '按中心、按周生成入组进度图表', category: '统计分析', uses: 92 },
  { id: 'sk6', icon: '📝', name: '方案偏离汇总', description: '识别并汇总方案偏离事件，输出 PDF 清单', category: '安全报告', uses: 41, mine: true },
  { id: 'sk7', icon: '💊', name: '用药依从性评估', description: '基于用药记录评估依从性比率', category: '统计分析', uses: 63 },
  { id: 'sk8', icon: '🧾', name: 'CRF 字段缺失检查', description: '快速识别 CRF 表中关键字段的缺失项', category: '数据比对', uses: 178 },
  { id: 'sk9', icon: '🩺', name: 'AE 编码映射', description: '将自由文本不良事件映射到 MedDRA 编码', category: '安全报告', uses: 54 },
  { id: 'sk10', icon: '📅', name: '访视依从性分析', description: '识别超窗、缺失访视的受试者', category: '统计分析', uses: 76 },
  { id: 'sk11', icon: '🔐', name: '数据脱敏导出', description: '按规则脱敏受试者标识后导出', category: '数据提取', uses: 39 },
  { id: 'sk12', icon: '📑', name: 'DSMB 月度报告', description: '生成数据与安全监察委员会月度报告草稿', category: '安全报告', uses: 28, mine: true },
];

export const mockWorkspaces: Workspace[] = [
  {
    id: 'ws-v203',
    name: 'V-203 三期临床',
    description: 'V-203 疫苗三期临床试验主工作区',
    tree: [
      {
        key: 'd-raw', name: '01_原始数据', type: 'folder', hasDescription: true,
        children: [
          {
            key: 'd-crf', name: 'CRF', type: 'folder',
            children: [
              { key: 'f-s1', name: 'Site01_CRF_W23.xlsx', type: 'file', size: '4.2 MB' },
              { key: 'f-s2', name: 'Site02_CRF_W23.xlsx', type: 'file', size: '4.0 MB' },
              { key: 'f-s3', name: 'Site03_CRF_W23.xlsx', type: 'file', size: '3.8 MB' },
            ],
          },
          {
            key: 'd-lab', name: '实验室数据', type: 'folder',
            children: [
              { key: 'f-lab1', name: 'Lab_Results_2026Q2.csv', type: 'file', size: '12.6 MB' },
              { key: 'f-lab2', name: 'Lab_RangeRef.xlsx', type: 'file', size: '88 KB' },
            ],
          },
        ],
      },
      {
        key: 'd-dict', name: '02_数据字典', type: 'folder',
        children: [
          { key: 'f-dict1', name: 'V203_DataDict_v1.3.pdf', type: 'file', size: '1.1 MB' },
          { key: 'f-dict2', name: 'AE_Coding_Map.xlsx', type: 'file', size: '320 KB' },
        ],
      },
      {
        key: 'd-sop', name: '03_方案与SOP', type: 'folder',
        children: [
          { key: 'f-sop1', name: '方案_V203_v2.1.pdf', type: 'file', size: '2.4 MB' },
          { key: 'f-sop2', name: 'SOP_数据录入.docx', type: 'file', size: '180 KB' },
        ],
      },
      {
        key: 'd-out', name: 'Outputs', type: 'folder', hasDescription: true,
        children: [
          {
            key: 'd-out1', name: 'CRF比对_20260605_094230', type: 'folder',
            children: [
              { key: 'f-out1', name: 'diff_report.xlsx', type: 'file', size: '256 KB' },
              { key: 'f-out2', name: 'run_params.json', type: 'file', size: '2 KB' },
              { key: 'f-out3', name: 'execution.log', type: 'file', size: '14 KB' },
            ],
          },
        ],
      },
    ],
  },
  { id: 'ws-v188', name: 'V-188 二期', tree: [] },
  { id: 'ws-templates', name: '常用模板', tree: [] },
];

export const mockMessages: ChatMessage[] = [
  {
    id: nanoid(), role: 'user', type: 'text',
    content: '帮我比对一下本周中心01和中心02提交的 CRF 数据，重点关注主要疗效指标和不良事件部分，导出差异表。',
    createdAt: '09:42',
  },
  {
    id: nanoid(), role: 'assistant', type: 'skill-confirm',
    createdAt: '09:42',
    skillName: '意图识别',
    candidate: mockSkills[0],
    alternatives: [
      { ...mockSkills[7], confidence: 76 },
      { ...mockSkills[3], confidence: 61 },
    ],
    inputFiles: [
      { key: 'f-s1', name: 'Site01_CRF_W23.xlsx', type: 'file' },
      { key: 'f-s2', name: 'Site02_CRF_W23.xlsx', type: 'file' },
      { key: 'd-dict', name: '数据字典/', type: 'folder' },
    ],
    fields: [
      { key: 'dim', label: '比对维度', type: 'select', value: 'eff-ae', options: [
        { label: '主要疗效 + 不良事件（推荐）', value: 'eff-ae' },
        { label: '全字段', value: 'all' },
        { label: '仅人口学', value: 'demo' },
      ]},
      { key: 'tol', label: '数值容差', type: 'text', value: '0.01', helper: '小于此值视为一致' },
      { key: 'fmt', label: '输出格式', type: 'select', value: 'excel', options: [
        { label: 'Excel (差异高亮)', value: 'excel' },
        { label: 'PDF 报告', value: 'pdf' },
      ]},
    ],
    etaSeconds: 45,
    etaTokens: 1200,
    tokenUsage: { prompt: 320, completion: 88, total: 408, durationMs: 1100 },
  },
  {
    id: nanoid(), role: 'assistant', type: 'skill-progress',
    createdAt: '09:43',
    skillName: 'CRF 跨中心数据比对',
    percent: 65, caption: '正在解析 3 个文件 · 比对字段中…',
    steps: [
      { label: '文件加载完成', status: 'done' },
      { label: '字段映射完成', status: 'done' },
      { label: '行级比对中 (412 / 632)', status: 'running' },
      { label: '差异报告生成', status: 'pending' },
    ],
  },
  {
    id: nanoid(), role: 'assistant', type: 'skill-result',
    createdAt: '09:44',
    skillName: 'CRF 跨中心数据比对',
    summary: '比对完成，共扫描 632 条受试者记录，发现 17 处差异，其中 3 处为关键字段不一致，建议优先复核。',
    metrics: [
      { label: '总记录', value: '632', tone: 'primary' },
      { label: '字段差异', value: '17' },
      { label: '关键差异', value: '3', tone: 'danger' },
      { label: '一致率', value: '97.3%', tone: 'success' },
    ],
    table: {
      columns: [
        { key: 'sid', title: '受试者ID' },
        { key: 'field', title: '字段' },
        { key: 's1', title: '中心01' },
        { key: 's2', title: '中心02' },
        { key: 'level', title: '级别' },
      ],
      rows: [
        { sid: 'S203-0117', field: 'SAE发生时间', s1: '2026-05-30 14:20', s2: '2026-05-30 14:00', level: '关键' },
        { sid: 'S203-0204', field: '主要疗效评分', s1: '8.4', s2: '8.7', level: '关键' },
        { sid: 'S203-0301', field: '体温(°C)', s1: '37.2', s2: '37.21', level: '容差内' },
        { sid: 'S203-0418', field: '访视日期', s1: '2026-05-28', s2: '2026-05-29', level: '一般' },
      ],
      warnKeys: ['S203-0117', 'S203-0204'],
    },
    totalRows: 17,
    previewRows: 4,
    outputs: [
      { name: 'diff_report.xlsx', path: 'Outputs/CRF比对_20260605_094230/diff_report.xlsx' },
      { name: 'run_params.json', path: 'Outputs/CRF比对_20260605_094230/run_params.json' },
    ],
    runtimeMs: 42000,
    needsHumanReview: true,
    tokenUsage: { prompt: 4820, completion: 1640, total: 6460, durationMs: 42000 },
  },
  {
    id: nanoid(), role: 'user', type: 'text',
    content: '把上次的关键差异，按受试者整理一份待复核清单发给我。',
    createdAt: '09:46',
  },
  {
    id: nanoid(), role: 'assistant', type: 'text',
    content: '理解为基于刚才的比对结果生成待复核清单，匹配到技能「数据复核清单生成」，将以 3 条关键差异为输入。需要立即执行吗？',
    createdAt: '09:46',
    tokenUsage: { prompt: 520, completion: 92, total: 612, durationMs: 1200 },
  },
];
