/**
 * @name Ant Design System
 *
 * 基于 Ant Design 官方规范的设计系统演示
 * 参考：https://ant.design/docs/spec/values-cn
 */

import './style.css';
import React, { useEffect, useState } from 'react';
import { ConfigProvider } from 'antd';
import { ThemeShell, NavGroup, NavItem, MarkdownViewer } from '../../common/ThemeShell';
import tokens from './designToken.json';

// Import Foundations
import { Colors } from './foundations/Colors';
import { TypographySection } from './foundations/Typography';
import { Spacing } from './foundations/Spacing';
import { IconsSection } from './foundations/Icons';
import { Shadows } from './foundations/Shadows';
import { Radius } from './foundations/Radius';

// Import Components
import { ButtonSection } from './components/Button';
import { InputSection } from './components/Input';
import { CardSection } from './components/Card';

// Import Templates
import { LoginTemplate } from './templates/LoginTemplate';
import { DashboardTemplate } from './templates/DashboardTemplate';

// Navigation Groups
const NAV_GROUPS: NavGroup[] = [
  { id: 'docs', title: '说明', order: 1 },
  { id: 'foundation', title: '基础要素', order: 2 },
  { id: 'components', title: '组件', order: 3 },
  { id: 'templates', title: '模板', order: 4 },
];

// Navigation Items
const NAV_ITEMS: NavItem[] = [
  { id: 'design-spec', label: '设计规范 Design Spec', groupId: 'docs' },

  { id: 'colors', label: '色彩 Colors', groupId: 'foundation' },
  { id: 'typography', label: '排版 Typography', groupId: 'foundation' },
  { id: 'spacing', label: '间距 Spacing', groupId: 'foundation' },
  { id: 'icons', label: '图标 Icons', groupId: 'foundation' },
  { id: 'shadows', label: '阴影 Shadows', groupId: 'foundation' },
  { id: 'radius', label: '圆角 Radius', groupId: 'foundation' },

  { id: 'buttons', label: '按钮 Button', groupId: 'components' },
  { id: 'inputs', label: '输入框 Input', groupId: 'components' },
  { id: 'cards', label: '卡片 Card', groupId: 'components' },

  { id: 'login', label: '登录页 Login', groupId: 'templates' },
  { id: 'dashboard', label: '仪表盘 Dashboard', groupId: 'templates' },
];

// ============ Component ============

const Component: React.FC = () => {
  const [activeTab, setActiveTab] = useState('design-spec');
  const [designSpec, setDesignSpec] = useState<string>('');

  const baseTokens = tokens as Record<string, any>;

  useEffect(() => {
    fetch(new URL('./DESIGN-SPEC.md', import.meta.url).href)
      .then(res => res.text())
      .then(text => setDesignSpec(text))
      .catch(err => console.error('Failed to load Design Spec:', err));
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'design-spec':
        return designSpec ? <MarkdownViewer content={designSpec} /> : (
          <div className="text-center py-12" style={{ color: 'rgba(0, 0, 0, 0.45)' }}>加载设计规范中...</div>
        );

      case 'colors':
        return <Colors tokens={baseTokens} />;

      case 'typography':
        return <TypographySection tokens={baseTokens} />;

      case 'spacing':
        return <Spacing tokens={baseTokens} />;

      case 'icons':
        return <IconsSection tokens={baseTokens} />;

      case 'shadows':
        return <Shadows tokens={baseTokens} />;

      case 'radius':
        return <Radius tokens={baseTokens} />;

      case 'buttons':
        return <ButtonSection tokens={baseTokens} />;

      case 'inputs':
        return <InputSection tokens={baseTokens} />;

      case 'cards':
        return <CardSection tokens={baseTokens} />;

      case 'login':
        return <LoginTemplate />;

      case 'dashboard':
        return <DashboardTemplate />;

      default:
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6" style={{ color: 'rgba(0, 0, 0, 0.25)' }}>
              <span className="text-2xl font-mono">;</span>
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'rgba(0, 0, 0, 0.88)' }}>施工中 Work in Progress</h2>
            <p style={{ color: 'rgba(0, 0, 0, 0.45)' }}>
              <span className="font-medium" style={{ color: 'rgba(0, 0, 0, 0.65)' }}>{activeTab}</span> 模块正在开发中...
            </p>
          </div>
        );
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: baseTokens.colorPrimary || '#1677ff',
          borderRadius: typeof baseTokens.borderRadius === 'number' ? baseTokens.borderRadius : 6,
          fontSize: typeof baseTokens.fontSize === 'number' ? baseTokens.fontSize : 14,
        },
      }}
    >
      <ThemeShell
        brand={{
          name: 'Ant Design',
          subtitle: 'Design System',
          logoBgColor: '#1677ff',
          logoTextColor: '#ffffff',
        }}
        groups={NAV_GROUPS}
        items={NAV_ITEMS}
        activeId={activeTab}
        onNavigate={setActiveTab}
        sidebar={{
          defaultOpen: true,
          collapsible: true,
          width: 256,
        }}
        className="antd-new-theme"
      >
        <div className="max-w-5xl mx-auto">
          {renderContent()}
        </div>
      </ThemeShell>
    </ConfigProvider>
  );
};

export default Component;
