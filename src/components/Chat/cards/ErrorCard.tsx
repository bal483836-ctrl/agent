import { Alert, Button, Modal, Space, Input, App as AntApp } from 'antd';
import { ReloadOutlined, UserOutlined } from '@ant-design/icons';
import type { SkillErrorMessage } from '@/types';
import useChatStore from '@/hooks/useChatStore';

interface Props { msg: SkillErrorMessage }

/**
 * 错误卡 —— 真功能：
 *  - 重试：用相同 skill 重新发起执行（store.runSkill）
 *  - 转人工：弹层填问题描述 → 调 store.requestHumanHandover 落地系统消息
 *  - 第 2 次起会自动提示"是否转人工"
 */
export default function ErrorCard({ msg }: Props) {
  const { modal } = AntApp.useApp();
  const runSkill = useChatStore((s) => s.runSkill);
  const skills = useChatStore((s) => s.skills);
  const requestHandover = useChatStore((s) => s.requestHumanHandover);

  const skill = skills.find((s) => s.name === msg.skillName) ?? skills[0];

  const retry = () => {
    if (skill) runSkill(skill);
  };

  const handoff = () => {
    let reason = '';
    modal.confirm({
      title: '转人工',
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>请简要描述需要专家协助的问题：</p>
          <Input.TextArea
            rows={3}
            placeholder="例如：连续失败 2 次，怀疑输入字段不匹配"
            onChange={(e) => { reason = e.target.value; }}
          />
        </div>
      ),
      onOk: () => requestHandover(reason || `「${msg.skillName}」连续失败需要专家协助`),
      okText: '提交', cancelText: '取消',
    });
  };

  return (
    <Alert
      type="error" showIcon
      style={{ marginTop: 10 }}
      message={`${msg.skillName} 执行失败（第 ${msg.attempt} 次）`}
      description={
        <div>
          <div style={{ marginBottom: 6 }}>{msg.reason}</div>
          {msg.suggestion && <div style={{ color: '#374151' }}>建议：{msg.suggestion}</div>}
          {msg.attempt >= 2 && (
            <div style={{ marginTop: 6, color: '#dc2626' }}>
              ⚠ 该技能在本会话已连续失败 {msg.attempt} 次，是否转人工？
            </div>
          )}
          <Space style={{ marginTop: 10 }}>
            <Button size="small" icon={<ReloadOutlined />} onClick={retry}>重试</Button>
            <Button size="small" danger icon={<UserOutlined />} onClick={handoff}>转人工</Button>
          </Space>
        </div>
      }
    />
  );
}
