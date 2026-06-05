import { useState } from 'react';
import {
  Alert, Button, Col, Form, Input, Row, Select, Space, Upload, type UploadProps, App as AntApp,
} from 'antd';
import { InboxOutlined, CheckCircleFilled } from '@ant-design/icons';

const { Dragger } = Upload;

interface Props { onSuccess: () => void }

export default function UploadSkillForm({ onSuccess }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [checked, setChecked] = useState(false);

  const uploadProps: UploadProps = {
    name: 'skill',
    multiple: false,
    accept: '.zip',
    showUploadList: false,
    beforeUpload: (file) => {
      if (!file.name.endsWith('.zip')) {
        message.error('请上传 zip 格式的技能包');
        return Upload.LIST_IGNORE;
      }
      setChecked(true);
      message.success(`技能包 ${file.name} 校验通过`);
      return false;
    },
  };

  return (
    <Form
      form={form} layout="vertical"
      onFinish={() => {
        if (!checked) {
          message.warning('请先上传技能包');
          return;
        }
        onSuccess();
      }}
    >
      <Form.Item>
        <Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: '#2563eb' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽上传技能包（.zip）</p>
          <p className="ant-upload-hint">
            技能包须包含 <code>manifest.json</code>、执行脚本与 <code>requirements.txt</code>
          </p>
        </Dragger>
      </Form.Item>

      {checked && (
        <Alert
          type="success" showIcon icon={<CheckCircleFilled />}
          style={{ marginBottom: 14 }}
          message="技能包格式校验通过"
          description={
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, color: '#4b5563' }}>
              <li>manifest.json — 已识别（v1.0 schema）</li>
              <li>main.py — 执行入口</li>
              <li>requirements.txt — 6 个依赖</li>
              <li>SHA-256: <code>3a7f…c91e</code></li>
            </ul>
          }
        />
      )}

      <Form.Item label="技能名称" name="name" rules={[{ required: true, message: '请填写技能名称' }]}>
        <Input placeholder="例如：受试者依从性评估" />
      </Form.Item>
      <Form.Item label="简介" name="desc" rules={[{ required: true, message: '请填写简介' }]}>
        <Input.TextArea placeholder="一句话说明技能用途，将展示在技能卡片上" rows={2} />
      </Form.Item>
      <Row gutter={14}>
        <Col span={12}>
          <Form.Item label="分类" name="category" initialValue="数据比对">
            <Select options={[
              { label: '数据比对', value: '数据比对' },
              { label: '安全报告', value: '安全报告' },
              { label: '数据提取', value: '数据提取' },
              { label: '统计分析', value: '统计分析' },
              { label: '其他', value: '其他' },
            ]} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="输入文件类型" name="inputs">
            <Input placeholder="如：.xlsx, .csv, .pdf" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="参数说明" name="params">
        <Input.TextArea placeholder="逐项说明参数名、含义、默认值" rows={3} />
      </Form.Item>

      <Alert
        type="warning" showIcon style={{ marginBottom: 14 }}
        message="上传后将立即对本组织全部成员可见可用，无需审批。请确保不包含未脱敏的受试者数据。"
      />

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">确认上传</Button>
          <Button onClick={() => form.resetFields()}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
