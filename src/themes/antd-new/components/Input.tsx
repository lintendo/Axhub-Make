import React from 'react';
import { Input as AntInput, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined, SearchOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';

const { TextArea } = AntInput;

interface InputSectionProps {
  tokens: Record<string, any>;
}

export const InputSection: React.FC<InputSectionProps> = ({ tokens }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">输入框 Input</h1>
        <p className="text-neutral-600">通过鼠标或键盘输入内容，是最基础的表单域的包装。</p>
      </div>

      <div className="border border-neutral-200 rounded-lg bg-white shadow-sm">
        <div className="p-8 space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-4">基础输入框</h3>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <AntInput placeholder="请输入内容" />
              <AntInput prefix={<UserOutlined />} placeholder="带前缀图标" />
              <AntInput suffix={<SearchOutlined />} placeholder="带后缀图标" />
            </Space>
          </div>

          <Divider />

          <div>
            <h3 className="text-base font-semibold mb-4">密码输入框</h3>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <AntInput.Password
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              />
            </Space>
          </div>

          <Divider />

          <div>
            <h3 className="text-base font-semibold mb-4">搜索框</h3>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <AntInput.Search placeholder="搜索内容" onSearch={(value) => console.log(value)} />
              <AntInput.Search placeholder="带加载状态" loading />
              <AntInput.Search placeholder="带按钮" enterButton />
            </Space>
          </div>

          <Divider />

          <div>
            <h3 className="text-base font-semibold mb-4">文本域</h3>
            <TextArea rows={4} placeholder="请输入多行文本" />
          </div>

          <Divider />

          <div>
            <h3 className="text-base font-semibold mb-4">不同尺寸</h3>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <AntInput size="large" placeholder="大尺寸输入框" />
              <AntInput placeholder="默认尺寸输入框" />
              <AntInput size="small" placeholder="小尺寸输入框" />
            </Space>
          </div>

          <Divider />

          <div>
            <h3 className="text-base font-semibold mb-4">输入框状态</h3>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <AntInput placeholder="默认状态" />
              <AntInput placeholder="禁用状态" disabled />
              <AntInput placeholder="只读状态" readOnly />
              <AntInput status="error" placeholder="错误状态" />
              <AntInput status="warning" placeholder="警告状态" />
            </Space>
          </div>
        </div>
      </div>
    </div>
  );
};
