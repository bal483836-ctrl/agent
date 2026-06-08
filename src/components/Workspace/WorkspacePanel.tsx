import { useMemo, useState } from 'react';
import {
  Button, Dropdown, Input, Select, Tooltip, Tree,
  type TreeDataNode, type TreeProps, type MenuProps,
  App as AntApp, Modal, Upload, type UploadProps,
} from 'antd';
import { nanoid } from 'nanoid';
import {
  UploadOutlined, FolderAddOutlined, ReloadOutlined, SearchOutlined,
  FileTextOutlined, FolderOutlined, FolderOpenOutlined,
  InfoCircleOutlined, CloseCircleOutlined,
  EditOutlined, DeleteOutlined, FileMarkdownOutlined,
} from '@ant-design/icons';
import useChatStore from '@/hooks/useChatStore';
import { api } from '@/api';
import type { WsNode } from '@/types';
import FilePreviewDrawer from './FilePreviewDrawer';

/** 把字节数格式化为可读字符串 */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 工作区面板（右侧）。
 *
 * 顶部：工作区选择 + 已选上下文条
 * 工具栏（位于文件树正上方）：上传 / 新建文件夹 / 刷新 / 搜索
 *    - 图标按钮 + Tooltip 显示中文名
 * 文件树：
 *    - 复选框多选 → 同步 store.selectedContext
 *    - 右键节点：重命名 / 删除
 *    - 节点支持拖拽排序与跨文件夹移动
 *    - 搜索：高亮匹配文本
 */

