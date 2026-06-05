import { Alert, Button, Space } from 'antd';
import { ReloadOutlined, UserOutlined } from '@ant-design/icons';
import type { SkillErrorMessage } from '@/types';

interface Props { msg: SkillErrorMessage }

export default function ErrorCard({ msg }: Props) {
  return (
    <Alert
      type="error" showIcon
      style={{ marginTop: 10 }}
      message={`${msg.skillName} 执行失败（第 ${msg.attempt} 次）`}
      description={
        <div>
          <div style={{ marginBottom: 6 }}>{msg.reason}</div>
          {msg.suggestion && <div style={{ color: '#374151' }}>建议：{msg.suggestion}</div>}
          <Space style={{ marginTop: 10 }}>
            <Button size="small" icon={<ReloadOutlined />}>重试</Button>
            {msg.attempt >= 2 && (
              <Button size="small" danger icon={<UserOutlined />}>转人工</Button>
            )}
          </Space>
        </div>
      }
    />
  );
}
