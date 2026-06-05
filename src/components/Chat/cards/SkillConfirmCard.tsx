import { useState } from 'react';
import { Button, Form, Input, Select, Tag, Space, Tooltip, Divider } from 'antd';
import { ThunderboltOutlined, FileTextOutlined, FolderOpenOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { SkillConfirmMessage } from '@/types';
import useChatStore from '@/hooks/useChatStore';

interface Props {
  msg: SkillConfirmMessage;
}

export default function SkillConfirmCard({ msg }: Props) {
  const [form] = Form.useForm();
  const runSkill = useChatStore((s) => s.runSkill);
  const [picked] = useState(msg.candidate);

  return (
    <div className="qc-skill-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: '#2563eb', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>
          {picked.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{picked.name}</span>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>Skill</Tag>
            {picked.mine && <Tag color="gold" style={{ marginInlineEnd: 0 }}>本组织</Tag>}
            {typeof picked.confidence === 'number' && (
              <Tag color={picked.confidence > 80 ? 'green' : 'orange'} style={{ marginInlineEnd: 0 }}>
                置信度 {picked.confidence}%
              </Tag>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{picked.description}</div>
        </div>
        <Button size="small" icon={<InfoCircleOutlined />}>详情</Button>
      </div>

      {msg.alternatives && msg.alternatives.length > 0 && (
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
          其他候选：
          {msg.alternatives.map((a) => (
            <a key={a.id} style={{ marginInlineEnd: 8 }}>
              {a.name} [{a.confidence ?? '-'}%]
            </a>
          ))}
        </div>
      )}

      <Divider style={{ margin: '10px 0' }} />

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>输入文件（来自右侧上下文）</div>
        <Space wrap size={[6, 6]}>
          {msg.inputFiles.length === 0 && <span style={{ color: '#9ca3af', fontSize: 12 }}>未选择</span>}
          {msg.inputFiles.map((f) => (
            <Tag
              key={f.key}
              icon={f.type === 'folder' ? <FolderOpenOutlined /> : <FileTextOutlined />}
              style={{ borderRadius: 12, background: '#fff' }}
            >
              {f.name}
            </Tag>
          ))}
        </Space>
      </div>

      <Form form={form} layout="vertical" size="small" style={{ marginBottom: 10 }}
        initialValues={Object.fromEntries(msg.fields.map((f) => [f.key, f.value]))}>
        {msg.fields.map((field) => (
          <Form.Item
            key={field.key}
            label={field.label}
            name={field.key}
            tooltip={field.helper}
            style={{ marginBottom: 8 }}
          >
            {field.type === 'select' ? (
              <Select options={field.options} />
            ) : (
              <Input />
            )}
          </Form.Item>
        ))}
      </Form>

      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 14, marginBottom: 10 }}>
        <span>⏱ 预估耗时 ~{msg.etaSeconds}s</span>
        <span>⚡ 预估消耗 ~{msg.etaTokens.toLocaleString('en-US')} tokens</span>
      </div>

      <Space>
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => runSkill(picked)}>
          执行
        </Button>
        <Button>修改参数</Button>
        <Tooltip title="如果识别不准确，可换一个技能">
          <Button>换一个技能</Button>
        </Tooltip>
      </Space>
    </div>
  );
}
