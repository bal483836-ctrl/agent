import { BACKEND_MODE } from './env';
import { request, buildWsUrl } from './http';
import type { SkillCandidate, SkillResultMessage } from '@/types';
import type { Closeable, RunStreamEvent } from './types';
import { externalRunsApi } from './external';

export interface RunsApi {
  /** 异步启动一次技能执行，返回 runId
   *  contextFiles 携带完整 {key,name,type}，后端可据此展开文件夹 */
  start(
    skillId: string,
    params: Record<string, unknown>,
    contextFiles: { key: string; name: string; type: 'folder' | 'file' }[],
  ): Promise<{ runId: string }>;
  /** 订阅执行进度（WebSocket）。事件通过 onEvent 推送 */
  subscribe(runId: string, onEvent: (e: RunStreamEvent) => void): Closeable;
}

/* ---------- real：HTTP 启动 + WebSocket 订阅 ---------- */
const realApi: RunsApi = {
  start: (skillId, params, contextFiles) =>
    request<{ runId: string }>(`/skills/${skillId}/run`, {
      method: 'POST',
      body: { params, contextFiles, fileKeys: contextFiles.map((c) => c.key) },
    }),
  subscribe(runId, onEvent) {
    const ws = new WebSocket(buildWsUrl(`/runs/${runId}/events`));
    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(ev.data) as RunStreamEvent); }
      catch { /* ignore */ }
    };
    ws.onerror = () => onEvent({ type: 'error', reason: 'websocket error' });
    return { close: () => ws.close() };
  },
};

/* ---------- mock：定时器模拟进度推送 ---------- */
const mockApi: RunsApi = {
  async start(skillId, _params, _ctx) { return { runId: `run-${Date.now()}-${skillId}` }; },
  subscribe(runId, onEvent) {
    let stopped = false;
    const phases: { p: number; c: string; steps: { label: string; status: 'done' | 'running' | 'pending' }[] }[] = [
      { p: 10, c: '开始执行…', steps: [
        { label: '输入文件加载', status: 'running' },
        { label: '参数校验', status: 'pending' },
        { label: '主流程执行', status: 'pending' },
        { label: '输出归档', status: 'pending' },
      ]},
      { p: 30, c: '解析输入文件…', steps: [
        { label: '输入文件加载', status: 'done' },
        { label: '参数校验', status: 'running' },
        { label: '主流程执行', status: 'pending' },
        { label: '输出归档', status: 'pending' },
      ]},
      { p: 60, c: '执行主流程…', steps: [
        { label: '输入文件加载', status: 'done' },
        { label: '参数校验', status: 'done' },
        { label: '主流程执行', status: 'running' },
        { label: '输出归档', status: 'pending' },
      ]},
      { p: 90, c: '归档输出文件…', steps: [
        { label: '输入文件加载', status: 'done' },
        { label: '参数校验', status: 'done' },
        { label: '主流程执行', status: 'done' },
        { label: '输出归档', status: 'running' },
      ]},
    ];

    let i = 0;
    const tick = () => {
      if (stopped) return;
      if (i < phases.length) {
        const ph = phases[i++];
        onEvent({ type: 'progress', percent: ph.p, caption: ph.c });
        for (const st of ph.steps) onEvent({ type: 'step', label: st.label, status: st.status });
        setTimeout(tick, 700);
      } else {
        // 最终结果
        const result: Partial<SkillResultMessage> = {
          summary: '已完成，输出包已归档到 Outputs/ 目录。',
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
            { name: 'report.xlsx', path: `Outputs/${runId}/report.xlsx` },
            { name: 'run_params.json', path: `Outputs/${runId}/run_params.json` },
          ],
          runtimeMs: 4200,
        };
        onEvent({ type: 'result', payload: result });
        onEvent({ type: 'usage', usage: { prompt: 3200, completion: 1100, total: 4300, durationMs: 4200 } });
        onEvent({ type: 'done' });
      }
    };
    setTimeout(tick, 200);
    return { close: () => { stopped = true; } };
  },
};

function pickRunsApi(): RunsApi {
  if (BACKEND_MODE === 'external') return externalRunsApi;
  if (BACKEND_MODE === 'local') return realApi;
  return mockApi;
}
export const runsApi: RunsApi = pickRunsApi();
