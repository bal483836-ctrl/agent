import { useMemo } from 'react';
import { Button, Select, Space, Tree, type TreeDataNode, App as AntApp, Upload, type UploadProps, Tooltip } from 'antd';
import {
  UploadOutlined, FolderAddOutlined, ReloadOutlined,
  FileTextOutlined, FolderOutlined, FolderOpenOutlined,
  InfoCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';
import { mockWorkspaces } from '@/mock/data';
import type { WsNode } from '@/types';

function toTreeData(nodes: WsNode[]): TreeDataNode[] {
  return nodes.map((n) => {
    const isFolder = n.type === 'folder';
    return {
      key: n.key,
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{n.name}</span>
          {n.hasDescription && (
            <Tooltip title="该文件夹包含描述（description.md）">
              <InfoCircleOutlined style={{ color: '#f59e0b', fontSize: 11 }} />
            </Tooltip>
          )}
          {n.size && <span style={{ fontSize: 10, color: '#9ca3af' }}>{n.size}</span>}
        </span>
      ),
      icon: isFolder ? <FolderOutlined style={{ color: '#2563eb' }} /> : <FileTextOutlined style={{ color: '#6b7280' }} />,
      isLeaf: !isFolder,
      children: n.children ? toTreeData(n.children) : undefined,
    };
  });
}

function flatten(nodes: WsNode[]): WsNode[] {
  const r: WsNode[] = [];
  for (const n of nodes) {
    r.push(n);
    if (n.children) r.push(...flatten(n.children));
  }
  return r;
}

export default function WorkspacePanel() {
  const { workspaceId, setWorkspace, selectedContext, setSelectedContext } = useChatStore();
  const { message } = AntApp.useApp();
  const ws = mockWorkspaces.find((w) => w.id === workspaceId);

  const treeData = useMemo(() => toTreeData(ws?.tree ?? []), [ws]);
  const flat = useMemo(() => flatten(ws?.tree ?? []), [ws]);
  const checkedKeys = selectedContext.map((c) => c.key);

  const uploadProps: UploadProps = {
    multiple: true, showUploadList: false,
    beforeUpload: (file) => {
      message.success(`已上传到「${ws?.name}」：${file.name}`);
      return false;
    },
  };

  return (
    <>
      <div style={{ padding: 14, borderBottom: '1px solid #dde6f2', background: '#fff',
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <FolderOpenOutlined style={{ color: '#2563eb' }} />
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>工作区</span>
        <Select
          size="small"
          value={workspaceId}
          onChange={setWorkspace}
          style={{ width: 160 }}
          options={mockWorkspaces.map((w) => ({ label: w.name, value: w.id }))}
        />
      </div>

      <div style={{
        padding: '10px 14px', background: '#eff6ff', borderBottom: '1px solid #dbeafe',
        fontSize: 12, color: '#1d4ed8', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>
          已选 <b style={{ color: '#2563eb' }}>{selectedContext.length}</b> 项作为对话上下文
        </span>
        <a onClick={() => setSelectedContext([])} style={{ fontSize: 11 }}>
          <CloseCircleOutlined /> 清空
        </a>
      </div>

      <div className="qc-file-tree">
        {(ws?.tree ?? []).length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
            该工作区暂无文件，点击下方按钮上传
          </div>
        ) : (
          <Tree
            checkable
            showIcon
            blockNode
            defaultExpandAll
            treeData={treeData}
            checkedKeys={checkedKeys}
            onCheck={(checked) => {
              const keys = Array.isArray(checked) ? checked : checked.checked;
              const set = new Set(keys as string[]);
              setSelectedContext(
                flat
                  .filter((n) => set.has(n.key))
                  .map((n) => ({ key: n.key, name: n.name, type: n.type })),
              );
            }}
          />
        )}
      </div>

      <div style={{ borderTop: '1px solid #dde6f2', padding: 10, background: '#fff' }}>
        <Space style={{ width: '100%' }}>
          <Upload {...uploadProps}>
            <Button size="small" icon={<UploadOutlined />}>上传</Button>
          </Upload>
          <Button size="small" icon={<FolderAddOutlined />}>新建文件夹</Button>
          <Button size="small" icon={<ReloadOutlined />}>刷新</Button>
        </Space>
      </div>
    </>
  );
}
