import { useEffect, useRef } from 'react';
import { Spin } from 'antd';
import TopBar from './components/TopBar';
import ChatHistory from './components/Sidebar/ChatHistory';
import ChatPanel from './components/Chat/ChatPanel';
import WorkspacePanel from './components/Workspace/WorkspacePanel';
import SkillCenterModal from './components/SkillCenter/SkillCenterModal';
import LoginGate from './components/LoginGate';
import useChatStore from './hooks/useChatStore';
import { setUnauthorizedHandler } from './api';

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

  // 应用启动时拉取用户/会话/工作区/技能
  useEffect(() => {
    setUnauthorizedHandler(() => useChatStore.setState({ loggedOut: true }));
    bootstrap().catch((e) => {
      // bootstrap 失败时也不阻塞渲染，由错误边界 / 登录页接管
      console.error('bootstrap failed', e);
    });
  }, [bootstrap]);

  const resizing = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const newW = window.innerWidth - e.clientX;
      setRightWidth(Math.max(240, Math.min(700, newW)));
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
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Spin size="large" tip="加载中..." />
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
