/**
 * @name 侧边菜单
 * 
 * 参考资料：
 * - /rules/development-standards.md
 * - /rules/axure-api-guide.md
 * - /assets/docs/设计规范.UIGuidelines.md
 * - /src/themes/antd-new/designToken.json (Ant Design 主题)
 * - /assets/libraries/antd.md (Ant Design 组件库)
 */

import './style.css';

import React, { useState, useCallback, useMemo } from 'react';
import { Layout, Menu, Button, theme } from 'antd';
import {
  DashboardOutlined,
  ShoppingOutlined,
  UserOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons';

type MenuItemInput = {
  key?: string;
  label?: string;
  icon?: string;
  disabled?: boolean;
  children?: MenuItemInput[];
};

type SideMenuProps = {
  title?: string;
  width?: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  defaultSelectedKey?: string;
  items?: MenuItemInput[];
  onMenuSelect?: (key: string) => void;
  onCollapseChange?: (collapsed: boolean) => void;
};

function resolveIcon(name?: string) {
  switch (name) {
    case 'dashboard':
      return <DashboardOutlined />;
    case 'shop':
      return <ShoppingOutlined />;
    case 'user':
      return <UserOutlined />;
    case 'setting':
      return <SettingOutlined />;
    default:
      return undefined;
  }
}

function normalizeItems(items: any): MenuItemInput[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map(function (it: any) {
    return {
      key: typeof it?.key === 'string' && it.key ? it.key : String(it?.key ?? it?.label ?? ''),
      label: typeof it?.label === 'string' ? it.label : String(it?.label ?? ''),
      icon: typeof it?.icon === 'string' ? it.icon : undefined,
      disabled: it?.disabled === true,
      children: Array.isArray(it?.children) ? normalizeItems(it.children) : undefined
    };
  }).filter(function (it: MenuItemInput) { return !!it.key; });
}

const DEFAULT_ITEMS: MenuItemInput[] = [
  { key: 'dashboard', label: '仪表盘', icon: 'dashboard' },
  {
    key: 'orders',
    label: '订单管理',
    icon: 'shop',
    children: [
      { key: 'orders_list', label: '订单列表' },
      { key: 'orders_refund', label: '退款管理' }
    ]
  },
  { key: 'users', label: '用户管理', icon: 'user' },
  { key: 'settings', label: '系统设置', icon: 'setting' }
];

const Component = function SideMenu(props: SideMenuProps) {
  const title = typeof props.title === 'string' && props.title ? props.title : 'Axhub';
  const width = typeof props.width === 'number' && props.width > 0 ? props.width : 240;
  const collapsible = props.collapsible !== false;
  const defaultCollapsed = props.defaultCollapsed === true;
  const defaultSelectedKey = typeof props.defaultSelectedKey === 'string' && props.defaultSelectedKey
    ? props.defaultSelectedKey
    : 'dashboard';

  const normalizedItems = useMemo(function () {
    const fromProps = normalizeItems(props.items);
    return fromProps.length > 0 ? fromProps : DEFAULT_ITEMS;
  }, [props.items]);

  const { token } = theme.useToken();

  const collapsedState = useState<boolean>(defaultCollapsed);
  const collapsed = collapsedState[0];
  const setCollapsed = collapsedState[1];

  const selectedKeyState = useState<string>(defaultSelectedKey);
  const selectedKey = selectedKeyState[0];
  const setSelectedKey = selectedKeyState[1];

  const openKeysState = useState<string[]>([]);
  const openKeys = openKeysState[0];
  const setOpenKeys = openKeysState[1];

  const menuItems = useMemo(function () {
    function toAntdItems(list: MenuItemInput[]): any[] {
      return list.map(function (item) {
        return {
          key: item.key,
          label: item.label,
          icon: resolveIcon(item.icon),
          disabled: item.disabled,
          children: Array.isArray(item.children) && item.children.length > 0 ? toAntdItems(item.children) : undefined
        };
      });
    }
    return toAntdItems(normalizedItems);
  }, [normalizedItems]);

  const handleToggleCollapsed = useCallback(function () {
    setCollapsed(function (prev) {
      const next = !prev;
      if (typeof props.onCollapseChange === 'function') {
        props.onCollapseChange(next);
      }
      return next;
    });
  }, [props]);

  const handleMenuClick = useCallback(function (info: any) {
    const key = typeof info?.key === 'string' ? info.key : String(info?.key ?? '');
    if (!key) {
      return;
    }
    setSelectedKey(key);
    if (typeof props.onMenuSelect === 'function') {
      props.onMenuSelect(key);
    }
  }, [props]);

  const handleOpenChange = useCallback(function (keys: any) {
    const next = Array.isArray(keys) ? keys.map(String) : [];
    setOpenKeys(next);
  }, []);

  return (
    <Layout.Sider
      className="axhub-side-menu"
      width={width}
      collapsedWidth={64}
      collapsed={collapsed}
      trigger={null}
      style={{
        background: token.colorBgContainer,
        borderRight: '1px solid ' + token.colorBorderSecondary
      }}
    >
      <div className={'axhub-side-menu__header' + (collapsed ? ' axhub-side-menu__header--collapsed' : '')}>
        {!collapsed && <div className="axhub-side-menu__title">{title}</div>}
        {collapsible && (
          <Button
            className="axhub-side-menu__collapse"
            type="text"
            size="small"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={handleToggleCollapsed}
          />
        )}
      </div>
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        items={menuItems}
        selectedKeys={selectedKey ? [selectedKey] : []}
        openKeys={collapsed ? [] : openKeys}
        onClick={handleMenuClick}
        onOpenChange={handleOpenChange}
        style={{ borderInlineEnd: 0, background: 'transparent' }}
      />
    </Layout.Sider>
  );
};

export default Component;
