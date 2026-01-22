import React, { useState } from 'react';
import { Card, Row, Col, message, Tooltip } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';

interface ShadowsProps {
  tokens: Record<string, any>;
}

const ShadowCard = ({ name, label, value, tokens }: { name: string, label: string, value: string, tokens: Record<string, any> }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    message.success('已复制阴影值');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card
      hoverable
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
      bodyStyle={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 8,
          backgroundColor: '#fff',
          boxShadow: value,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: tokens.colorTextSecondary,
        }}
      >
        Preview
      </div>
      
      <div style={{ textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: tokens.colorTextSecondary, marginBottom: 16 }}>
          {name}
        </div>
        <Tooltip title="复制阴影值">
          <div 
            onClick={handleCopy}
            style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              color: copied ? tokens.colorSuccess : tokens.colorPrimary,
              fontSize: 12,
              padding: '4px 8px',
              background: copied ? tokens.colorSuccessBg : tokens.colorPrimaryBg,
              borderRadius: 4,
              transition: 'all 0.2s',
            }}
          >
            {copied ? <CheckOutlined /> : <CopyOutlined />}
            <span>{copied ? '已复制' : '复制配置'}</span>
          </div>
        </Tooltip>
      </div>
    </Card>
  );
};

export const Shadows: React.FC<ShadowsProps> = ({ tokens }) => {
  const shadows = [
    { name: 'boxShadow', label: '基础阴影', value: tokens.boxShadow },
    { name: 'boxShadowSecondary', label: '次级阴影', value: tokens.boxShadowSecondary },
    { name: 'boxShadowTertiary', label: '三级阴影', value: tokens.boxShadowTertiary },
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">阴影 Shadows</h1>
        <p className="text-neutral-600 mb-8">
          阴影用于表现元素的层级关系和空间深度。
        </p>

        <Row gutter={[24, 24]}>
          {shadows.map((shadow) => (
            <Col xs={24} sm={12} md={8} key={shadow.name}>
              <ShadowCard 
                name={shadow.name} 
                label={shadow.label} 
                value={shadow.value} 
                tokens={tokens} 
              />
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};
