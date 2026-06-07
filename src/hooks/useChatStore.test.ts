/**
 * 在 mock 模式下测 useChatStore 的关键路径。
 * 通过 vi.stubEnv 切到 mock 之后 import api。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

beforeAll(() => {
  // vitest 注入 VITE_USE_MOCK=true 让 api 走 mockApi
  vi.stubEnv('VITE_USE_MOCK', 'true');
});

describe('useChatStore（mock 模式）', () => {
  it('bootstrap 后能填充用户/会话/工作区/技能', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    await useChatStore.getState().bootstrap();
    const s = useChatStore.getState();
    expect(s.currentUser).not.toBeNull();
    expect(s.sessions.length).toBeGreaterThan(0);
    expect(s.workspaces.length).toBeGreaterThan(0);
    expect(s.skills.length).toBeGreaterThan(0);
    expect(s.activeSessionId).toBe(s.sessions[0].id);
  });

  it('newSession 在最前插入并切换为当前会话', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    await useChatStore.getState().bootstrap();
    const before = useChatStore.getState().sessions.length;
    await useChatStore.getState().newSession();
    const after = useChatStore.getState().sessions;
    expect(after.length).toBe(before + 1);
    expect(useChatStore.getState().activeSessionId).toBe(after[0].id);
  });

  it('deleteSession 后会切到剩余的第一个会话', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    await useChatStore.getState().bootstrap();
    const initial = useChatStore.getState().sessions[0];
    const initialCount = useChatStore.getState().sessions.length;

    await useChatStore.getState().newSession();
    const targetId = initial.id;
    await useChatStore.getState().deleteSession(targetId);

    const after = useChatStore.getState().sessions;
    expect(after.find((x) => x.id === targetId)).toBeUndefined();
    expect(after.length).toBe(initialCount);  // 新建一个 + 删一个 = 不变
  });

  it('renameSession 更新标题', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    await useChatStore.getState().bootstrap();
    const id = useChatStore.getState().sessions[0].id;
    await useChatStore.getState().renameSession(id, '新标题');
    expect(useChatStore.getState().sessions.find((x) => x.id === id)?.title).toBe('新标题');
  });

  it('toggleLeft / toggleRight / setRightWidth 切 UI 状态', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    const s0 = useChatStore.getState();
    s0.toggleLeft();
    expect(useChatStore.getState().leftCollapsed).toBe(!s0.leftCollapsed);
    s0.toggleRight();
    expect(useChatStore.getState().rightCollapsed).toBe(!s0.rightCollapsed);
    s0.setRightWidth(420);
    expect(useChatStore.getState().rightWidth).toBe(420);
  });

  it('setSelectedContext 替换上下文文件', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    useChatStore.getState().setSelectedContext([
      { key: 'a', name: 'a.csv', type: 'file' },
      { key: 'b', name: 'b/', type: 'folder' },
    ]);
    expect(useChatStore.getState().selectedContext).toHaveLength(2);
  });

  it('appendMessage 把消息加入当前会话', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    await useChatStore.getState().bootstrap();
    const sid = useChatStore.getState().activeSessionId;
    const before = (useChatStore.getState().messages[sid] ?? []).length;
    useChatStore.getState().appendMessage({
      id: 'tm', role: 'user', type: 'text', content: 'hello', createdAt: '00:00',
    });
    const after = useChatStore.getState().messages[sid];
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].id).toBe('tm');
  });

  it('requestHumanHandover 落一条系统消息', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    await useChatStore.getState().bootstrap();
    const sid = useChatStore.getState().activeSessionId;
    const before = (useChatStore.getState().messages[sid] ?? []).length;
    useChatStore.getState().requestHumanHandover('字段对不上');
    const after = useChatStore.getState().messages[sid];
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].type).toBe('text');
    expect((after[after.length - 1] as any).content).toMatch(/人工/);
  });

  it('logout 触发 loggedOut=true', async () => {
    const { default: useChatStore } = await import('./useChatStore');
    await useChatStore.getState().bootstrap();
    await useChatStore.getState().logout();
    expect(useChatStore.getState().loggedOut).toBe(true);
    await useChatStore.getState().loginAgain();
    expect(useChatStore.getState().loggedOut).toBe(false);
  });
});
