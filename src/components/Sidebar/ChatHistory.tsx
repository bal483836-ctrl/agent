import { useMemo, useState } from 'react';
import { Button, Input, Dropdown, App as AntApp, Modal } from 'antd';
import {
  PlusOutlined, SearchOutlined, MessageOutlined,
  MoreOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';
import type { ChatSession } from '@/types';

const groupTitle: Record<ChatSession['group'], string> = {
  today: '今天', yesterday: '昨天', week: '7 天内', earlier: '更早',
};

/**
 * 左侧历史对话面板。
 * - 新建对话 / 搜索 / 按时间分组
 * - 单条悬停显示操作菜单：重命名、删除
 */
export default function ChatHistory() {
  const { sessions, activeSessionId, setActiveSession, newSession, renameSession, deleteSession } =
    useChatStore();
  const { modal } = AntApp.useApp();
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const filtered = sessions.filter((s) => s.title.includes(search));
    const groups: Record<string, ChatSession[]> = {};
    for (const g of ['today', 'yesterday', 'week', 'earlier'] as const) {
      const arr = filtered.filter((s) => s.group === g);
      if (arr.length) groups[g] = arr;
    }
    return groups;
  }, [sessions, search]);

  const onRename = (s: ChatSession) => {
    let title = s.title;
    modal.confirm({
      title: '重命名对话',
      content: (
        <Input
          defaultValue={s.title}
          onChange={(e) => { title = e.target.value; }}
          maxLength={48}
        />
      ),
      onOk: () => renameSession(s.id, title.trim() || s.title),
    });
  };

  const onDelete = (s: ChatSession) => {
    Modal.confirm({
      title: '删除对话',
      content: `确定要删除「${s.title}」吗？删除后无法恢复。`,
      okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: () => deleteSession(s.id),
    });
  };

  return (
    <>
      <div style={{ padding: 14 }}>
        <Button type="primary" block icon={<PlusOutlined />} onClick={newSession}>
          新建对话
        </Button>
      </div>
      <div style={{ padding: '0 14px 8px' }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索对话历史…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 14px' }}>
        {Object.keys(grouped).length === 0 && (
          <div style={{ padding: 16, color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
            没有匹配的对话
          </div>
        )}
        {(Object.keys(grouped) as ChatSession['group'][]).map((g) => (
          <div key={g}>
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '12px 8px 4px' }}>
              {groupTitle[g]}
            </div>
            {grouped[g].map((s) => {
              const active = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, background: active ? '#dbeafe' : 'transparent',
                    color: active ? '#1e40af' : '#4b5563',
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <MessageOutlined style={{ fontSize: 12, color: active ? '#2563eb' : '#9ca3af' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </span>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'rename', icon: <EditOutlined />, label: '重命名', onClick: () => onRename(s) },
                        { key: 'delete', icon: <DeleteOutlined />, danger: true, label: '删除', onClick: () => onDelete(s) },
                      ],
                    }}
                  >
                    <MoreOutlined onClick={(e) => e.stopPropagation()} />
                  </Dropdown>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
