import { useState } from 'react';
import {
  Modal, Descriptions, Button, Tag, Space, Divider, Input, Alert, App as AntApp,
} from 'antd';
import {
  ThunderboltOutlined, SendOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import type { SkillCandidate } from '@/types';

/**
 * 技能详情弹层。
 * - 主视图：展示技能的完整信息（输入格式、参数说明、输出示例缩略图）
 * - 申请使用：点「申请使用」切到表单视图，可选填写申请理由
 *
 * 注：按需求 3.4.1，组织内技能默认全员可用。这里的「申请使用」对应一些组织
 * 选择开启准入审批的场景（mock 直接发"提交申请"）。
 */
interface Props {
  skill: SkillCandidate | null;
  onClose: () => void;
  onApprovedUse: (skill: SkillCandidate) => void;
}

export default function SkillDetailModal({ skill, onClose, onApprovedUse }: Props) {
  const { message } = AntApp.useApp();
  const [view, setView] = useState<'detail' | 'apply'>('detail');
  const [reason, setReason] = useState('');

  if (!skill) return null;

  const handleApply = () => {
    setView('detail');
    setReason('');
    message.success(`已提交「${skill.name}」的使用申请，审批通过后可直接调用`);
    onApprovedUse(skill);
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          {view === 'apply' && (
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setView('detail')} />
          )}
          <span style={{ fontSize: 20 }}>{skill.icon}</span>
          <span>{skill.name}</span>
          <Tag color="blue">Skill</Tag>
          {skill.mine && <Tag color="gold">本组织</Tag>}
        </Space>
      }
      open={!!skill}
      onCancel={() => { setView('detail'); setReason(''); onClose(); }}
      width={680}
      footer={null}
      destroyOnClose
    >
      {view === 'detail' ? (
        <>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>{skill.description}</p>

          <Descriptions column={2} bordered size="small" labelStyle={{ width: 110 }}>
            <Descriptions.Item label="分类">{skill.category}</Descriptions.Item>
            <Descriptions.Item label="使用次数">
              <ThunderboltOutlined style={{ marginInlineEnd: 4, color: '#2563eb' }} />
              {skill.uses}
            </Descriptions.Item>
            <Descriptions.Item label="输入类型" span={2}>
              <Tag>.xlsx</Tag><Tag>.csv</Tag><Tag>.pdf</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="主要参数" span={2}>
              <ul style={{ margin: 0, paddingInlineStart: 18, color: '#4b5563', fontSize: 13 }}>
                <li><b>比对维度</b>：选择要比对的字段范围</li>
                <li><b>数值容差</b>：小于此值视为一致（默认 0.01）</li>
                <li><b>输出格式</b>：Excel（推荐）/ PDF</li>
              </ul>
            </Descriptions.Item>
            <Descriptions.Item label="输出示例" span={2}>
              <div style={{
                background: '#f8fafc', border: '1px dashed #cbd5e1',
                padding: '10px 12px', borderRadius: 6, fontSize: 12, color: '#475569',
              }}>
                📑 diff_report.xlsx · 差异高亮 · 含字段比对明细 + 汇总统计
              </div>
            </Descriptions.Item>
          </Descriptions>

          <Divider />

          <Space>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => onApprovedUse(skill)}>
              直接使用
            </Button>
            <Button icon={<SendOutlined />} onClick={() => setView('apply')}>
              申请使用
            </Button>
          </Space>
        </>
      ) : (
        <>
          <Alert
            type="info" showIcon style={{ marginBottom: 16 }}
            message="申请使用技能"
            description="可选填写申请理由。提交后由所在组织管理员审批，通过后即可在对话中直接调用。"
          />
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
            申请理由 <span style={{ color: '#9ca3af' }}>（选填）</span>
          </div>
          <Input.TextArea
            rows={5}
            placeholder="例如：用于 V-203 项目本周中心数据交叉核对，预计每周使用 2-3 次"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            showCount
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setView('detail')}>取消</Button>
            <Button type="primary" icon={<SendOutlined />} onClick={handleApply}>
              提交申请
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
