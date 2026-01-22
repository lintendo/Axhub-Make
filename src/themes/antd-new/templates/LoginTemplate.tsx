import React from 'react';
import { Form, Input, Button, Checkbox, Card } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

export const LoginTemplate: React.FC = () => {
  const onFinish = (values: any) => {
    console.log('Received values:', values);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">登录页 Login</h1>
        <p className="text-neutral-600">标准的登录页面模板。</p>
      </div>

      <div className="flex items-center justify-center min-h-[520px] bg-[radial-gradient(circle_at_top,_#fff7ed,_#f8fafc_55%)] rounded-lg p-8 border border-neutral-200">
        <Card className="w-full max-w-[420px]" bordered={false}>
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-neutral-900 text-white flex items-center justify-center text-lg font-semibold">
              AX
            </div>
            <h2 className="text-2xl font-semibold text-neutral-900 mb-1">欢迎登录</h2>
            <p className="text-sm text-neutral-500">请输入您的账号和密码</p>
          </div>
          
          <Form
            name="login"
            initialValues={{ remember: true }}
            onFinish={onFinish}
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名!' }]}
            >
              <Input 
                prefix={<UserOutlined />} 
                placeholder="用户名" 
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码!' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>记住我</Checkbox>
              </Form.Item>
              <a className="float-right text-sm text-neutral-500 hover:text-neutral-800">忘记密码</a>
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large">
                登录
              </Button>
            </Form.Item>

            <div className="text-center text-sm text-neutral-500">
              还没有账号？ <a className="text-neutral-800 hover:text-neutral-900">立即注册</a>
            </div>
          </Form>
        </Card>
      </div>
    </div>
  );
};
