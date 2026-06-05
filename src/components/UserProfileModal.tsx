import { Avatar, Button, Descriptions, Modal, Tag } from 'antd';
import { LogoutOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';

/**
 * 用户信息弹层。
 * - 顶部展示头像、姓名、角色 Tag
 * - Descriptions 展示组织 / 邮箱 / 加入时间
 * - 底部退出登录入口（mock）
 */
export default function UserProfileModal() {
  const open = useChatStore((s) => s.profileOpen);
  const close = useChatStore((s) => s.closeProfile);
  const user = useChatStore((s) => s.currentUser);

  return (
    <Modal
      title="个人信息"
      open={open}
      onCancel={close}
      footer={null}
      width={440}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '8px 0 16px', borderBottom: '1px solid #f1f5f9', marginBottom: 16,
        }}
      >
        <Avatar
          size={56} icon={<UserOutlined />}
          style={{ background: 'linear-gradient(135deg,#3b82f6,#2563eb)' }}
        />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{user.name}</div>
          <div style={{ marginTop: 6 }}>
            <Tag color="blue">{user.role}</Tag>
          </div>
        </div>
      </div>

      <Descriptions column={1} size="small" labelStyle={{ width: 88 }}>
        <Descriptions.Item label="组织">{user.organization}</Descriptions.Item>
        <Descriptions.Item label="邮箱">
          <MailOutlined style={{ marginInlineEnd: 6, color: '#94a3b8' }} />
          {user.email}
        </Descriptions.Item>
        <Descriptions.Item label="用户 ID">{user.id}</Descriptions.Item>
        <Descriptions.Item label="加入时间">{user.joinedAt}</Descriptions.Item>
      </Descriptions>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <Button icon={<LogoutOutlined />} danger>退出登录</Button>
      </div>
    </Modal>
  );
}
