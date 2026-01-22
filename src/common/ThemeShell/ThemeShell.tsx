/**
 * ThemeShell - 去主题化的设计系统展示组件
 *
 * 核心特性：
 * - 零视觉干扰：使用中性色，不抢占内容焦点
 * - 完全可配置：标题、分组、导航项均通过 props 配置
 * - 响应式支持：桌面端侧边栏 + 移动端抽屉式导航
 * - 可折叠侧边栏：支持展开/收起
 * - 主题支持：支持深色/浅色主题配置
 */

import React, { useState, useCallback, useMemo, CSSProperties } from 'react';
import { ThemeShellProps, NavGroup, NavItem, ThemeColors } from './types';
import { createShellStyles, getThemeColors } from './styles';
import { Icons } from './Icons';

// 单个导航项组件 - 使用独立的 hover 状态
const NavItemButton: React.FC<{
  item: NavItem;
  isActive: boolean;
  onNavigate: (id: string) => void;
  styles: Record<string, CSSProperties>;
  colors: ThemeColors;
}> = ({ item, isActive, onNavigate, styles, colors }) => {
  const [isHovered, setIsHovered] = useState(false);

  // 点击后清除 hover 状态
  const handleClick = () => {
    setIsHovered(false);
    onNavigate(item.id);
  };

  // 只有当前激活项显示激活样式，其他项只在 hover 时显示 hover 样式
  const style: CSSProperties = {
    ...styles.navItem,
    ...(isActive ? styles.navItemActive : {}),
    ...(!isActive && isHovered ? styles.navItemHover : {}),
  };

  return (
    <li>
      <button
        onClick={handleClick}
        style={style}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
        {item.label}
      </button>
    </li>
  );
};

