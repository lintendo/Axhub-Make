import React, { useState } from 'react';
import { Row, Col, Typography, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface ColorsProps {
  tokens: Record<string, any>;
}

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

export const Colors: React.FC<ColorsProps> = ({ tokens }) => {
  const brandColors = [
    { name: 'colorPrimary', desc: '品牌色 (Brand Color)' },
    { name: 'colorInfo', desc: '信息色 (Info Color)' },
  ];

  const functionalColors = [
    { name: 'colorSuccess', desc: '成功色 (Success Color)' },
    { name: 'colorWarning', desc: '警告色 (Warning Color)' },
    { name: 'colorError', desc: '错误色 (Error Color)' },
  ];

  const baseColors = [
    { name: 'colorTextBase', desc: '基础文本色 (Text Base)' },
    { name: 'colorBgBase', desc: '基础背景色 (Background Base)' },
    { name: 'colorLink', desc: '链接色 (Link Color)' },
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">色彩 Colors</h1>
        <p className="text-neutral-600 mb-8 max-w-2xl">
          色彩系统旨在提供清晰的可访问性和和谐的视觉体验。
        </p>
        
        <Title level={5} style={{ marginTop: 24 }}>品牌与信息</Title>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {brandColors.map(c => (
            <Col xs={24} sm={12} md={8} key={c.name}>
              <ColorItem name={c.name} value={tokens[c.name]} description={c.desc} />
            </Col>
          ))}
        </Row>

        <Title level={5}>功能色</Title>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {functionalColors.map(c => (
            <Col xs={24} sm={12} md={8} key={c.name}>
              <ColorItem name={c.name} value={tokens[c.name]} description={c.desc} />
            </Col>
          ))}
        </Row>

        <Title level={5}>基础色</Title>
        <Row gutter={[16, 16]}>
          {baseColors.map(c => (
            <Col xs={24} sm={12} md={8} key={c.name}>
              <ColorItem name={c.name} value={tokens[c.name]} description={c.desc} />
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};
