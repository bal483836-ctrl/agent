import { useState } from 'react';
import {
  Modal, Tabs, Input, Select, Button, Space, App as AntApp,
} from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import useChatStore, { mockSkills } from '@/hooks/useChatStore';
import SkillGrid from './SkillGrid';
import UploadSkillForm from './UploadSkillForm';

export default function SkillCenterModal() {
  const open = useChatStore((s) => s.skillCenterOpen);
  const close = useChatStore((s) => s.closeSkillCenter);
  const insert = useChatStore((s) => s.insertSkillTrigger);
  const { message } = AntApp.useApp();

  const [tab, setTab] = useState('browse');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const filtered = mockSkills.filter((s) => {
    if (search && !s.name.includes(search) && !s.description.includes(search)) return false;
    if (category !== 'all' && s.category !== category) return false;
    return true;
  });
  const mine = mockSkills.filter((s) => s.mine);

  return (
    <Modal
      title={
        <Space size={10}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: '#2563eb', color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>
            <ThunderboltOutlined />
          </div>
          <span>技能中心</span>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>
            · 本组织共 <b style={{ color: '#2563eb' }}>{mockSkills.length}</b> 个技能，全员可用
          </span>
        </Space>
      }
      open={open}
      onCancel={close}
      width={960}
      footer={null}
      destroyOnClose
    >
      <Tabs
        activeKey={tab} onChange={setTab}
        items={[
          {
            key: 'browse', label: '浏览技能',
            children: (
              <>
                <Space style={{ marginBottom: 16, width: '100%' }} size={10}>
                  <Input.Search
                    placeholder="搜索技能名称、描述、标签…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: 320 }}
                  />
                  <Select
                    value={category}
                    onChange={setCategory}
                    style={{ width: 140 }}
                    options={[
                      { label: '全部分类', value: 'all' },
                      { label: '数据比对', value: '数据比对' },
                      { label: '安全报告', value: '安全报告' },
                      { label: '数据提取', value: '数据提取' },
                      { label: '统计分析', value: '统计分析' },
                    ]}
                  />
                  <div style={{ flex: 1 }} />
                  <Button
                    type="primary" icon={<PlusOutlined />}
                    onClick={() => setTab('upload')}
                  >
                    上传技能
                  </Button>
                </Space>
                <SkillGrid
                  skills={filtered}
                  onUse={(sk) => { close(); insert(sk); }}
                />
              </>
            ),
          },
          {
            key: 'mine', label: '我上传的',
            children: (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
                  您可以删除自己上传的技能。删除后本组织其他成员将不可见。
                </div>
                <SkillGrid
                  skills={mine}
                  onUse={(sk) => { close(); insert(sk); }}
                  onDelete={(sk) => message.success(`已删除技能：${sk.name}`)}
                />
              </>
            ),
          },
          {
            key: 'upload', label: '上传技能',
            children: <UploadSkillForm onSuccess={() => { setTab('browse'); message.success('技能上传成功，已对全组织可见'); }} />,
          },
        ]}
      />
    </Modal>
  );
}
