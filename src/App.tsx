import { useEffect, useRef } from 'react';
import TopBar from './components/TopBar';
import ChatHistory from './components/Sidebar/ChatHistory';
import ChatPanel from './components/Chat/ChatPanel';
import WorkspacePanel from './components/Workspace/WorkspacePanel';
import SkillCenterModal from './components/SkillCenter/SkillCenterModal';
import useChatStore from './hooks/useChatStore';

export default function App() {
  const leftCollapsed = useChatStore((s) => s.leftCollapsed);
  const rightCollapsed = useChatStore((s) => s.rightCollapsed);
  const rightWidth = useChatStore((s) => s.rightWidth);
  const setRightWidth = useChatStore((s) => s.setRightWidth);

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
    </div>
  );
}
