import { Avatar, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';

/**
 * 顶部品牌栏。
 * - 左：量子链 Logo 与中英文品牌
 * - 右：当前用户头像（点击弹出用户信息）
 */
const Logo = () => (
  <svg
    width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="2.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
  </svg>
);

export default function TopBar() {
  const user = useChatStore((s) => s.currentUser);
  const openProfile = useChatStore((s) => s.openProfile);

  return (
    <header className="qc-topbar">
      {/* 品牌 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingRight: 16, borderRight: '1px solid #dde6f2',
        }}
      >
        <div
          style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
          }}
        >
          <Logo />
        </div>
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, color: '#2563eb' }}>
            量子链
          </div>
          <div style={{ fontSize: 9, letterSpacing: 2.5, color: '#9ca3af', marginTop: 4 }}>
            QUANTUM CHAIN
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* 用户头像：点击查看个人信息 */}
      <Tooltip title={`${user.name} · 点击查看个人信息`}>
        <Avatar
          onClick={openProfile}
          style={{
            background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
            cursor: 'pointer',
          }}
          icon={<UserOutlined />}
        />
      </Tooltip>
    </header>
  );
}
