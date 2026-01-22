/**
 * ThemeShell 样式定义
 *
 * 支持深色/浅色主题 - 使用中性色，减少视觉干扰
 */

import { CSSProperties } from 'react';
import { ThemeColors, ThemeMode } from './types';

// 浅色主题色板
export const LIGHT_COLORS: ThemeColors = {
  // 文字
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textMuted: '#b3b3b3',

  // 背景
  bgPrimary: '#ffffff',
  bgSecondary: '#fafafa',
  bgTertiary: '#f5f5f5',
  bgHover: '#f0f0f0',
  bgActive: '#e8e8e8',

  // 边框
  border: '#e5e5e5',
  borderLight: '#f0f0f0',

  // 状态指示
  activeIndicator: '#1a1a1a',
};

// 深色主题色板
export const DARK_COLORS: ThemeColors = {
  // 文字
  textPrimary: '#f5f5f5',
  textSecondary: '#a0a0a0',
  textTertiary: '#707070',
  textMuted: '#505050',

  // 背景
  bgPrimary: '#1a1a1a',
  bgSecondary: '#141414',
  bgTertiary: '#242424',
  bgHover: '#2a2a2a',
  bgActive: '#333333',

  // 边框
  border: '#333333',
  borderLight: '#2a2a2a',

  // 状态指示
  activeIndicator: '#f5f5f5',
};

// 获取主题颜色
export function getThemeColors(mode: ThemeMode = 'light', customColors?: Partial<ThemeColors>): ThemeColors {
  const baseColors = mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  return customColors ? { ...baseColors, ...customColors } : baseColors;
}

// 生成样式
export function createShellStyles(colors: ThemeColors): Record<string, CSSProperties> {
  return {
    // 根容器
    root: {
      display: 'flex',
      minHeight: '100vh',
      height: '100vh',
      backgroundColor: colors.bgSecondary,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      color: colors.textPrimary,
      overflow: 'hidden',
    },

    // 侧边栏
    sidebar: {
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: colors.bgPrimary,
      borderRight: `1px solid ${colors.border}`,
      transition: 'width 0.2s ease, opacity 0.2s ease',
      overflow: 'hidden',
    },

    sidebarOpen: {
      width: 256,
      opacity: 1,
    },

    sidebarClosed: {
      width: 0,
      opacity: 0,
      borderRight: 'none',
    },

    // 品牌区域
    brandArea: {
      padding: '20px 16px',
      borderBottom: `1px solid ${colors.borderLight}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minWidth: 224,
    },

    brandContent: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },

    brandLogo: {
      width: 36,
      height: 36,
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
      fontSize: 14,
      flexShrink: 0,
    },

    brandText: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },

    brandName: {
      fontSize: 15,
      fontWeight: 600,
      color: colors.textPrimary,
      lineHeight: 1.2,
    },

    brandSubtitle: {
      fontSize: 11,
      color: colors.textTertiary,
      letterSpacing: '0.02em',
    },

    // 折叠按钮
    collapseBtn: {
      width: 28,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      background: 'transparent',
      color: colors.textTertiary,
      cursor: 'pointer',
      borderRadius: 6,
      transition: 'all 0.15s ease',
      flexShrink: 0,
    },

    collapseBtnHover: {
      backgroundColor: colors.bgHover,
      color: colors.textPrimary,
    },

    // 导航区域
    navArea: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px 0',
      minWidth: 224,
    },

    // 分组
    navGroup: {
      marginBottom: 24,
    },

    navGroupTitle: {
      padding: '0 16px',
      marginBottom: 8,
      fontSize: 11,
      fontWeight: 600,
      color: colors.textMuted,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },

    navList: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
    },

    // 导航项
    navItem: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      padding: '8px 16px',
      border: 'none',
      background: 'transparent',
      fontSize: 14,
      color: colors.textSecondary,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    },

    navItemHover: {
      backgroundColor: colors.bgHover,
      color: colors.textPrimary,
    },

    navItemActive: {
      backgroundColor: colors.bgTertiary,
      color: colors.textPrimary,
      fontWeight: 500,
    },

    // 主内容区
    main: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0,
    },

    // 头部区域（可选）
    header: {
      flexShrink: 0,
      padding: '16px 24px',
      backgroundColor: colors.bgPrimary,
      borderBottom: `1px solid ${colors.borderLight}`,
    },

    // 内容区域
    content: {
      flex: 1,
      overflowY: 'auto',
      minHeight: 0,
      padding: '24px 32px',
    },

    // 展开按钮（侧边栏关闭时）
    expandBtn: {
      position: 'fixed',
      top: 20,
      left: 20,
      zIndex: 100,
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgPrimary,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      cursor: 'pointer',
      color: colors.textSecondary,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      transition: 'all 0.15s ease',
    },

    expandBtnHover: {
      backgroundColor: colors.bgHover,
      color: colors.textPrimary,
    },

    // 移动端顶栏
    mobileTopbar: {
      display: 'none', // 默认隐藏，通过媒体查询显示
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      height: 56,
      padding: '0 16px',
      backgroundColor: colors.bgPrimary,
      borderBottom: `1px solid ${colors.border}`,
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    // 移动端遮罩
    mobileOverlay: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 99,
    },

    // 移动端侧边栏
    mobileSidebar: {
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: 280,
      zIndex: 100,
      backgroundColor: colors.bgPrimary,
      boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
      transform: 'translateX(-100%)',
      transition: 'transform 0.3s ease',
    },

    mobileSidebarOpen: {
      transform: 'translateX(0)',
    },
  };
}

// 保持向后兼容 - 默认使用浅色主题
export const SHELL_STYLES = createShellStyles(LIGHT_COLORS);
