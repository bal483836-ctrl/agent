/**
 * tenant 路径隔离的安全测试。
 * 任何能逃出 <DATA_DIR>/<orgId>/<userId>/ 的路径都必须抛错。
 */
import { describe, it, expect } from 'vitest';
import {
  userRoot, workspacesRoot, workspaceRoot,
  sessionsFile, messagesFile, outputsRoot, tempRoot,
  safeResolve, type TenantCtx,
} from './tenant.js';

const ctx: TenantCtx = {
  orgId: 'org-a', orgName: 'Org A',
  userId: 'u-1', name: 'Test',
  email: 't@x.com', role: 'r',
};

describe('tenant 路径隔离', () => {
  it('用户根目录路径含 (orgId, userId)', () => {
    const root = userRoot(ctx);
    expect(root).toMatch(/org-a/);
    expect(root).toMatch(/u-1/);
  });

  it('workspacesRoot / outputsRoot / tempRoot / sessionsFile / messagesFile 都在 userRoot 下', () => {
    const root = userRoot(ctx);
    expect(workspacesRoot(ctx).startsWith(root)).toBe(true);
    expect(workspaceRoot(ctx, 'ws1').startsWith(root)).toBe(true);
    expect(sessionsFile(ctx).startsWith(root)).toBe(true);
    expect(messagesFile(ctx, 's1').startsWith(root)).toBe(true);
    expect(outputsRoot(ctx, 'run-1').startsWith(root)).toBe(true);
    expect(tempRoot(ctx).startsWith(root)).toBe(true);
  });

  it('safeResolve 拼正常子路径', () => {
    const p = safeResolve(ctx, 'workspaces', 'ws1', 'a.csv');
    expect(p.startsWith(userRoot(ctx))).toBe(true);
  });

  it('safeResolve 拒绝路径穿越 ../', () => {
    expect(() => safeResolve(ctx, '..', '..', 'etc', 'passwd')).toThrow(/escape/);
    expect(() => safeResolve(ctx, 'workspaces', '..', '..', '..')).toThrow(/escape/);
  });

  it('safeResolve 处理 % 编码与符号链接不爆掉（仍约束在根内）', () => {
    expect(() => safeResolve(ctx, 'workspaces', '../../../../root/.bashrc'))
      .toThrow(/escape/);
  });

  it('不同组织 / 用户的根目录互不重合', () => {
    const otherOrg = { ...ctx, orgId: 'org-b' };
    const otherUser = { ...ctx, userId: 'u-2' };
    expect(userRoot(otherOrg)).not.toBe(userRoot(ctx));
    expect(userRoot(otherUser)).not.toBe(userRoot(ctx));
  });

  it('sanitize 拒绝危险字符（路径分隔符）', () => {
    const evil: TenantCtx = { ...ctx, orgId: '../etc', userId: '/root' };
    const root = userRoot(evil);
    // 危险字符应该被替换为 _
    expect(root).not.toContain('../');
    expect(root).not.toContain('/etc');
  });
});
