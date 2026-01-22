import React from 'react';
import { Row, Col, Card } from 'antd';

interface RadiusProps {
  tokens: Record<string, any>;
}

export const Radius: React.FC<RadiusProps> = ({ tokens }) => {
  const radiusValues = [
    { name: 'borderRadiusXS', value: tokens.borderRadiusXS, label: '超小圆角' },
    { name: 'borderRadiusSM', value: tokens.borderRadiusSM, label: '小圆角' },
    { name: 'borderRadius', value: tokens.borderRadius, label: '基础圆角' },
    { name: 'borderRadiusLG', value: tokens.borderRadiusLG, label: '大圆角' },
    { name: 'borderRadiusOuter', value: tokens.borderRadiusOuter, label: '外层圆角' },
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">圆角 Border Radius</h1>
        <p className="text-neutral-600 mb-8">
          统一的圆角规范，适用于不同尺寸的组件。
        </p>

        <Row gutter={[24, 24]}>
          {radiusValues.map((item) => (
            <Col xs={24} sm={12} md={8} key={item.name}>
              <Card>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{item.label}</div>
                  <code style={{ fontSize: 12, color: tokens.colorTextSecondary }}>
                    {item.name}: {item.value}px
                  </code>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 120,
                    background: '#e2e8f0',
                    border: '1px dashed #cbd5e1',
                    borderRadius: item.value,
                  }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};
