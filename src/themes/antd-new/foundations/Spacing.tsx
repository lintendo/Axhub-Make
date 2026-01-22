import React from 'react';
import { Row, Col, Typography } from 'antd';

const { Text } = Typography;

interface SpacingProps {
  tokens: Record<string, any>;
}

export const Spacing: React.FC<SpacingProps> = ({ tokens }) => {
  const sizes = ['XXS', 'XS', 'SM', 'MD', 'LG', 'XL', 'XXL'];
  
  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">间距 Spacing</h1>
        <p className="text-neutral-600 mb-8">
          基于 {tokens.sizeUnit}px 基准的统一间距系统。
        </p>

        <Row gutter={[16, 16]}>
          {sizes.map(size => {
            const key = `size${size}`;
            const value = tokens[key];
            if (!value) return null;
            
            return (
              <Col xs={24} sm={12} md={8} key={key}>
                <div style={{ 
                  padding: 16, 
                  border: '1px solid #f0f0f0', 
                  borderRadius: 8 
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong>{key}</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>{value}px</Text>
                  </div>
                  <div 
                    style={{ 
                      width: value, 
                      height: value, 
                      background: '#1677ff',
                      borderRadius: 4
                    }} 
                  />
                </div>
              </Col>
            );
          })}
        </Row>
      </div>
    </div>
  );
};
