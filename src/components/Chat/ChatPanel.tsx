import { Button, Tag, Tooltip } from 'antd';
import {
  MenuOutlined, FolderOpenOutlined, FolderOutlined,
} from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';
import MessageList from './MessageList';
import InputBox from './InputBox';
import { mockWorkspaces } from '@/mock/data';

export default function ChatPanel() {
  const { sessions, activeSessionId, leftCollapsed, rightCollapsed, toggleLeft, toggleRight, selectedContext, workspaceId } =
    useChatStore();
  const session = sessions.find((s) => s.id === activeSessionId);
  const ws = mockWorkspaces.find((w) => w.id === workspaceId);

  return (
    <>
      <div style={{
        height: 52, borderBottom: '1px solid #dde6f2', background: '#fff',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
      }}>
        <Tooltip title={leftCollapsed ? '展开历史对话' : '折叠历史对话'}>
          <Button icon={<MenuOutlined />} onClick={toggleLeft} />
        </Tooltip>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {session?.title ?? '新对话'}
        </span>
        <Tag color="blue" icon={<FolderOutlined />} style={{ borderRadius: 12 }}>
          工作区 · {ws?.name ?? '未选择'} · 已选 {selectedContext.length} 项
        </Tag>
        <div style={{ flex: 1 }} />
        <Tooltip title={rightCollapsed ? '展开工作区面板' : '折叠工作区面板'}>
          <Button icon={<FolderOpenOutlined />} onClick={toggleRight} />
        </Tooltip>
      </div>

      <MessageList />
      <InputBox />
    </>
  );
}
