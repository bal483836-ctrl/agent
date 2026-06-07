import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { audit } from './audit.js';
import type { TenantCtx } from './tenant.js';

beforeAll(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qc-test-'));
  config.paths.dataDir = tmp;
});

describe('审计日志', () => {
  it('audit() 追加可读 JSONL 行', async () => {
    const ctx: TenantCtx = {
      orgId: 'org-' + nanoid(4), orgName: '',
      userId: 'u-' + nanoid(4), name: '', email: '', role: '',
    };
    await audit(ctx, { action: 'skill.run.start', skillId: 'csv_diff', status: 'pending' });
    await audit(ctx, { action: 'skill.run.end', skillId: 'csv_diff', status: 'success' });

    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(
      config.paths.dataDir,
      ctx.orgId,
      '_audit', `${day}.jsonl`,
    );
    const data = await fs.readFile(file, 'utf-8');
    const lines = data.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);

    const r0 = JSON.parse(lines[0]);
    const r1 = JSON.parse(lines[1]);
    expect(r0.action).toBe('skill.run.start');
    expect(r0.orgId).toBe(ctx.orgId);
    expect(r0.userId).toBe(ctx.userId);
    expect(r1.action).toBe('skill.run.end');
    expect(r1.status).toBe('success');
    // 记录必须有时间戳
    expect(new Date(r0.ts).toString()).not.toBe('Invalid Date');
  });
});
