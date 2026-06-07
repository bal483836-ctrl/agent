/**
 * 审计日志：按需求 3.4.3.4 — 每次技能执行（及关键操作）落 JSONL，不可删除。
 * 路径：<DATA_DIR>/<orgId>/_audit/<YYYY-MM-DD>.jsonl
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import type { TenantCtx } from './tenant.js';

export interface AuditRecord {
  ts: string;
  orgId: string;
  userId: string;
  action: string;
  skillId?: string;
  runId?: string;
  inputs?: { key: string; name: string; sha256?: string }[];
  params?: Record<string, unknown>;
  status?: 'success' | 'failure' | 'pending';
  outputRefs?: string[];
  reason?: string;
  extra?: Record<string, unknown>;
}

function auditDir(orgId: string): string {
  return path.join(config.paths.dataDir, orgId.replace(/[^A-Za-z0-9_-]/g, '_'), '_audit');
}

export async function audit(tenant: TenantCtx, record: Omit<AuditRecord, 'ts' | 'orgId' | 'userId'>): Promise<void> {
  const dir = auditDir(tenant.orgId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    orgId: tenant.orgId,
    userId: tenant.userId,
    ...record,
  }) + '\n';
  await fs.appendFile(file, line, 'utf-8');
}
