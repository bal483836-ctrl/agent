import { Button, Card, Result } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';

/**
 * 退出登录后的占位页面。
 * MVP 阶段后端账号体系未开放注册，因此提供一个"重新登录"按钮回到 mock 用户身份。
 */
export default function LoginGate() {
  const loginAgain = useChatStore((s) => s.loginAgain);
  const user = useChatStore((s) => s.currentUser);

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,0.4)', zIndex: 2000,
    }}>
      <Card style={{ width: 420 }}>
        <Result
          status="info"
          title="已退出登录"
          subTitle={`当前账号：${user.name} · ${user.organization}`}
          extra={
            <Button type="primary" icon={<LoginOutlined />} onClick={loginAgain}>
              重新登录
            </Button>
          }
        />
      </Card>
    </div>
  );
}
