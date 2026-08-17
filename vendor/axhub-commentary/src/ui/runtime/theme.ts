import type React from 'react';
import type { ThemeConfig } from 'antd';

export const ANCHOR_GAP_PX = 12;
export const SAFE_PADDING_PX = 12;
export const PAGE_CONFIG_PANEL_MIN_WIDTH = 232;
export const PAGE_CONFIG_PANEL_MAX_WIDTH = 360;
export const PAGE_CONFIG_PANEL_WIDTH = 248;
export const PROPERTY_PANEL_MIN_WIDTH = PAGE_CONFIG_PANEL_MIN_WIDTH;
export const PROPERTY_PANEL_MAX_WIDTH = PAGE_CONFIG_PANEL_MAX_WIDTH;
export const PROPERTY_PANEL_WIDTH = PAGE_CONFIG_PANEL_WIDTH;
export const PROPERTY_PANEL_RADIUS = 20;
export const PROPERTY_PANEL_TOP = 24;
export const PROPERTY_PANEL_RIGHT = 16;
export const TOOLBAR_BOTTOM = 24;
export const PROPERTY_PANEL_EXPANDED_HEIGHT_PX = PROPERTY_PANEL_TOP + TOOLBAR_BOTTOM;
export const PROPERTY_PANEL_EXPANDED_HEIGHT = `calc(100vh - ${PROPERTY_PANEL_TOP + TOOLBAR_BOTTOM}px)`;
export const PROMPT_CARD_WIDTH = 280;
export const PROMPT_CARD_ESTIMATED_HEIGHT = 104;
export const TEXT_INPUT_PLACEHOLDER = '编辑当前文本';
export const NOTE_PLACEHOLDER = '填写修改需求，按 ESC 或 Enter 可保存';
export const FLOATING_CLAMP_MARGIN = 16;
export const POPUP_LAYER_Z_INDEX = 10040;
export const HEADER_HORIZONTAL_PADDING = 10;
export const HEADER_VERTICAL_PADDING = 8;
export const HEADER_CONTROL_SIZE = 28;
export const COMPACT_TOOL_SIZE = 44;
export const COMPACT_TOOLBAR_WIDTH = 251;
export const COMPACT_TOOLBAR_HEIGHT = 44;
export const AGENT_BRAND_BUTTON_SIZE = 36;
export const WEB_EDITOR_POPUP_ROOT_ATTR = 'data-we-popup-root';
export const ACTION_ICON_SIZE = 15;
export const ACTION_ICON_STROKE = 1.8;
export const ACTION_BUTTON_SIZE = 28;
export const WEB_EDITOR_V2_PASTE_DEBUG_KEY = '__WEB_EDITOR_V2_PASTE_DEBUG__';
export const BRAND_PRIMARY = '#008F5D';
export const BRAND_PRIMARY_HOVER = '#00A36A';
export const BRAND_PRIMARY_ACTIVE = '#007A4F';
export const BRAND_PRIMARY_SOFT = 'rgba(0, 143, 93, 0.16)';
export const BRAND_PRIMARY_RING = 'rgba(0, 143, 93, 0.28)';
export const BRAND_PRIMARY_SHADOW = 'rgba(0, 143, 93, 0.28)';
export const BRAND_ACCENT = '#00D68F';
export const SLEEPING_ICON = '#A1A1AA';
export const SLEEPING_ICON_STRONG = '#71717A';
export const WEB_EDITOR_PARENT_PASTE_BRIDGE_CLEANUP_KEY = '__webEditorV2ParentPasteBridgeCleanup__';

export type EditorThemeMode = 'light' | 'dark';

export type EditorChromeValues = {
  accent: string;
  accentBright: string;
  accentHover: string;
  accentActive: string;
  accentSoft: string;
  accentRing: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  surfaceInteractive: string;
  surfaceOverlay: string;
  border: string;
  borderStrong: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textSleeping: string;
  textSleepingStrong: string;
  textDanger: string;
  hoverSubtle: string;
  hoverGhost: string;
  toolbarShellBorder: string;
  toolbarShellInset: string;
  toolbarGlow: string;
  shadow: string;
  shadowCompact: string;
  overlayCloseBackground: string;
};