export const ThemeShell: React.FC<ThemeShellProps> = ({
  brand,
  groups,
  items,
  activeId,
  onNavigate,
  sidebar,
  theme,
  children,
  header,
  className,
  style,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(sidebar?.defaultOpen ?? true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const sidebarWidth = sidebar?.width ?? 256;
  const collapsible = sidebar?.collapsible ?? true;

  // 计算主题颜色和样式
  const themeColors = useMemo(() =>
    getThemeColors(theme?.mode ?? 'light', theme?.colors),
    [theme?.mode, theme?.colors]
  );

  const STYLES = useMemo(() =>
    createShellStyles(themeColors),
    [themeColors]
  );

  // 按分组组织导航项
  const sortedGroups = [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const getItemsByGroup = useCallback(
    (groupId: string): NavItem[] => items.filter(item => item.groupId === groupId),
    [items]
  );

  // 处理导航点击
  const handleNavigate = useCallback(
    (id: string) => {
      onNavigate(id);
      setMobileMenuOpen(false);
    },
    [onNavigate]
  );

  // 渲染单个导航项
  const renderNavItem = (item: NavItem) => {
    const isActive = item.id === activeId;
    return (
      <NavItemButton
        key={item.id}
        item={item}
        isActive={isActive}
        onNavigate={handleNavigate}
        styles={STYLES}
        colors={themeColors}
      />
    );
  };

  // 渲染导航分组
  const renderNavGroup = (group: NavGroup) => {
    const groupItems = getItemsByGroup(group.id);
    if (groupItems.length === 0) return null;

    return (
      <div key={group.id} style={STYLES.navGroup}>
        <div style={STYLES.navGroupTitle}>{group.title}</div>
        <ul style={STYLES.navList}>
          {groupItems.map(renderNavItem)}
        </ul>
      </div>
    );
  };

  // 渲染品牌区域
  const renderBrand = () => {
    if (!brand) return null;

    return (
      <div style={STYLES.brandArea}>
        <div style={STYLES.brandContent as CSSProperties}>
          <div style={STYLES.brandText as CSSProperties}>
            <span style={STYLES.brandName}>{brand.name}</span>
            {brand.subtitle && (
              <span style={STYLES.brandSubtitle}>{brand.subtitle}</span>
            )}
          </div>
        </div>
        {collapsible && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={STYLES.collapseBtn}
            title="收起侧边栏"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeColors.bgHover;
              e.currentTarget.style.color = themeColors.textPrimary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = themeColors.textTertiary;
            }}
          >
            <Icons.Collapse />
          </button>
        )}
      </div>
    );
  };

  // 渲染侧边栏内容
  const renderSidebarContent = () => (
    <>
      {renderBrand()}
      <nav className="theme-shell-scroll" style={STYLES.navArea as CSSProperties}>
        {sortedGroups.map(renderNavGroup)}
      </nav>
    </>
  );

  // 桌面端侧边栏样式
  const desktopSidebarStyle: CSSProperties = {
    ...STYLES.sidebar as CSSProperties,
    ...(sidebarOpen
      ? { ...STYLES.sidebarOpen, width: sidebarWidth }
      : STYLES.sidebarClosed),
  };

  // 移动端侧边栏样式
  const mobileSidebarStyle: CSSProperties = {
    ...STYLES.mobileSidebar as CSSProperties,
    ...(mobileMenuOpen ? STYLES.mobileSidebarOpen : {}),
  };

  return (
    <div
      className={className}
      style={{
        ...STYLES.root as CSSProperties,
        '--theme-text-primary': themeColors.textPrimary,
        '--theme-text-secondary': themeColors.textSecondary,
        '--theme-text-tertiary': themeColors.textTertiary,
        '--theme-text-muted': themeColors.textMuted,
        '--theme-border': themeColors.border,
        '--theme-border-light': themeColors.borderLight,
        '--theme-bg-secondary': themeColors.bgSecondary,
        '--theme-bg-tertiary': themeColors.bgTertiary,
        ...style,
      } as CSSProperties}
    >
      <style>{`
        .theme-shell-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .theme-shell-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        .theme-shell-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .theme-shell-scroll::-webkit-scrollbar-thumb {
          background-color: transparent;
          border-radius: 0;
        }
        .theme-shell-scroll:hover::-webkit-scrollbar-thumb {
          background-color: transparent;
        }
      `}</style>
      {/* 移动端顶栏 */}
      <div
        className="theme-shell-mobile-topbar"
        style={{
          ...STYLES.mobileTopbar as CSSProperties,
          display: 'none', // 默认隐藏，CSS 媒体查询控制
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {brand && <span style={{ fontWeight: 600, fontSize: 15 }}>{brand.name}</span>}
        </div>
        <button
          onClick={() => setMobileMenuOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            padding: 8,
            cursor: 'pointer',
            color: themeColors.textSecondary,
          }}
        >
          <Icons.Menu />
        </button>
      </div>

      {/* 移动端遮罩 */}
      {mobileMenuOpen && (
        <div
          style={STYLES.mobileOverlay as CSSProperties}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 移动端侧边栏 */}
      <aside className="theme-shell-mobile-sidebar" style={mobileSidebarStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ ...STYLES.brandArea as CSSProperties, justifyContent: 'space-between' }}>
            {brand && (
              <div style={STYLES.brandContent as CSSProperties}>
                <div style={STYLES.brandText as CSSProperties}>
                  <span style={STYLES.brandName}>{brand.name}</span>
                  {brand.subtitle && (
                    <span style={STYLES.brandSubtitle}>{brand.subtitle}</span>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                color: themeColors.textTertiary,
              }}
            >
              <Icons.Close />
            </button>
          </div>
          <nav className="theme-shell-scroll" style={STYLES.navArea as CSSProperties}>
            {sortedGroups.map(renderNavGroup)}
          </nav>
        </div>
      </aside>

      {/* 桌面端侧边栏 */}
      <aside className="theme-shell-sidebar" style={desktopSidebarStyle}>
        {renderSidebarContent()}
      </aside>

      {/* 展开按钮（侧边栏关闭时） */}
      {!sidebarOpen && collapsible && (
        <button
          className="theme-shell-expand-btn"
          onClick={() => setSidebarOpen(true)}
          style={STYLES.expandBtn as CSSProperties}
          title="展开侧边栏"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeColors.bgHover;
            e.currentTarget.style.color = themeColors.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = themeColors.bgPrimary;
            e.currentTarget.style.color = themeColors.textSecondary;
          }}
        >
          <Icons.Expand />
        </button>
      )}

      {/* 主内容区 */}
      <main style={STYLES.main as CSSProperties}>
        {/* 可选头部区域 */}
        {header && <div style={STYLES.header as CSSProperties}>{header}</div>}

        {/* 内容区 */}
        <div style={STYLES.content as CSSProperties}>{children}</div>
      </main>
    </div>
  );
};

export default ThemeShell;
