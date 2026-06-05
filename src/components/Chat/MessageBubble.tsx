import { Avatar, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { ChatMessage } from '@/types';
import SkillConfirmCard from './cards/SkillConfirmCard';
import ProgressCard from './cards/ProgressCard';
import ResultCard from './cards/ResultCard';
import ErrorCard from './cards/ErrorCard';
import TokenUsage from './cards/TokenUsage';

/**
 * 单条消息渲染。
 * - 用户消息：行 flex-direction:row-reverse，气泡 inline-block 靠右
 * - AI 消息：气泡左对齐，下方挂 TokenUsage 显示本次消耗
 * - 消息体根据 type 动态渲染：text / skill-confirm / skill-progress / skill-result / skill-error
 */
interface Props { msg: ChatMessage }

const AIAvatar = () => (
  <Avatar
    size={32}
    style={{
      background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
      color: '#fff', fontWeight: 600, fontSize: 12,
    }}
  >QC</Avatar>
);

const UserAvatar = () => (
  <Avatar size={32} icon={<UserOutlined />} style={{ background: '#6b7280' }} />
);

export default function MessageBubble({ msg }: Props) {
  const isUser = msg.role === 'user';

  return (
    <div className={`qc-message-row ${isUser ? 'user' : 'ai'}`}>
      {isUser ? <UserAvatar /> : <AIAvatar />}
      <div className="qc-msg-body">
        <div className="qc-msg-name">
          {isUser ? '张研究员' : 'QUANTUM CHAIN'} · {msg.createdAt}
          {msg.skillName && !isUser && (
            <Tag color="blue" style={{ marginInlineStart: 8 }}>{msg.skillName}</Tag>
          )}
        </div>

        {/* 内容主体 */}
        {msg.type === 'text' && (
          <div className={`qc-bubble ${isUser ? 'user' : 'ai'}`}>{msg.content}</div>
        )}

        {msg.type === 'skill-confirm' && (
          <div className="qc-bubble ai">
            已识别到您要执行 <b style={{ color: '#2563eb' }}>{msg.candidate.name}</b>
            （置信度 <b style={{ color: '#10b981' }}>{msg.candidate.confidence ?? 92}%</b>）。请确认参数后执行：
            <SkillConfirmCard msg={msg} />
          </div>
        )}

        {msg.type === 'skill-progress' && (
          <div className="qc-bubble ai">
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              {msg.skillName} · 执行中
            </div>
            <ProgressCard msg={msg} />
          </div>
        )}

        {msg.type === 'skill-result' && (
          <div className="qc-bubble ai">
            <ResultCard msg={msg} />
          </div>
        )}

        {msg.type === 'skill-error' && (
          <div className="qc-bubble ai">
            <ErrorCard msg={msg} />
          </div>
        )}

        {/* token 用量：仅 AI 消息且存在 usage 时显示 */}
        {!isUser && msg.tokenUsage && (
          <TokenUsage usage={msg.tokenUsage} />
        )}
      </div>
    </div>
  );
}