const LIGHT_EDITOR_CHROME: EditorChromeValues = {
  accent: BRAND_PRIMARY,
  accentBright: BRAND_ACCENT,
  accentHover: BRAND_PRIMARY_HOVER,
  accentActive: BRAND_PRIMARY_ACTIVE,
  accentSoft: BRAND_PRIMARY_SOFT,
  accentRing: BRAND_PRIMARY_RING,
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#FAFAFA',
  surfaceInteractive: '#F4F4F5',
  surfaceOverlay: 'rgba(255, 255, 255, 0.96)',
  border: 'rgba(39, 39, 42, 0.10)',
  borderStrong: 'rgba(39, 39, 42, 0.16)',
  divider: 'rgba(228, 228, 231, 0.95)',
  textPrimary: '#18181B',
  textSecondary: '#3F3F46',
  textMuted: '#A1A1AA',
  textSleeping: '#A1A1AA',
  textSleepingStrong: '#71717A',
  textDanger: '#DC2626',
  hoverSubtle: 'rgba(244, 244, 245, 1)',
  hoverGhost: 'rgba(15, 23, 42, 0.035)',
  toolbarShellBorder: 'rgba(228, 228, 231, 0.80)',
  toolbarShellInset: 'inset 0 1px 0 rgba(255, 255, 255, 0.88)',
  toolbarGlow: '0 0 20px -5px rgba(0, 143, 93, 0.20)',
  shadow: '0 24px 60px rgba(15, 23, 42, 0.14), 0 8px 24px rgba(15, 23, 42, 0.08)',
  shadowCompact: '0 10px 28px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06)',
  overlayCloseBackground: 'rgba(255, 255, 255, 0.94)',
};

const DARK_EDITOR_CHROME: EditorChromeValues = {
  accent: BRAND_PRIMARY,
  accentBright: BRAND_ACCENT,
  accentHover: BRAND_PRIMARY_HOVER,
  accentActive: BRAND_PRIMARY_ACTIVE,
  accentSoft: BRAND_PRIMARY_SOFT,
  accentRing: BRAND_PRIMARY_RING,
  surface: '#121212',
  surfaceElevated: '#161616',
  surfaceMuted: '#18181B',
  surfaceInteractive: '#27272A',
  surfaceOverlay: 'rgba(18, 18, 18, 0.96)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
  divider: 'rgba(39, 39, 42, 0.95)',
  textPrimary: 'rgba(255, 255, 255, 0.94)',
  textSecondary: '#D4D4D8',
  textMuted: '#A1A1AA',
  textSleeping: SLEEPING_ICON,
  textSleepingStrong: SLEEPING_ICON_STRONG,
  textDanger: '#ff7875',
  hoverSubtle: 'rgba(39, 39, 42, 0.80)',
  hoverGhost: 'rgba(255, 255, 255, 0.04)',
  toolbarShellBorder: 'rgba(39, 39, 42, 0.82)',
  toolbarShellInset: 'inset 0 1px 0 rgba(255, 255, 255, 0.02)',
  toolbarGlow: '0 0 20px -5px rgba(0, 143, 93, 0.15)',
  shadow: '0 18px 48px rgba(0, 0, 0, 0.42), 0 4px 18px rgba(0, 0, 0, 0.28)',
  shadowCompact: '0 10px 28px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.20)',
  overlayCloseBackground: 'rgba(18, 18, 18, 0.92)',
} as const;

function cssVar(name: string): string {
  return `var(${name})`;
}

