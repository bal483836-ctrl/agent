import { useEffect, useRef } from 'react';
import { Empty } from 'antd';
import useChatStore from '@/hooks/useChatStore';
import MessageBubble from './MessageBubble';

export default function MessageList() {
  const messages = useChatStore((s) => s.messages[s.activeSessionId] ?? []);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  return (
    <div className="qc-messages" ref={ref}>
      {messages.length === 0 ? (
        <div style={{ marginTop: 80 }}>
          <Empty description="新对话 · 输入消息或 / 调起技能" />
        </div>
      ) : (
        messages.map((m) => <MessageBubble key={m.id} msg={m} />)
      )}
    </div>
  );
}
