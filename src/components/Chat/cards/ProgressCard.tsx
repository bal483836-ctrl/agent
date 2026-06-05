import { Progress, Steps } from 'antd';
import type { SkillProgressMessage } from '@/types';
import { CheckCircleFilled, LoadingOutlined, ClockCircleOutlined } from '@ant-design/icons';

interface Props { msg: SkillProgressMessage }

export default function ProgressCard({ msg }: Props) {
  return (
    <div className="qc-progress-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#4b5563' }}>{msg.caption}</span>
        <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{msg.percent}%</span>
      </div>
      <Progress percent={msg.percent} status="active" showInfo={false} strokeColor={{ from: '#3b82f6', to: '#2563eb' }} />
      <div style={{ marginTop: 10 }}>
        <Steps
          direction="vertical"
          size="small"
          current={msg.steps.findIndex((s) => s.status === 'running')}
          items={msg.steps.map((s) => ({
            title: <span style={{ fontSize: 12 }}>{s.label}</span>,
            status: s.status === 'done' ? 'finish' : s.status === 'running' ? 'process' : 'wait',
            icon: s.status === 'done' ? <CheckCircleFilled style={{ color: '#10b981' }} />
                : s.status === 'running' ? <LoadingOutlined style={{ color: '#2563eb' }} />
                : <ClockCircleOutlined style={{ color: '#cbd5e1' }} />,
          }))}
        />
      </div>
    </div>
  );
}
