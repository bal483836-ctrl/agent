import { useEffect, useState } from 'react';
import {
  Modal, Descriptions, Button, Tag, Space, Divider, Input, Alert, App as AntApp, Spin,
} from 'antd';
import {
  ThunderboltOutlined, SendOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import type { SkillCandidate } from '@/types';
import { api } from '@/api';

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
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skill?.id) { setDetail(null); return; }
    setLoading(true);
    api.skills.detail(skill.id)
      .then(setDetail)
      .catch(() => setDetail(skill))
      .finally(() => setLoading(false));
  }, [skill?.id]);

  if (!skill) return null;
  const showSkill = detail ?? skill;

  const handleApply = async () => {
    try {
      await api.skills.apply(skill.id, reason);
    } catch (e) {
      message.error((e as Error).message);
      return;
    }
    setView('detail');
    setReason('');
    message.success(`已提交「${skill.name}」的使用申请`);
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
        <Spin spinning={loading}>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>{showSkill.description}</p>

          <Descriptions column={2} bordered size="small" labelStyle={{ width: 110 }}>
            <Descriptions.Item label="ID">{showSkill.id}</Descriptions.Item>
            <Descriptions.Item label="分类">{showSkill.category}</Descriptions.Item>
            <Descriptions.Item label="使用次数">
              <ThunderboltOutlined style={{ marginInlineEnd: 4, color: '#2563eb' }} />
              {showSkill.uses ?? 0}
            </Descriptions.Item>
            <Descriptions.Item label="入口">
              <code>{(showSkill as any).entry ?? 'main.py'}</code>
            </Descriptions.Item>
            <Descriptions.Item label="输入类型" span={2}>
              {(((showSkill as any).inputs as string[] | undefined) ?? ['.csv', '.xlsx']).map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="主要参数" span={2}>
              {(((showSkill as any).params as any[] | undefined) ?? []).length === 0 && (
                <span style={{ color: '#9ca3af', fontSize: 12 }}>该技能无可配置参数</span>
              )}
              <ul style={{ margin: 0, paddingInlineStart: 18, color: '#4b5563', fontSize: 13 }}>
                {((showSkill as any).params as any[] | undefined)?.map((p: any) => (
                  <li key={p.key}>
                    <b>{p.label}</b>（<code>{p.key}</code>）
                    {p.helper && <>：{p.helper}</>}
                  </li>
                ))}
              </ul>
            </Descriptions.Item>
            <Descriptions.Item label="上传者" span={2}>
              {(showSkill as any).uploadedBy
                ? <>{(showSkill as any).uploadedBy} · 于 {(showSkill as any).uploadedAt?.slice(0, 10)}</>
                : <span style={{ color: '#9ca3af' }}>系统内置</span>}
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
        </Spin>
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
