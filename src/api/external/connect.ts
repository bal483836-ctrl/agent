/**
 * 第一步必须调 /api/connect，否则其它接口会失败（后端按需起 gateway）。
 */
import { extRequest } from './client';
import { EXTERNAL_USER_DEPT, EXTERNAL_USER_ID } from '../env';

let connectedFor: string | null = null;

export function getExternalUserId(): string {
  return localStorage.getItem('qc_ext_user') || EXTERNAL_USER_ID;
}

export function getExternalDept(): string {
  return localStorage.getItem('qc_ext_dept') || EXTERNAL_USER_DEPT;
}

export function setExternalUser(userID: string, dept: string) {
  localStorage.setItem('qc_ext_user', userID);
  localStorage.setItem('qc_ext_dept', dept);
  connectedFor = null;       // 用户变了重新 connect
}

/** 幂等的 connect：同一 userID 只发一次 */
export async function ensureConnected(): Promise<void> {
  const u = getExternalUserId();
  if (connectedFor === u) return;
  await extRequest<unknown>('/api/connect', {
    method: 'POST',
    body: { userID: u, dept: getExternalDept() },
  });
  connectedFor = u;
}

/** 强制 reconnect（如登录其他用户） */
export async function forceConnect(): Promise<void> {
  connectedFor = null;
  await ensureConnected();
}