export const EDITOR_CHROME = {
  accent: cssVar('--we-editor-accent'),
  accentBright: cssVar('--we-editor-accent-bright'),
  accentHover: cssVar('--we-editor-accent-hover'),
  accentActive: cssVar('--we-editor-accent-active'),
  accentSoft: cssVar('--we-editor-accent-soft'),
  accentRing: cssVar('--we-editor-accent-ring'),
  surface: cssVar('--we-editor-surface'),
  surfaceElevated: cssVar('--we-editor-surface-elevated'),
  surfaceMuted: cssVar('--we-editor-surface-muted'),
  surfaceInteractive: cssVar('--we-editor-surface-interactive'),
  surfaceOverlay: cssVar('--we-editor-surface-overlay'),
  border: cssVar('--we-editor-border'),
  borderStrong: cssVar('--we-editor-border-strong'),
  divider: cssVar('--we-editor-divider'),
  textPrimary: cssVar('--we-editor-text-primary'),
  textSecondary: cssVar('--we-editor-text-secondary'),
  textMuted: cssVar('--we-editor-text-muted'),
  textSleeping: cssVar('--we-editor-text-sleeping'),
  textSleepingStrong: cssVar('--we-editor-text-sleeping-strong'),
  textDanger: cssVar('--we-editor-text-danger'),
  hoverSubtle: cssVar('--we-editor-hover-subtle'),
  hoverGhost: cssVar('--we-editor-hover-ghost'),
  toolbarShellBorder: cssVar('--we-editor-toolbar-shell-border'),
  toolbarShellInset: cssVar('--we-editor-toolbar-shell-inset'),
  toolbarGlow: cssVar('--we-editor-toolbar-glow'),
  shadow: cssVar('--we-editor-shadow'),
  shadowCompact: cssVar('--we-editor-shadow-compact'),
  overlayCloseBackground: cssVar('--we-editor-overlay-close-background'),
} as const;

export function getEditorChromeValues(mode: EditorThemeMode): EditorChromeValues {
  return mode === 'dark' ? DARK_EDITOR_CHROME : LIGHT_EDITOR_CHROME;
}

export function createEditorChromeCssVars(mode: EditorThemeMode): React.CSSProperties {
  const chrome = getEditorChromeValues(mode);
  return {
    ['--we-editor-accent' as string]: chrome.accent,
    ['--we-editor-accent-bright' as string]: chrome.accentBright,
    ['--we-editor-accent-hover' as string]: chrome.accentHover,
    ['--we-editor-accent-active' as string]: chrome.accentActive,
    ['--we-editor-accent-soft' as string]: chrome.accentSoft,
    ['--we-editor-accent-ring' as string]: chrome.accentRing,
    ['--we-editor-surface' as string]: chrome.surface,
    ['--we-editor-surface-elevated' as string]: chrome.surfaceElevated,
    ['--we-editor-surface-muted' as string]: chrome.surfaceMuted,
    ['--we-editor-surface-interactive' as string]: chrome.surfaceInteractive,
    ['--we-editor-surface-overlay' as string]: chrome.surfaceOverlay,
    ['--we-editor-border' as string]: chrome.border,
    ['--we-editor-border-strong' as string]: chrome.borderStrong,
    ['--we-editor-divider' as string]: chrome.divider,
    ['--we-editor-text-primary' as string]: chrome.textPrimary,
    ['--we-editor-text-secondary' as string]: chrome.textSecondary,
    ['--we-editor-text-muted' as string]: chrome.textMuted,
    ['--we-editor-text-sleeping' as string]: chrome.textSleeping,
    ['--we-editor-text-sleeping-strong' as string]: chrome.textSleepingStrong,
    ['--we-editor-text-danger' as string]: chrome.textDanger,
    ['--we-editor-hover-subtle' as string]: chrome.hoverSubtle,
    ['--we-editor-hover-ghost' as string]: chrome.hoverGhost,
    ['--we-editor-toolbar-shell-border' as string]: chrome.toolbarShellBorder,
    ['--we-editor-toolbar-shell-inset' as string]: chrome.toolbarShellInset,
    ['--we-editor-toolbar-glow' as string]: chrome.toolbarGlow,
    ['--we-editor-shadow' as string]: chrome.shadow,
    ['--we-editor-shadow-compact' as string]: chrome.shadowCompact,
    ['--we-editor-overlay-close-background' as string]: chrome.overlayCloseBackground,
  };
}

