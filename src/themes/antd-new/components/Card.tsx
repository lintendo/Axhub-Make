import React from 'react';
import { Card as AntCard, Row, Col, Avatar, Space } from 'antd';
import { EditOutlined, EllipsisOutlined, SettingOutlined } from '@ant-design/icons';

const { Meta } = AntCard;

interface CardSectionProps {
  tokens: Record<string, any>;
}

export const CardSection: React.FC<CardSectionProps> = ({ tokens }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">卡片 Card</h1>
        <p className="text-neutral-600">通用卡片容器，承载文字、列表、图片、段落等内容。</p>
      </div>

      <div className="space-y-8">
        <div>
          <h3 className="text-base font-semibold mb-4">基础卡片</h3>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <AntCard title="默认卡片" bordered={false}>
                <p>卡片内容</p>
                <p>卡片内容</p>
                <p>卡片内容</p>
              </AntCard>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <AntCard title="带边框卡片" bordered={true}>
                <p>卡片内容</p>
                <p>卡片内容</p>
                <p>卡片内容</p>
              </AntCard>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <AntCard title="无标题卡片" bordered={false}>
                <p>卡片内容</p>
                <p>卡片内容</p>
                <p>卡片内容</p>
              </AntCard>
            </Col>
          </Row>
        </div>

        <div>
          <h3 className="text-base font-semibold mb-4">带封面的卡片</h3>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <AntCard
                hoverable
                cover={
                  <div style={{
                    height: 200,
                    background: '#fafafa',
                    borderBottom: '1px dashed #d9d9d9',
                    color: 'rgba(0, 0, 0, 0.45)',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center'
                  }}>
                    封面图片
                  </div>
                }
              >
                <Meta
                  avatar={<Avatar style={{ backgroundColor: tokens.colorPrimary }}>U</Avatar>}
                  title="卡片标题"
                  description="这是卡片的描述信息"
                />
              </AntCard>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <AntCard
                hoverable
                cover={
                  <div style={{
                    height: 200,
                    background: '#fafafa',
                    borderBottom: '1px dashed #d9d9d9',
                    color: 'rgba(0, 0, 0, 0.45)',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center'
                  }}>
                    封面图片
                  </div>
                }
              >
                <Meta
                  avatar={<Avatar style={{ backgroundColor: tokens.colorSuccess }}>U</Avatar>}
                  title="卡片标题"
                  description="这是卡片的描述信息"
                />
              </AntCard>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <AntCard
                hoverable
                cover={
                  <div style={{
                    height: 200,
                    background: '#fafafa',
                    borderBottom: '1px dashed #d9d9d9',
                    color: 'rgba(0, 0, 0, 0.45)',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center'
                  }}>
                    封面图片
                  </div>
                }
              >
                <Meta
                  avatar={<Avatar style={{ backgroundColor: tokens.colorWarning }}>U</Avatar>}
                  title="卡片标题"
                  description="这是卡片的描述信息"
                />
              </AntCard>
            </Col>
          </Row>
        </div>

        <div>
          <h3 className="text-base font-semibold mb-4">带操作的卡片</h3>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <AntCard
                actions={[
                  <SettingOutlined key="setting" />,
                  <EditOutlined key="edit" />,
                  <EllipsisOutlined key="ellipsis" />,
                ]}
              >
                <Meta
                  avatar={<Avatar style={{ backgroundColor: tokens.colorPrimary }}>U</Avatar>}
                  title="卡片标题"
                  description="这是卡片的描述信息，可以包含更多内容"
                />
              </AntCard>
            </Col>
          </Row>
        </div>

        <div>
          <h3 className="text-base font-semibold mb-4">加载中状态</h3>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <AntCard loading>
                <Meta
                  avatar={<Avatar>U</Avatar>}
                  title="卡片标题"
                  description="这是卡片的描述信息"
                />
              </AntCard>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
};
