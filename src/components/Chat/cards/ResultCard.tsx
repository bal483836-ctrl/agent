import { Button, Space, Statistic, Table, Tag, Tooltip } from 'antd';
import {
  CheckCircleFilled, DownloadOutlined, FolderOpenOutlined,
  HighlightOutlined, UserOutlined,
} from '@ant-design/icons';
import type { SkillResultMessage } from '@/types';

interface Props { msg: SkillResultMessage }

const toneColor = (t?: string) => {
  if (t === 'success') return '#10b981';
  if (t === 'danger') return '#ef4444';
  return '#2563eb';
};

export default function ResultCard({ msg }: Props) {
  const seconds = (msg.runtimeMs / 1000).toFixed(1);

  const columns = msg.table?.columns.map((c) => ({
    title: c.title,
    dataIndex: c.key,
    key: c.key,
  })) ?? [];

  const dataSource = msg.table?.rows.map((r, i) => ({ key: i, ...r })) ?? [];

  return (
    <div className="qc-result-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <CheckCircleFilled style={{ color: '#10b981', fontSize: 20 }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{msg.skillName} · 执行完成</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>耗时 {seconds}s</span>
      </div>

      <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.7 }}>
        {msg.summary}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${msg.metrics.length}, 1fr)`, gap: 10, marginBottom: 14 }}>
        {msg.metrics.map((m) => (
          <div key={m.label} style={{ background: '#fff', border: '1px solid #dde6f2', borderRadius: 8, padding: '10px 12px' }}>
            <Statistic
              value={m.value}
              valueStyle={{ color: toneColor(m.tone), fontSize: 22, fontWeight: 700 }}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {msg.table && (
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={dataSource}
          rowClassName={(row) =>
            msg.table?.warnKeys?.includes((row as any).sid) ? 'qc-warn-row' : ''
          }
          style={{ background: '#fff', borderRadius: 8, marginBottom: 8 }}
        />
      )}
      {msg.totalRows != null && msg.previewRows != null && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
          仅显示前 {msg.previewRows} 行 · <a>查看全部 {msg.totalRows} 行 →</a>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#374151', marginBottom: 10 }}>
        <FolderOpenOutlined style={{ marginRight: 4 }} />
        输出已归档：
        <Space wrap size={[6, 6]} style={{ marginInlineStart: 6 }}>
          {msg.outputs.map((o) => (
            <Tooltip key={o.path} title={o.path}>
              <Tag style={{ borderRadius: 4 }}>{o.name}</Tag>
            </Tooltip>
          ))}
        </Space>
      </div>

      <Space wrap>
        <Button type="primary" icon={<DownloadOutlined />}>下载 Excel</Button>
        <Button icon={<FolderOpenOutlined />}>保存到工作区</Button>
        <Button icon={<HighlightOutlined />}>把异常值高亮</Button>
        {msg.needsHumanReview && (
          <Button danger icon={<UserOutlined />}>请人工复核</Button>
        )}
      </Space>
    </div>
  );
}
