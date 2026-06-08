import { useEffect, useState } from 'react';
import { Drawer, Spin, Empty, Button, Tag, Space, Alert } from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { api } from '@/api';
import type { PreviewResult } from '@/api/workspaces';

/**
 * 文件预览抽屉。
 * - 图片：直接 <img> 渲染（从 /download 端点拉，带 token）
 * - PDF/Word/Excel/CSV/Markdown/JSON：抽出来的纯文本以 <pre> 显示
 * - 二进制：只显示元信息 + 下载按钮
 */
interface Props {
  workspaceId: string;
  fileKey: string | null;
  fileName?: string;
  onClose: () => void;
}

export default function FilePreviewDrawer({ workspaceId, fileKey, fileName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreviewResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!fileKey) { setData(null); setErr(null); return; }
    setLoading(true); setErr(null);
    api.workspaces.previewFile(workspaceId, fileKey)
      .then((r) => setData(r))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [fileKey, workspaceId]);

  const open = !!fileKey;
  const downloadUrl = fileKey
    ? `${(import.meta as any).env.VITE_API_BASE_URL ?? '/api'}/workspaces/${workspaceId}/files/${fileKey}/download?token=${encodeURIComponent(localStorage.getItem('qc_jwt') ?? '')}`
    : '';

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined />
          <span>{fileName ?? data?.name ?? '文件预览'}</span>
          {data && <Tag>{data.kind}</Tag>}
          {data && 'totalBytes' in data && (
            <Tag color="default" style={{ fontFamily: 'ui-monospace, monospace' }}>
              {fmtSize(data.totalBytes)}
            </Tag>
          )}
        </Space>
      }
      open={open}
      onClose={onClose}
      width={720}
      extra={
        <Button icon={<DownloadOutlined />} onClick={() => downloadUrl && window.open(downloadUrl, '_blank')}>
          下载原文件
        </Button>
      }
    >
      {loading && <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>}

      {err && !loading && <Alert type="error" message={err} showIcon />}

      {!loading && !err && data && renderContent(data, downloadUrl)}

      {!loading && !err && !data && <Empty description="无内容" />}
    </Drawer>
  );
}

function renderContent(data: PreviewResult, downloadUrl: string) {
  if (data.kind === 'image') {
    return (
      <div style={{ textAlign: 'center' }}>
        <img
          src={downloadUrl}
          alt={data.name}
          style={{ maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        />
      </div>
    );
  }
  if (data.kind === 'binary') {
    return (
      <Alert
        type="info" showIcon
        message="二进制文件不可预览"
        description={
          <div>
            类型：<code>{(data as any).mime}</code><br />
            大小：{fmtSize(data.totalBytes)}<br />
            请下载到本地查看。
          </div>
        }
      />
    );
  }
  // 文本类（可能附带 html）
  const text = (data as any).text as string;
  const html = (data as any).html as string | undefined;
  const truncated = (data as any).truncated;

  return (
    <>
      {truncated && (
        <Alert
          type="warning" style={{ marginBottom: 12 }} showIcon
          message="内容过大，仅展示部分"
        />
      )}

      {html ? (
        <div
          className="qc-doc-preview"
          style={{
            padding: 16, background: '#fff',
            border: '1px solid #e2e8f0', borderRadius: 8,
            fontSize: 14, lineHeight: 1.7, color: '#1f2937',
            maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
          }}
          // 内容来自 backend 解析的用户自有文件
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre
          style={{
            margin: 0, padding: 14, background: '#f8fafc',
            border: '1px solid #e2e8f0', borderRadius: 8,
            fontSize: 12, lineHeight: 1.6,
            fontFamily: 'ui-monospace, "JetBrains Mono", "Cascadia Code", monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
          }}
        >
          {text}
        </pre>
      )}
    </>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
