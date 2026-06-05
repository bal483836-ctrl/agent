import { Avatar, Badge, Space, Tag, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';

const Logo = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
  </svg>
);

export default function TopBar() {
  return (
    <header className="qc-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 16, borderRight: '1px solid #dde6f2' }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: 'linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
        }}>
          <Logo />
        </div>
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, color: '#2563eb' }}>量子链</div>
          <div style={{ fontSize: 9, letterSpacing: 2.5, color: '#9ca3af', marginTop: 4 }}>QUANTUM CHAIN</div>
        </div>
      </div>

      <Tag color="blue" style={{ borderRadius: 20, padding: '3px 12px' }}>
        <Badge status="success" text="协和疫苗研究中心" />
      </Tag>

      <div style={{ flex: 1 }} />

      <Space size={10}>
        <Tooltip title="所有服务运行中">
          <Tag color="default" style={{ borderRadius: 6 }}>● 服务正常</Tag>
        </Tooltip>
        <Tooltip title="当月消耗 token 累计">
          <Tag color="default" style={{ borderRadius: 6 }}>本月用量 1.2K tokens</Tag>
        </Tooltip>
        <Avatar style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)' }} icon={<UserOutlined />} />
      </Space>
    </header>
  );
}
