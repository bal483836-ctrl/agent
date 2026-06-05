import { Empty, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { SkillCandidate } from '@/types';

interface Props {
  skills: SkillCandidate[];
  onUse: (sk: SkillCandidate) => void;
  onDelete?: (sk: SkillCandidate) => void;
}

export default function SkillGrid({ skills, onUse, onDelete }: Props) {
  if (skills.length === 0) return <Empty description="没有匹配的技能" />;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14,
    }}>
      {skills.map((sk) => (
        <div
          key={sk.id}
          onClick={() => onUse(sk)}
          style={{
            border: '1px solid #dde6f2', borderRadius: 10, padding: 16, background: '#fff',
            cursor: 'pointer', transition: 'all 0.15s', position: 'relative',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#2563eb';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#dde6f2';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'none';
          }}
        >
          {sk.mine && onDelete && (
            <div
              style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip title="编辑">
                <a><EditOutlined /></a>
              </Tooltip>
              <Tooltip title="删除">
                <a style={{ color: '#ef4444' }} onClick={() => onDelete(sk)}>
                  <DeleteOutlined />
                </a>
              </Tooltip>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, background: '#eff6ff', color: '#2563eb',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>{sk.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>
              {sk.name}
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 12, minHeight: 38 }}>
            {sk.description}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag>{sk.category}</Tag>
            {sk.mine && <Tag color="gold">我上传</Tag>}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
              <ThunderboltOutlined /> {sk.uses}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