/** WsNode → AntD TreeDataNode；预留 title 的高亮渲染回调 */
function toTreeData(
  nodes: WsNode[],
  highlight: (s: string) => React.ReactNode,
  onContextMenu: (key: string) => void,
): TreeDataNode[] {
  return nodes.map((n) => {
    const isFolder = n.type === 'folder';
    return {
      key: n.key,
      title: (
        <span
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(n.key); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>{highlight(n.name)}</span>
          {n.hasDescription && (
            <Tooltip title="该文件夹包含描述（description.md）">
              <InfoCircleOutlined style={{ color: '#f59e0b', fontSize: 11 }} />
            </Tooltip>
          )}
          {n.size && <span style={{ fontSize: 10, color: '#9ca3af' }}>{n.size}</span>}
        </span>
      ),
      icon: isFolder
        ? <FolderOutlined style={{ color: '#2563eb' }} />
        : <FileTextOutlined style={{ color: '#6b7280' }} />,
      isLeaf: !isFolder,
      children: n.children ? toTreeData(n.children, highlight, onContextMenu) : undefined,
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

function findNode(nodes: WsNode[], key: string): WsNode | undefined {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (n.children) {
      const r = findNode(n.children, key);
      if (r) return r;
    }
  }
  return undefined;
}

export default function WorkspacePanel() {
  const {
    workspaceId, setWorkspace, workspaces,
    workspaceTrees, selectedContext, setSelectedContext,
    renameWsNode, deleteWsNode, moveWsNode, addWsNode,
  } = useChatStore();
  const { message } = AntApp.useApp();

  const tree = workspaceTrees[workspaceId] ?? [];

  /* —— 搜索 —— */
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState('');

  /* —— 预览 —— */
  const [preview, setPreview] = useState<{ key: string; name: string } | null>(null);

  const matchedKeys = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const s = search.trim().toLowerCase();
    return new Set(
      flatten(tree).filter((n) => n.name.toLowerCase().includes(s)).map((n) => n.key),
    );
  }, [tree, search]);

  /** 在节点名内高亮 search */
  const highlight = (name: string): React.ReactNode => {
    if (!search.trim()) return name;
    const idx = name.toLowerCase().indexOf(search.toLowerCase());
    if (idx < 0) return name;
    return (
      <>
        {name.slice(0, idx)}
        <mark style={{ background: '#fef3c7', padding: 0 }}>
          {name.slice(idx, idx + search.length)}
        </mark>
        {name.slice(idx + search.length)}
      </>
    );
  };

  /* —— 右键菜单 —— */
  const [ctxKey, setCtxKey] = useState<string | null>(null);

  const onRename = (key: string) => {
    const node = findNode(tree, key);
    if (!node) return;
    let next = node.name;
    Modal.confirm({
      title: '重命名',
      content: (
        <Input
          defaultValue={node.name}
          onChange={(e) => { next = e.target.value; }}
          maxLength={120}
        />
      ),
      onOk: () => renameWsNode(key, (next || node.name).trim()),
    });
  };

  const onDelete = (key: string) => {
    const node = findNode(tree, key);
    if (!node) return;
    Modal.confirm({
      title: `删除「${node.name}」？`,
      content: node.type === 'folder' ? '该文件夹及其所有子项都将删除。' : '删除后无法恢复。',
      okButtonProps: { danger: true }, okText: '删除', cancelText: '取消',
      onOk: () => {
        deleteWsNode(key);
        message.success(`已删除：${node.name}`);
      },
    });
  };

  /** 编辑文件夹描述（description.md）—— 仅对 folder 类型节点有意义 */
  const onEditDescription = async (key: string) => {
    const node = findNode(tree, key);
    if (!node || node.type !== 'folder') return;
    let content = '';
    try { content = await api.workspaces.getFolderDescription(workspaceId, key); }
    catch { /* 新建即空 */ }
    let next = content;
    Modal.confirm({
      title: `编辑「${node.name}」描述`,
      width: 520,
      content: (
        <Input.TextArea
          defaultValue={content}
          rows={8}
          placeholder="支持 Markdown，会保存到 description.md，并在文件树显示标记"
          onChange={(e) => { next = e.target.value; }}
        />
      ),
      okText: '保存', cancelText: '取消',
      onOk: async () => {
        await api.workspaces.setFolderDescription(workspaceId, key, next);
        message.success('描述已更新');
        await useChatStore.getState().refreshWorkspaceTree();
      },
    });
  };

  const ctxMenu: MenuProps = {
    items: [
      { key: 'rename', icon: <EditOutlined />, label: '重命名',
        onClick: () => ctxKey && onRename(ctxKey) },
      { key: 'desc', icon: <FileMarkdownOutlined />, label: '编辑描述（仅文件夹）',
        onClick: () => ctxKey && onEditDescription(ctxKey),
        disabled: !ctxKey || findNode(tree, ctxKey)?.type !== 'folder' },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, danger: true, label: '删除',
        onClick: () => ctxKey && onDelete(ctxKey) },
    ],
  };

  /* —— 多选 —— */
  const treeData = useMemo(
    () => toTreeData(tree, highlight, (k) => setCtxKey(k)),
    [tree, search],
  );
  const flat = useMemo(() => flatten(tree), [tree]);
  const checkedKeys = selectedContext.map((c) => c.key);

  /* —— 拖拽 —— */
  const onDrop: TreeProps['onDrop'] = (info) => {
    const dragKey = info.dragNode.key as string;
    const dropKey = info.node.key as string;
    moveWsNode(dragKey, dropKey, info.dropToGap);
  };

  /* —— 上传：multipart 到后端，后端写树后再 refresh —— */
  const uploadProps: UploadProps = {
    multiple: true, showUploadList: false,
    beforeUpload: async (file) => {
      try {
        const { filesApi } = await import('@/api/files');
        await filesApi.uploadToWorkspace(workspaceId, null, file);
        message.success(`已上传：${file.name}`);
        await useChatStore.getState().refreshWorkspaceTree();
      } catch (e) {
        message.error(`上传失败：${(e as Error).message}`);
      }
      return false;
    },
  };
  void fmtSize;
  void addWsNode;

  /* —— 新建文件夹：先调后端，再刷新本地树 —— */
  const handleNewFolder = () => {
    let name = '新建文件夹';
    Modal.confirm({
      title: '新建文件夹',
      content: (
        <Input
          defaultValue={name}
          onChange={(e) => { name = e.target.value; }}
          maxLength={64}
        />
      ),
      onOk: async () => {
        const finalName = (name || '新建文件夹').trim();
        await api.workspaces.createFolder(workspaceId, null, finalName);
        await useChatStore.getState().refreshWorkspaceTree();
        message.success(`已创建文件夹：${finalName}`);
      },
    });
  };
  void nanoid;

  /* —— 刷新：真从后端重新拉树 —— */
  const handleRefresh = async () => {
    await useChatStore.getState().refreshWorkspaceTree();
    message.success('已刷新');
  };

  return (
    <>
      {/* 工作区选择 */}
      <div
        style={{
          padding: 14, borderBottom: '1px solid #dde6f2', background: '#fff',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <FolderOpenOutlined style={{ color: '#2563eb' }} />
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>工作区</span>
        <Select
          size="small"
          value={workspaceId}
          onChange={setWorkspace}
          style={{ width: 160 }}
          options={workspaces.map((w) => ({ label: w.name, value: w.id }))}
        />
      </div>

      {/* 已选条 */}
      <div
        style={{
          padding: '10px 14px', background: '#eff6ff', borderBottom: '1px solid #dbeafe',
          fontSize: 12, color: '#1d4ed8',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, minWidth: 0,
        }}
      >
        <span style={{
          minWidth: 0, flex: '1 1 auto', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          已选 <b style={{ color: '#2563eb' }}>{selectedContext.length}</b> 项
        </span>
        <a onClick={() => setSelectedContext([])} style={{ fontSize: 11, flexShrink: 0 }}>
          <CloseCircleOutlined /> 清空
        </a>
      </div>

      {/* 文件树工具栏 —— 顺序：上传 / 新建文件夹 / 刷新 / 搜索 */}
      <div
        style={{
          padding: '8px 14px', borderBottom: '1px solid #eef2f7', background: '#fff',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <Upload {...uploadProps}>
          <Tooltip title="上传">
            <Button type="text" size="small" icon={<UploadOutlined />} />
          </Tooltip>
        </Upload>
        <Tooltip title="新建文件夹">
          <Button
            type="text" size="small" icon={<FolderAddOutlined />}
            onClick={handleNewFolder}
          />
        </Tooltip>
        <Tooltip title="刷新">
          <Button
            type="text" size="small" icon={<ReloadOutlined />}
            onClick={handleRefresh}
          />
        </Tooltip>
        <Tooltip title="搜索">
          <Button
            type="text" size="small" icon={<SearchOutlined />}
            onClick={() => setShowSearch((v) => !v)}
          />
        </Tooltip>
        {showSearch && (
          <Input
            size="small" autoFocus allowClear
            placeholder="搜索文件 / 文件夹"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, marginInlineStart: 6 }}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          />
        )}
      </div>

      {/* 文件树 */}
      <div className="qc-file-tree">
        {tree.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
            该工作区暂无文件，点击上方按钮上传
          </div>
        ) : (
          <Dropdown menu={ctxMenu} trigger={['contextMenu']}>
            <div>
              <Tree
                checkable showIcon blockNode draggable
                defaultExpandAll
                treeData={treeData}
                checkedKeys={checkedKeys}
                selectedKeys={[]}
                onCheck={(checked) => {
                  const keys = Array.isArray(checked) ? checked : checked.checked;
                  const set = new Set(keys as string[]);
                  setSelectedContext(
                    flat
                      .filter((n) => set.has(n.key))
                      .map((n) => ({ key: n.key, name: n.name, type: n.type })),
                  );
                }}
                onSelect={(_keys, info) => {
                  // 点文件名 → 打开预览（点文件夹无操作，文件夹有 onExpand 切换）
                  const node = findNode(tree, String(info.node.key));
                  if (node?.type === 'file') {
                    setPreview({ key: node.key, name: node.name });
                  }
                }}
                onDrop={onDrop}
                /* 搜索时把命中节点路径展开 */
                expandedKeys={search.trim() ? Array.from(matchedKeys) : undefined}
              />
            </div>
          </Dropdown>
        )}
      </div>

      <FilePreviewDrawer
        workspaceId={workspaceId}
        fileKey={preview?.key ?? null}
        fileName={preview?.name}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
