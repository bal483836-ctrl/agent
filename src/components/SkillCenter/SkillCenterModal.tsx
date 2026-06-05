import { useState } from 'react';
import { Modal, Tabs, Input, Select, Button, Space, App as AntApp } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import useChatStore, { mockSkills } from '@/hooks/useChatStore';
import SkillGrid from './SkillGrid';
import UploadSkillForm from './UploadSkillForm';
import SkillDetailModal from './SkillDetailModal';
import type { SkillCandidate } from '@/types';

/**
 * 技能中心入口弹层。
 *
 * 三个 Tab：
 *  - 浏览技能：搜索 / 分类筛选 / 卡片网格；点卡片 → 弹「技能详情」
 *  - 我上传的：仅展示当前用户上传的技能，可删除
 *  - 上传技能：拖拽 zip + manifest 校验 + 表单
 *
 * 用户在详情中点「直接使用」或「申请使用」均会插入待执行 Skill 卡到对话。
 */
export default function SkillCenterModal() {
  const open = useChatStore((s) => s.skillCenterOpen);
  const close = useChatStore((s) => s.closeSkillCenter);
  const insert = useChatStore((s) => s.insertSkillTrigger);
  const { message } = AntApp.useApp();

  const [tab, setTab] = useState('browse');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [detail, setDetail] = useState<SkillCandidate | null>(null);

  const filtered = mockSkills.filter((s) => {
    if (search && !s.name.includes(search) && !s.description.includes(search)) return false;
    if (category !== 'all' && s.category !== category) return false;
    return true;
  });
  const mine = mockSkills.filter((s) => s.mine);

  /** 详情中确认使用后，关闭技能中心 + 插入待执行卡 */
  const handleApproved = (sk: SkillCandidate) => {
    close();
    insert(sk);
  };

  return (
    <>
      <Modal
        title={
          <Space size={10}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 8, background: '#2563eb', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}
            >
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
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'browse',
              label: '浏览技能',
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
                  <SkillGrid skills={filtered} onOpenDetail={setDetail} />
                </>
              ),
            },
            {
              key: 'mine',
              label: '我上传的',
              children: (
                <>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
                    您可以删除自己上传的技能。删除后本组织其他成员将不可见。
                  </div>
                  <SkillGrid
                    skills={mine}
                    onOpenDetail={setDetail}
                    onDelete={(sk) => message.success(`已删除技能：${sk.name}`)}
                  />
                </>
              ),
            },
            {
              key: 'upload',
              label: '上传技能',
              children: (
                <UploadSkillForm
                  onSuccess={() => {
                    setTab('browse');
                    message.success('技能上传成功，已对全组织可见');
                  }}
                />
              ),
            },
          ]}
        />
      </Modal>

      <SkillDetailModal
        skill={detail}
        onClose={() => setDetail(null)}
        onApprovedUse={handleApproved}
      />
    </>
  );
}
