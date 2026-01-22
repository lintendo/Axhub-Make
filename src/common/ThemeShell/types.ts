/**
 * ThemeShell 类型定义
 *
 * 去主题化的设计系统展示组件类型
 */

/** 主题模式 */
export type ThemeMode = 'light' | 'dark';

/** 主题颜色配置 */
export interface ThemeColors {
  /** 主要文字色 */
  textPrimary: string;
  /** 次要文字色 */
  textSecondary: string;
  /** 三级文字色 */
  textTertiary: string;
  /** 静音文字色 */
  textMuted: string;
  /** 主背景色 */
  bgPrimary: string;
  /** 次要背景色 */
  bgSecondary: string;
  /** 三级背景色 */
  bgTertiary: string;
  /** 悬浮背景色 */
  bgHover: string;
  /** 激活背景色 */
  bgActive: string;
  /** 边框色 */
  border: string;
  /** 浅边框色 */
  borderLight: string;
  /** 激活指示器色 */
  activeIndicator: string;
}

/** 主题配置 */
export interface ThemeConfig {
  /** 主题模式 */
  mode?: ThemeMode;
  /** 自定义颜色（覆盖默认值） */
  colors?: Partial<ThemeColors>;
}

/** 导航项 */
export interface NavItem {
  /** 唯一标识 */
  id: string;
  /** 显示标签 */
  label: string;
  /** 所属分组 ID */
  groupId: string;
  /** 可选描述 */
  description?: string;
  /** 可选图标（React 节点） */
  icon?: React.ReactNode;
}

/** 导航分组 */
export interface NavGroup {
  /** 分组唯一标识 */
  id: string;
  /** 分组标题 */
  title: string;
  /** 分组排序权重（越小越靠前） */
  order?: number;
}

/** 品牌配置 */
export interface BrandConfig {
  /** 品牌名称 */
  name: string;
  /** 副标题 */
  subtitle?: string;
  /** Logo 图标（React 节点） */
  logo?: React.ReactNode;
  /** Logo 背景色 */
  logoBgColor?: string;
  /** Logo 文字色 */
  logoTextColor?: string;
}

/** 侧边栏配置 */
export interface SidebarConfig {
  /** 默认宽度 */
  width?: number;
  /** 是否默认展开 */
  defaultOpen?: boolean;
  /** 是否允许折叠 */
  collapsible?: boolean;
}

/** ThemeShell 组件属性 */
export interface ThemeShellProps {
  /** 品牌配置 */
  brand?: BrandConfig;
  /** 导航分组列表 */
  groups: NavGroup[];
  /** 导航项列表 */
  items: NavItem[];
  /** 当前激活项 ID */
  activeId: string;
  /** 导航切换回调 */
  onNavigate: (id: string) => void;
  /** 侧边栏配置 */
  sidebar?: SidebarConfig;
  /** 主题配置 */
  theme?: ThemeConfig;
  /** 内容区域 */
  children: React.ReactNode;
  /** 顶部额外内容（如比选面板） */
  header?: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
}
