import { useState } from 'react';
import { nanoid } from 'nanoid';
import { Button, Modal, Space, Statistic, Table, Tag, Tooltip, App as AntApp } from 'antd';
import {
  CheckCircleFilled, DownloadOutlined, FolderOpenOutlined,
  HighlightOutlined, UserOutlined, EyeOutlined,
} from '@ant-design/icons';
import type { ChatMessage, SkillResultMessage } from '@/types';
import useChatStore from '@/hooks/useChatStore';
import { api } from '@/api';

/**
 * 技能执行结果卡。
 * - 顶部：成功图标 + Skill 名 + 总耗时
 * - 摘要文本
 * - 关键指标矩阵（含 tone：primary/success/danger）
 * - 预览表格 + 「查看全部 X 行」浮层
 * - 输出文件归档 chip
 * - 操作：
 *   · 下载（生成 JSON 触发浏览器下载）
 *   · 保存到工作区（在右侧工作区追加 Outputs 节点）
 *   · 把异常值高亮（在表格中高亮 warn 行）
 *   · 请人工复核（在对话流插入复核请求消息）
 */
interface Props { msg: SkillResultMessage }

const toneColor = (t?: string) => {
  if (t === 'success') return '#10b981';
  if (t === 'danger') return '#ef4444';
  return '#2563eb';
};

export default function ResultCard({ msg }: Props) {
  const { message } = AntApp.useApp();
  const addWsNode = useChatStore((s) => s.addWsNode);
  const appendMessage = useChatStore((s) => s.appendMessage);

  const [highlightOn, setHighlightOn] = useState(true);
  const [fullOpen, setFullOpen] = useState(false);
  const seconds = (msg.runtimeMs / 1000).toFixed(1);

  const columns = msg.table?.columns.map((c) => ({
    title: c.title, dataIndex: c.key, key: c.key,
  })) ?? [];

  const dataSource = msg.table?.rows.map((r, i) => ({ key: i, ...r })) ?? [];

  /* —— 操作 —— */

  /** 下载：优先下载 skill 输出的第一个文件；没有就 fallback 到结果 JSON */
  const handleDownload = () => {
    const first = msg.outputs?.[0];
    if (first?.path) {
      const url = api.files.downloadOutput(first.path);
      window.open(url, '_blank');
      message.success(`正在下载：${first.name}`);
      return;
    }
    const payload = {
      skill: msg.skillName, summary: msg.summary, metrics: msg.metrics,
      table: msg.table, runtimeMs: msg.runtimeMs, generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${msg.skillName}_result.json`;
    a.click(); URL.revokeObjectURL(url);
    message.success('结果摘要已下载');
  };

  /** 保存到工作区：在 Outputs/ 下追加文件夹 + 文件 */
  const handleSave = () => {
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const folderKey = `d-${nanoid(6)}`;
    addWsNode(null, {
      key: folderKey,
      name: `Outputs/${msg.skillName}_${stamp}`,
      type: 'folder',
      hasDescription: false,
      children: msg.outputs.map((o) => ({
        key: `f-${nanoid(6)}`, name: o.name, type: 'file', size: '— KB',
      })),
    });
    message.success(`已保存到工作区：${msg.outputs.length} 个文件`);
  };

  const handleToggleHighlight = () => {
    setHighlightOn((v) => !v);
    message.success(highlightOn ? '已取消异常值高亮' : '已高亮 ' + (msg.table?.warnKeys?.length ?? 0) + ' 处异常');
  };

  /** 请人工复核：插入文本消息表示请求已发出 */
  const handleAskHuman = () => {
    const ask: ChatMessage = {
      id: nanoid(), role: 'assistant', type: 'text',
      content: `已为「${msg.skillName}」的本次结果创建人工复核请求，专家通常会在 1 小时内响应。`,
      createdAt: new Date().toTimeString().slice(0, 5),
    };
    appendMessage(ask);
    message.success('已请人工复核');
  };

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${msg.metrics.length}, 1fr)`,
          gap: 10, marginBottom: 14,
        }}
      >
        {msg.metrics.map((m) => (
          <div key={m.label} style={{
            background: '#fff', border: '1px solid #dde6f2', borderRadius: 8, padding: '10px 12px',
          }}>
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
            highlightOn && msg.table?.warnKeys?.includes((row as any).sid) ? 'qc-warn-row' : ''
          }
          style={{ background: '#fff', borderRadius: 8, marginBottom: 8 }}
        />
      )}
      {msg.totalRows != null && msg.previewRows != null && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
          仅显示前 {msg.previewRows} 行 ·{' '}
          <a onClick={() => setFullOpen(true)}>
            <EyeOutlined /> 查看全部 {msg.totalRows} 行 →
          </a>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#374151', marginBottom: 10 }}>
        <FolderOpenOutlined style={{ marginRight: 4 }} />
        输出已归档：
        <Space wrap size={[6, 6]} style={{ marginInlineStart: 6 }}>
          {msg.outputs.map((o) => (
            <Tooltip key={o.path} title={`点击下载 · ${o.path}`}>
              <Tag
                style={{ borderRadius: 4, cursor: 'pointer' }}
                onClick={() => {
                  window.open(api.files.downloadOutput(o.path), '_blank');
                }}
              >{o.name}</Tag>
            </Tooltip>
          ))}
        </Space>
      </div>

      <Space wrap>
        <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
          下载
        </Button>
        <Button icon={<FolderOpenOutlined />} onClick={handleSave}>保存到工作区</Button>
        <Button icon={<HighlightOutlined />} onClick={handleToggleHighlight}>
          {highlightOn ? '取消异常高亮' : '把异常值高亮'}
        </Button>
        {msg.needsHumanReview && (
          <Button danger icon={<UserOutlined />} onClick={handleAskHuman}>请人工复核</Button>
        )}
      </Space>

      {/* 查看全部行：弹层 */}
      <Modal
        title={`${msg.skillName} · 全部 ${msg.totalRows} 行`}
        open={fullOpen}
        onCancel={() => setFullOpen(false)}
        footer={null}
        width={780}
      >
        <Table
          size="small"
          pagination={{ pageSize: 10 }}
          columns={columns}
          dataSource={dataSource}
          scroll={{ x: 'max-content' }}
        />
      </Modal>
    </div>
  );
}
