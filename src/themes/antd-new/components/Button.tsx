import React, { useState } from 'react';
import { Button as AntButton, Space, Divider } from 'antd';
import { MobileOutlined, DesktopOutlined, TabletOutlined } from '@ant-design/icons';

interface ButtonSectionProps {
  tokens: Record<string, any>;
}

export const ButtonSection: React.FC<ButtonSectionProps> = () => {
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  const ViewportFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    let widthClass = 'w-full';
    if (viewport === 'mobile') widthClass = 'w-[375px]';
    if (viewport === 'tablet') widthClass = 'w-[768px]';

    return (
      <div className={`transition-all duration-300 mx-auto border-x border-b border-neutral-200 bg-white shadow-sm ${widthClass} min-h-[400px]`}>
        {children}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">按钮 Button</h1>
        <p className="text-neutral-600">按钮用于开始一个即时操作。</p>
      </div>

      {/* 预览区域 */}
      <div className="border border-neutral-200 rounded-lg bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-gray-50/50 px-4 py-2">
          <div className="flex space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-200"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-200"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-neutral-200"></span>
          </div>
          <div className="flex space-x-4 text-neutral-400">
            <button onClick={() => setViewport('mobile')} className={`p-1 hover:text-black ${viewport === 'mobile' ? 'text-black' : 'text-neutral-400'}`}>
              <MobileOutlined style={{ fontSize: 16 }} />
            </button>
            <button onClick={() => setViewport('tablet')} className={`p-1 hover:text-black ${viewport === 'tablet' ? 'text-black' : 'text-neutral-400'}`}>
              <TabletOutlined style={{ fontSize: 16 }} />
            </button>
            <button onClick={() => setViewport('desktop')} className={`p-1 hover:text-black ${viewport === 'desktop' ? 'text-black' : 'text-neutral-400'}`}>
              <DesktopOutlined style={{ fontSize: 16 }} />
            </button>
          </div>
        </div>

        <div className="p-8 overflow-auto flex justify-center bg-neutral-100/40">
          <ViewportFrame>
            <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
              <Space wrap>
                <AntButton type="primary">Primary Button</AntButton>
                <AntButton>Default Button</AntButton>
                <AntButton type="dashed">Dashed Button</AntButton>
                <AntButton type="text">Text Button</AntButton>
                <AntButton type="link">Link Button</AntButton>
              </Space>

              <Divider>按钮尺寸</Divider>
              <Space wrap>
                <AntButton type="primary" size="large">Large</AntButton>
                <AntButton type="primary">Default</AntButton>
                <AntButton type="primary" size="small">Small</AntButton>
              </Space>

              <Divider>按钮状态</Divider>
              <Space wrap>
                <AntButton type="primary" loading>Loading</AntButton>
                <AntButton type="primary" disabled>Disabled</AntButton>
                <AntButton type="primary" danger>Danger</AntButton>
              </Space>
            </div>
          </ViewportFrame>
        </div>
      </div>
    </div>
  );
};
