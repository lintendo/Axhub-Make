import React from 'react';
import { Card, Row, Col, Statistic, Table, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, UserOutlined, ShoppingCartOutlined, DollarOutlined, EyeOutlined } from '@ant-design/icons';

export const DashboardTemplate: React.FC = () => {
  const columns = [
    {
      title: '产品名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '销量',
      dataIndex: 'sales',
      key: 'sales',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <span style={{ color: status === '热销' ? '#52c41a' : '#faad14' }}>
          {status}
        </span>
      ),
    },
  ];

  const data = [
    { key: '1', name: '产品 A', sales: 1234, status: '热销' },
    { key: '2', name: '产品 B', sales: 987, status: '正常' },
    { key: '3', name: '产品 C', sales: 756, status: '正常' },
    { key: '4', name: '产品 D', sales: 543, status: '热销' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">仪表盘 Dashboard</h1>
        <p className="text-neutral-600">数据概览和关键指标展示。</p>
      </div>

      <div className="p-8 border border-neutral-200 rounded-lg bg-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">运营概览</h2>
            <p className="text-sm text-neutral-500">近 30 天关键指标与业务健康度</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs rounded-full border border-neutral-200 bg-white/80 text-neutral-600 hover:text-neutral-900">下载周报</button>
            <button className="px-3 py-1.5 text-xs rounded-full border border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800">生成简报</button>
          </div>
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card bordered={true}>
              <Statistic
                title="总用户数"
                value={11280}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#0f172a' }}
                suffix={
                  <span style={{ fontSize: 14, color: '#52c41a' }}>
                    <ArrowUpOutlined /> 12%
                  </span>
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card bordered={true}>
              <Statistic
                title="总订单数"
                value={9362}
                prefix={<ShoppingCartOutlined />}
                valueStyle={{ color: '#0f172a' }}
                suffix={
                  <span style={{ fontSize: 14, color: '#52c41a' }}>
                    <ArrowUpOutlined /> 8%
                  </span>
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card bordered={true}>
              <Statistic
                title="总收入"
                value={93826}
                prefix={<DollarOutlined />}
                valueStyle={{ color: '#0f172a' }}
                suffix={
                  <span style={{ fontSize: 14, color: '#ff4d4f' }}>
                    <ArrowDownOutlined /> 3%
                  </span>
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card bordered={true}>
              <Statistic
                title="页面浏览量"
                value={128450}
                prefix={<EyeOutlined />}
                valueStyle={{ color: '#0f172a' }}
                suffix={
                  <span style={{ fontSize: 14, color: '#52c41a' }}>
                    <ArrowUpOutlined /> 15%
                  </span>
                }
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col xs={24} lg={16}>
            <Card title="销售数据" bordered={true}>
              <Table columns={columns} dataSource={data} pagination={false} />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="完成进度" bordered={true}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 8 }}>项目 A</div>
                <Progress percent={75} status="active" />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 8 }}>项目 B</div>
                <Progress percent={60} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 8 }}>项目 C</div>
                <Progress percent={90} status="success" />
              </div>
              <div>
                <div style={{ marginBottom: 8 }}>项目 D</div>
                <Progress percent={45} />
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};
