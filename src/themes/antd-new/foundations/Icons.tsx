import React from 'react';
import { Row, Col, Card, Input, message } from 'antd';
import * as Icons from '@ant-design/icons';

interface IconsProps {
  tokens: Record<string, any>;
}

export const IconsSection: React.FC<IconsProps> = ({ tokens }) => {
  const [searchText, setSearchText] = React.useState('');

  // 常用图标列表
  const commonIcons = [
    'HomeOutlined', 'UserOutlined', 'SettingOutlined', 'SearchOutlined',
    'HeartOutlined', 'StarOutlined', 'LikeOutlined', 'MessageOutlined',
    'BellOutlined', 'MailOutlined', 'PhoneOutlined', 'CameraOutlined',
    'FileOutlined', 'FolderOutlined', 'SaveOutlined', 'DeleteOutlined',
    'EditOutlined', 'CopyOutlined', 'CheckOutlined', 'CloseOutlined',
    'PlusOutlined', 'MinusOutlined', 'UpOutlined', 'DownOutlined',
    'LeftOutlined', 'RightOutlined', 'MenuOutlined', 'AppstoreOutlined',
  ];

  const handleCopyIconName = (iconName: string) => {
    navigator.clipboard.writeText(`<${iconName} />`);
    message.success(`已复制: <${iconName} />`);
  };

  const filteredIcons = commonIcons.filter(name => 
    name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">图标 Icons</h1>
        <p className="text-neutral-600 mb-8">
          Ant Design 提供了语义化的矢量图标，使用 @ant-design/icons 包。
        </p>

        <div className="mb-6">
          <Input.Search
            placeholder="搜索图标..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 400 }}
            size="large"
          />
        </div>

        <Row gutter={[16, 16]}>
          {filteredIcons.map((iconName) => {
            const IconComponent = (Icons as any)[iconName];
            if (!IconComponent) return null;

            return (
              <Col xs={12} sm={8} md={6} lg={4} key={iconName}>
                <Card
                  hoverable
                  onClick={() => handleCopyIconName(iconName)}
                  style={{ textAlign: 'center', cursor: 'pointer' }}
                >
                  <IconComponent style={{ fontSize: 32 }} />
                  <div style={{ 
                    marginTop: 12, 
                    fontSize: 12, 
                    color: tokens.colorTextSecondary,
                    wordBreak: 'break-word'
                  }}>
                    {iconName}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>

      </div>
    </div>
  );
};
