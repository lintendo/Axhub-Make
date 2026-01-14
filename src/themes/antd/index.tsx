/**
 * @name Ant Design Tokens 演示
 */

import React, { useState } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Typography, 
  Space, 
  ConfigProvider, 
  Tag,
  Tooltip,
  message,
  Divider,
  Descriptions,
  theme as antTheme
} from 'antd';
import { 
  CopyOutlined, 
  CheckOutlined,
  BgColorsOutlined,
  FontSizeOutlined,
  BorderOutlined
} from '@ant-design/icons';
import tokens from './designToken.json';

const { Title, Text, Paragraph } = Typography;

const ColorItem = ({ name, value, description }: { name: string, value: string, description?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    message.success(`已复制: ${value}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={handleCopy}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12, 
        padding: 12, 
        borderRadius: 8, 
        border: '1px solid #f0f0f0',
        cursor: 'pointer',
        transition: 'all 0.2s',
        // Removed height: '100%' to avoid potential layout issues with parent container
      }}
      className="color-item-hover"
    >
      <div 
        style={{ 
          width: 48, 
          height: 48, 
          borderRadius: 8, 
          background: value,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
          flexShrink: 0
        }} 
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text strong ellipsis>{name}</Text>
          {copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined style={{ color: '#00000040', fontSize: 12 }} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{value}</Text>
          {description && <Text type="secondary" style={{ fontSize: 12, marginTop: 2 }}>{description}</Text>}
        </div>
      </div>
    </div>
  );
};

const TokenSection = ({ title, icon, children }: { title: string, icon?: React.ReactNode, children: React.ReactNode }) => (
  <Card 
    title={
      <Space>
        {icon}
        <span>{title}</span>
      </Space>
    } 
    bordered={false}
    style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)' }}
    styles={{ body: { padding: 0 } }} // Reset default padding
  >
    <div style={{ padding: '24px' }}>
      {children}
    </div>
  </Card>
);

function Component() {
  const tokenMap = tokens as unknown as Record<string, any>;

  // Core Brand Colors
  const brandColors = [
    { name: 'colorPrimary', desc: '品牌色 (Brand Color)' },
    { name: 'colorInfo', desc: '信息色 (Info Color)' },
  ];

  // Functional Colors
  const functionalColors = [
    { name: 'colorSuccess', desc: '成功色 (Success Color)' },
    { name: 'colorWarning', desc: '警告色 (Warning Color)' },
    { name: 'colorError', desc: '错误色 (Error Color)' },
  ];

  // Base Colors
  const baseColors = [
    { name: 'colorTextBase', desc: '基础文本色 (Text Base)' },
    { name: 'colorBgBase', desc: '基础背景色 (Background Base)' },
    { name: 'colorLink', desc: '链接色 (Link Color)' },
  ];

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: tokenMap.colorPrimary || '#1677ff',
          borderRadius: typeof tokenMap.borderRadius === 'number' ? tokenMap.borderRadius : 6,
        },
      }}
    >
      <div style={{ 
        padding: '40px 24px', 
        background: tokenMap.colorBgLayout || '#f5f5f5', 
        minHeight: '100vh',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ marginBottom: 48, textAlign: 'center' }}>
            <Title level={1} style={{ marginBottom: 16 }}>
              {tokenMap.name || '设计变量 (Design Tokens)'}
            </Title>
            <Paragraph type="secondary" style={{ fontSize: 16, maxWidth: 600, margin: '0 auto' }}>
              {tokenMap.description || '当前主题的核心设计变量与值。'}
            </Paragraph>
          </div>

          <Space direction="vertical" size={32} style={{ width: '100%' }}>
            {/* Colors Section */}
            <TokenSection title="核心色彩" icon={<BgColorsOutlined />}>
              <Title level={5} style={{ marginTop: 8 }}>品牌与信息</Title>
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {brandColors.map(c => (
                  <Col xs={24} sm={12} md={8} key={c.name}>
                    <ColorItem name={c.name} value={tokenMap[c.name]} description={c.desc} />
                  </Col>
                ))}
              </Row>

              <Title level={5}>功能色</Title>
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {functionalColors.map(c => (
                  <Col xs={24} sm={12} md={8} key={c.name}>
                    <ColorItem name={c.name} value={tokenMap[c.name]} description={c.desc} />
                  </Col>
                ))}
              </Row>

              <Title level={5}>基础色</Title>
              <Row gutter={[16, 16]}>
                {baseColors.map(c => (
                  <Col xs={24} sm={12} md={8} key={c.name}>
                    <ColorItem name={c.name} value={tokenMap[c.name]} description={c.desc} />
                  </Col>
                ))}
              </Row>
            </TokenSection>

            {/* Typography Section */}
            <TokenSection title="排版字体" icon={<FontSizeOutlined />}>
              <Descriptions bordered column={1}>
                <Descriptions.Item label="字体家族 (Font Family)">
                  <Text code copyable style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{tokenMap.fontFamily}</Text>
                  <div style={{ marginTop: 8, fontSize: 16, fontFamily: tokenMap.fontFamily }}>
                    天地玄黄，宇宙洪荒。The quick brown fox jumps over the lazy dog.
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="基础字号 (Font Size)">
                  <Text code>{tokenMap.fontSize}px</Text>
                </Descriptions.Item>
                <Descriptions.Item label="基础行高 (Line Height)">
                  <Text code>{tokenMap.lineHeight || 1.5}</Text>
                </Descriptions.Item>
              </Descriptions>
            </TokenSection>

            {/* Layout & Shape Section */}
            <TokenSection title="形状与布局" icon={<BorderOutlined />}>
               <Row gutter={[32, 32]}>
                 <Col xs={24} md={12}>
                    <Descriptions title="圆角 (Border Radius)" column={1} size="small" bordered style={{ height: '100%' }}>
                      <Descriptions.Item label="borderRadius">
                        <Space align="center" style={{ height: 40 }}>
                          <Text code>{tokenMap.borderRadius}px</Text>
                          <div style={{ 
                            width: 40, 
                            height: 40, 
                            background: tokenMap.colorPrimary, 
                            borderRadius: tokenMap.borderRadius 
                          }} />
                        </Space>
                      </Descriptions.Item>
                    </Descriptions>
                 </Col>
                 <Col xs={24} md={12}>
                    <Descriptions title="控件高度 (Control Height)" column={1} size="small" bordered style={{ height: '100%' }}>
                      <Descriptions.Item label="controlHeight">
                        <Space align="center" style={{ height: 40 }}>
                          <Text code>{tokenMap.controlHeight}px</Text>
                          <div style={{ 
                            height: tokenMap.controlHeight, 
                            width: 100, 
                            background: '#f0f0f0', 
                            border: '1px solid #d9d9d9',
                            borderRadius: tokenMap.borderRadius,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            输入框
                          </div>
                        </Space>
                      </Descriptions.Item>
                    </Descriptions>
                 </Col>
               </Row>
            </TokenSection>
          </Space>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default Component;
