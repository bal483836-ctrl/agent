import { BACKEND_MODE, API_BASE } from './env';
import { request, getToken } from './http';
import type { WsNode } from '@/types';
import { externalFilesApi } from './external';

export interface FilesApi {
  /** 上传文件到指定工作区。后端建议返回创建后的 WsNode */
  uploadToWorkspace(
    workspaceId: string,
    parentKey: string | null,
    file: File,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<WsNode>;
  /** 临时上传（仅当次会话有效，24h 自动清理） */
  uploadTemp(file: File): Promise<{ tempKey: string; name: string; expireAt: string }>;
  /** 下载工作区文件 */
  download(key: string): Promise<Blob>;
  /** 下载技能执行输出文件（相对 outputs/ 根的路径，如 "report_xxx/diff.xlsx"） */
  downloadOutput(relPath: string): string;
  /** 计算 SHA-256（前端做，传给后端比对） */
  sha256(file: File): Promise<string>;
}

/* ---------- real ---------- */
const realApi: FilesApi = {
  async uploadToWorkspace(workspaceId, parentKey, file, onProgress) {
    // 多部分表单 + XHR 以支持上传进度（fetch 暂不支持）
    return new Promise<WsNode>((resolve, reject) => {
      const fd = new FormData();
      if (parentKey) fd.append('parentKey', parentKey);
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE.replace(/\/$/, '')}/workspaces/${workspaceId}/files`);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => onProgress?.(e.loaded, e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(e); }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.send(fd);
    });
  },
  uploadTemp: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/temp-files', { method: 'POST', body: fd });
  },
  download: (key) => request<Blob>(`/files/${key}/download`, { raw: true }) as unknown as Promise<Blob>,
  downloadOutput: (relPath: string) => {
    const token = getToken();
    const q = `path=${encodeURIComponent(relPath)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    return `${API_BASE.replace(/\/$/, '')}/outputs/download?${q}`;
  },
  sha256,
};

/* ---------- mock ---------- */
const mockApi: FilesApi = {
  async uploadToWorkspace(_ws, _p, file, onProgress) {
    if (onProgress) {
      for (let i = 0; i <= 100; i += 25) {
        await sleep(80);
        onProgress((file.size * i) / 100, file.size);
      }
    }
    return {
      key: `f-${Date.now()}`, name: file.name, type: 'file', size: fmtSize(file.size),
    };
  },
  async uploadTemp(file) {
    return {
      tempKey: `tmp-${Date.now()}`,
      name: file.name,
      expireAt: new Date(Date.now() + 86400000).toISOString(),
    };
  },
  async download(_key) { return new Blob([]); },
  downloadOutput: (relPath: string) => `data:application/json,${encodeURIComponent(JSON.stringify({ mockOutput: relPath }))}`,
  sha256,
};

/* ---------- 工具 ---------- */
async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/* ---------- 业务约束（前端先校验，后端再校验一次） ---------- */
export const UPLOAD_LIMITS = {
  singleFileBytes: 500 * 1024 * 1024,    // 500 MB
  totalBytes: 2 * 1024 * 1024 * 1024,    // 2 GB
  maxFiles: 200,
};

function pickFilesApi(): FilesApi {
  if (BACKEND_MODE === 'external') return externalFilesApi;
  if (BACKEND_MODE === 'local') return realApi;
  return mockApi;
}
export const filesApi: FilesApi = pickFilesApi();
