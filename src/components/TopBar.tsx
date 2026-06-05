import { useState } from 'react';
import { Avatar, Button, Divider, Popover, Tag, App as AntApp } from 'antd';
import {
  UserOutlined, MailOutlined, IdcardOutlined, CalendarOutlined,
  TeamOutlined, LogoutOutlined,
} from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';

/**
 * 顶部品牌栏。
 * - 左：量子链 Logo + 中英文品牌
 * - 右：头像；点击展开下拉面板（Popover）显示用户信息与退出登录入口
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

/** 内联展开的个人信息面板 */
function ProfileContent({ onClose }: { onClose: () => void }) {
  const user = useChatStore((s) => s.currentUser);
  const logout = useChatStore((s) => s.logout);
  const { message } = AntApp.useApp();

  return (
    <div style={{ width: 280 }}>
      {/* 头像 + 姓名 + 角色 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px 12px' }}>
        <Avatar
          size={48} icon={<UserOutlined />}
          style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)' }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{user.name}</div>
          <div style={{ marginTop: 4 }}>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>{user.role}</Tag>
          </div>
        </div>
      </div>

      <Divider style={{ margin: '4px 0 10px' }} />

      {/* 信息列表 */}
      <div style={{ fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <InfoRow icon={<TeamOutlined />} label="组织" value={user.organization} />
        <InfoRow icon={<MailOutlined />} label="邮箱" value={user.email} />
        <InfoRow icon={<IdcardOutlined />} label="用户 ID" value={user.id} />
        <InfoRow icon={<CalendarOutlined />} label="加入" value={user.joinedAt} />
      </div>

      <Divider style={{ margin: '10px 0' }} />

      <Button
        block danger icon={<LogoutOutlined />}
        onClick={() => {
          logout();
          message.success('已退出登录');
          onClose();
        }}
      >
        退出登录
      </Button>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#94a3b8' }}>{icon}</span>
      <span style={{ width: 52, color: '#94a3b8' }}>{label}</span>
      <span style={{ flex: 1, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

export default function TopBar() {
  const user = useChatStore((s) => s.currentUser);
  const [open, setOpen] = useState(false);

  return (
    <header className="qc-topbar">
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

      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottomRight"
        arrow={false}
        content={<ProfileContent onClose={() => setOpen(false)} />}
      >
        <span title={user.name}>
          <Avatar
            style={{
              background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
              cursor: 'pointer',
            }}
            icon={<UserOutlined />}
          />
        </span>
      </Popover>
    </header>
  );
}
