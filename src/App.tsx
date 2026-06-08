import { useEffect, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import TopBar from './components/TopBar';
import ChatHistory from './components/Sidebar/ChatHistory';
import ChatPanel from './components/Chat/ChatPanel';
import WorkspacePanel from './components/Workspace/WorkspacePanel';
import SkillCenterModal from './components/SkillCenter/SkillCenterModal';
import LoginGate from './components/LoginGate';
import useChatStore from './hooks/useChatStore';
import { BACKEND_MODE, EXTERNAL_API_BASE, setUnauthorizedHandler } from './api';

/**
 * 三栏布局根组件。
 * - 左侧：历史对话（可折叠）
 * - 中：对话流 + 输入区
 * - 右侧：工作区面板（可折叠 + 可拖拽改宽 240–700px）
 * - 顶层挂载技能中心、个人信息两个全局弹层
 */
export default function App() {
  const leftCollapsed = useChatStore((s) => s.leftCollapsed);
  const rightCollapsed = useChatStore((s) => s.rightCollapsed);
  const rightWidth = useChatStore((s) => s.rightWidth);
  const setRightWidth = useChatStore((s) => s.setRightWidth);
  const loggedOut = useChatStore((s) => s.loggedOut);
  const loading = useChatStore((s) => s.loading);
  const bootstrap = useChatStore((s) => s.bootstrap);
  const currentUser = useChatStore((s) => s.currentUser);
  const [bootError, setBootError] = useState<string | null>(null);

  // 应用启动时拉取用户/会话/工作区/技能
  useEffect(() => {
    setUnauthorizedHandler(() => useChatStore.setState({ loggedOut: true }));
    bootstrap().catch((e) => {
      console.error('bootstrap failed', e);
      setBootError(String((e as Error)?.message ?? e));
    });
  }, [bootstrap]);

  const resizing = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const newW = window.innerWidth - e.clientX;
      // 上限：不超过窗口 60%，避免压缩中间对话区
      const maxRight = Math.floor(window.innerWidth * 0.6);
      setRightWidth(Math.max(280, Math.min(maxRight, newW)));
    };
    const onUp = () => {
      if (resizing.current) {
        resizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setRightWidth]);

  if (loading && !currentUser) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
      }}>
        <Spin size="large" />
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          后端模式：<b>{BACKEND_MODE}</b>
          {BACKEND_MODE === 'external' && <> · base：<code>{EXTERNAL_API_BASE}</code></>}
        </div>
        {bootError && (
          <Alert
            type="error" showIcon style={{ maxWidth: 520 }}
            message="启动失败"
            description={
              <>
                <div style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>{bootError}</div>
                {BACKEND_MODE === 'local' && (
                  <div style={{ fontSize: 12 }}>
                    当前是 <code>local</code> 模式但本地 backend 没起。
                    要么在 <code>.env.local</code> 改 <code>VITE_BACKEND_MODE=external</code>，
                    要么 <code>cd backend && npm run dev</code> 起本地服务。
                  </div>
                )}
                {BACKEND_MODE === 'external' && (
                  <div style={{ fontSize: 12 }}>
                    无法连接同事 OpenClaw 后端。检查 <code>VITE_EXTERNAL_DEV_BACKEND</code> 是否可达。
                  </div>
                )}
              </>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar />
      <div className="qc-layout">
        <aside className={`qc-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <ChatHistory />
        </aside>

        <main className="qc-center">
          <ChatPanel />
        </main>

        <div
          className={`qc-resizer ${rightCollapsed ? 'hidden' : ''}`}
          onMouseDown={(e) => {
            resizing.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
          }}
        />

        <aside
          className={`qc-right ${rightCollapsed ? 'collapsed' : ''}`}
          style={{ width: rightWidth }}
        >
          <WorkspacePanel />
        </aside>
      </div>

      <SkillCenterModal />
      {loggedOut && <LoginGate />}
    </div>
  );
}
