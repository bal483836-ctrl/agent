import { useEffect, useRef, useState } from 'react';
import { Button, Input, Space, Tooltip, Upload, type UploadProps, App as AntApp } from 'antd';
import {
  CloudUploadOutlined, ThunderboltOutlined, SendOutlined,
} from '@ant-design/icons';
import useChatStore, { mockSkills } from '@/hooks/useChatStore';

const { TextArea } = Input;

/**
 * 对话输入区。
 * - 自动高度 textarea，Enter 发送、Shift+Enter 换行
 * - "/" 触发斜杠菜单：实时过滤可用技能；选中后插入待执行 Skill 卡
 * - 上传文件：临时上传（仅当次会话有效，24h 后清除）
 * - 技能中心：打开技能中心弹层
 */
export default function InputBox() {
  const { message } = AntApp.useApp();
  const sendUserText = useChatStore((s) => s.sendUserText);
  const openSkillCenter = useChatStore((s) => s.openSkillCenter);
  const insertSkillTrigger = useChatStore((s) => s.insertSkillTrigger);
  const selected = useChatStore((s) => s.selectedContext);

  const [value, setValue] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    setShowSlash(value.trim().startsWith('/'));
  }, [value]);

  const send = () => {
    const text = value.trim();
    if (!text) return;
    sendUserText(text);
    setValue('');
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape') setShowSlash(false);
  };

  const slashItems = mockSkills.slice(0, 6).filter((s) => {
    const q = value.replace(/^\/+/, '').toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  const uploadProps: UploadProps = {
    multiple: true, showUploadList: false,
    beforeUpload: (file) => {
      message.success(`已上传临时文件：${file.name}（会话结束 24h 后自动清除）`);
      return false;
    },
  };

  return (
    <div className="qc-input-area">
      <div className="qc-input-wrap-outer">
        {showSlash && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 8,
            background: '#fff', border: '1px solid #dde6f2', borderRadius: 10,
            boxShadow: '0 12px 32px rgba(37,99,235,0.12)', padding: 6, zIndex: 10,
            maxHeight: 320, overflow: 'auto',
          }}>
            {slashItems.length === 0 && (
              <div style={{ padding: 10, color: '#9ca3af', fontSize: 12 }}>没有匹配的技能</div>
            )}
            {slashItems.map((sk) => (
              <div
                key={sk.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSkillTrigger(sk);
                  setValue(''); setShowSlash(false);
                }}
                style={{
                  display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px',
                  borderRadius: 6, cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 28, height: 28, background: '#eff6ff', borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                }}>{sk.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{sk.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{sk.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          border: '1px solid #dde6f2', borderRadius: 14, padding: '10px 12px',
          background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}>
          <TextArea
            ref={inputRef}
            autoSize={{ minRows: 1, maxRows: 8 }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，输入 / 调起技能，Enter 发送 · Shift+Enter 换行"
            bordered={false}
            style={{ padding: 0, fontSize: 14, resize: 'none' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Space size={6}>
              <Upload {...uploadProps}>
                <Tooltip title="临时上传，仅当次会话有效，24h 后自动清理">
                  <Button size="small" icon={<CloudUploadOutlined />}>上传文件</Button>
                </Tooltip>
              </Upload>
              <Button
                size="small" type="primary" ghost
                icon={<ThunderboltOutlined />}
                onClick={openSkillCenter}
              >技能中心</Button>
            </Space>

            <Space size={12}>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                已选 {selected.length} 个上下文文件
              </span>
              <Button type="primary" shape="circle" icon={<SendOutlined />} onClick={send} />
            </Space>
          </div>
        </div>
      </div>
    </div>
  );
}
