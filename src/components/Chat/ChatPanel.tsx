import { useMemo } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { MenuOutlined, FolderOpenOutlined, FolderOutlined, ThunderboltOutlined } from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';
import MessageList from './MessageList';
import InputBox from './InputBox';

/**
 * 对话主面板。
 * - 顶部：折叠按钮、对话标题、工作区上下文 Tag、当前对话累计 token 用量、右栏折叠按钮
 * - 中：消息流
 * - 底：输入区
 */
export default function ChatPanel() {
  const {
    sessions, activeSessionId, messages,
    leftCollapsed, rightCollapsed,
    toggleLeft, toggleRight,
    selectedContext, workspaceId, workspaces,
  } = useChatStore();

  const session = sessions.find((s) => s.id === activeSessionId);
  const ws = workspaces.find((w) => w.id === workspaceId);

  // 累计当前会话所有 AI 消息的 token 使用量
  const sessionTokens = useMemo(() => {
    const list = messages[activeSessionId] ?? [];
    return list.reduce((sum, m) => sum + (m.tokenUsage?.total ?? 0), 0);
  }, [messages, activeSessionId]);

  return (
    <>
      {/* —— 第一行：标题 + 上下文 Tag + 折叠按钮 —— */}
      <div
        style={{
          height: 52, borderBottom: '1px solid #dde6f2', background: '#fff',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
        }}
      >
        <Tooltip title={leftCollapsed ? '展开历史对话' : '折叠历史对话'}>
          <Button icon={<MenuOutlined />} onClick={toggleLeft} />
        </Tooltip>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{session?.title ?? '新对话'}</span>
        <Tag color="blue" icon={<FolderOutlined />} style={{ borderRadius: 12 }}>
          工作区 · {ws?.name ?? '未选择'} · 已选 {selectedContext.length} 项
        </Tag>
        <div style={{ flex: 1 }} />
        <Tooltip title={rightCollapsed ? '展开工作区面板' : '折叠工作区面板'}>
          <Button icon={<FolderOpenOutlined />} onClick={toggleRight} />
        </Tooltip>
      </div>

      {/* —— 第二行：当前对话累计 token 消耗 —— */}
      <div
        style={{
          padding: '6px 20px', background: '#f8fafc',
          borderBottom: '1px solid #eef2f7', fontSize: 12, color: '#475569',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <ThunderboltOutlined style={{ color: '#2563eb' }} />
        当前对话累计消耗
        <b style={{ color: '#2563eb' }}>{sessionTokens.toLocaleString('en-US')}</b>
        tokens
      </div>

      <MessageList />
      <InputBox />
    </>
  );
}