export function createRuntimeAntdTheme(mode: EditorThemeMode): ThemeConfig {
  const chrome = getEditorChromeValues(mode);
  return {
    token: {
      colorPrimary: chrome.accent,
      colorInfo: chrome.accent,
      colorSuccess: chrome.accent,
      colorLink: chrome.accent,
      colorPrimaryHover: chrome.accentHover,
      colorPrimaryActive: chrome.accentActive,
      colorPrimaryBorder: chrome.accent,
      colorPrimaryBorderHover: chrome.accentHover,
      colorPrimaryBg: chrome.accentSoft,
      colorPrimaryBgHover: 'rgba(0, 143, 93, 0.22)',
      borderRadius: 8,
      fontSize: 11,
      fontSizeSM: 11,
      colorBgBase: chrome.surface,
      colorBgContainer: chrome.surfaceElevated,
      colorBgElevated: chrome.surfaceElevated,
      colorFill: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)',
      colorFillSecondary: chrome.surfaceMuted,
      colorFillTertiary: chrome.surfaceInteractive,
      colorText: chrome.textPrimary,
      colorTextSecondary: chrome.textSecondary,
      colorTextTertiary: chrome.textMuted,
      colorBorder: chrome.border,
      colorBorderSecondary: chrome.borderStrong,
      colorTextPlaceholder: chrome.textMuted,
      colorSplit: chrome.border,
      boxShadowSecondary: chrome.shadow,
      colorIcon: chrome.textSecondary,
      colorIconHover: chrome.textPrimary,
      controlOutline: chrome.accentSoft,
      controlOutlineWidth: 2,
      controlHeight: 32,
      controlHeightSM: 28,
    },
    components: {
      Button: {
        borderRadius: 12,
        paddingInlineSM: 8,
        controlHeightSM: 28,
        defaultShadow: 'none',
        primaryShadow: 'none',
        dangerShadow: 'none',
        textTextColor: chrome.textPrimary,
        textHoverBg: chrome.hoverSubtle,
        defaultBg: chrome.surfaceMuted,
        defaultColor: chrome.textPrimary,
        defaultBorderColor: chrome.border,
        defaultHoverBg: chrome.surfaceInteractive,
        defaultHoverColor: chrome.textPrimary,
        defaultHoverBorderColor: chrome.borderStrong,
      },
      Collapse: {
        contentBg: 'transparent',
        headerBg: 'transparent',
        borderlessContentBg: 'transparent',
        contentPadding: '0 0 8px',
        borderlessContentPadding: '0 0 8px',
      },
      Input: {
        colorBgContainer: chrome.surfaceMuted,
        activeBg: chrome.surfaceInteractive,
        hoverBg: chrome.surfaceInteractive,
        activeBorderColor: chrome.accent,
        hoverBorderColor: chrome.borderStrong,
        activeShadow: `0 0 0 2px ${chrome.accentSoft}`,
      },
      InputNumber: {
        colorBgContainer: chrome.surfaceMuted,
        activeBg: chrome.surfaceInteractive,
        hoverBg: chrome.surfaceInteractive,
        activeBorderColor: chrome.accent,
        hoverBorderColor: chrome.borderStrong,
        activeShadow: `0 0 0 2px ${chrome.accentSoft}`,
      },
      Select: {
        optionSelectedBg: chrome.accentSoft,
        optionActiveBg: chrome.hoverSubtle,
        selectorBg: chrome.surfaceMuted,
        activeBorderColor: chrome.accent,
        hoverBorderColor: chrome.borderStrong,
      },
      Slider: {
        colorPrimary: chrome.accent,
        handleSize: 8,
        railBg: mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)',
        railHoverBg: mode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(15, 23, 42, 0.18)',
        trackBg: chrome.accent,
        trackHoverBg: chrome.accentHover,
      },
      ColorPicker: {
        colorPrimary: chrome.accent,
      },
      Dropdown: {
        colorBgElevated: chrome.surfaceElevated,
        colorText: chrome.textPrimary,
        colorTextDescription: chrome.textSecondary,
        controlItemBgHover: chrome.hoverSubtle,
        controlItemBgActive: chrome.accentSoft,
        borderRadiusLG: 16,
      },
      Modal: {
        contentBg: chrome.surfaceElevated,
        headerBg: chrome.surfaceElevated,
        titleColor: chrome.textPrimary,
        titleFontSize: 14,
        borderRadiusLG: 18,
      },
      Tooltip: {
        colorBgSpotlight: mode === 'dark' ? '#050608' : '#0F172A',
        colorTextLightSolid: '#FFFFFF',
      },
      Popover: {
        colorBgElevated: chrome.surfaceElevated,
        colorText: chrome.textPrimary,
      },
    },
  };
}
