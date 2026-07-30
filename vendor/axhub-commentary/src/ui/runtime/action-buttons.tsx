import React from 'react';
import { isMobileDevice } from '../../utils/mobile-detect';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Tooltip } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import {
  ACTION_BUTTON_SIZE,
  ACTION_ICON_SIZE,
  ACTION_ICON_STROKE,
  COMPACT_TOOLBAR_HEIGHT,
  EDITOR_CHROME,
} from './theme';
import { resolveRuntimePopupContainer } from './popup-container';
import type {
  AgentToolbarIconButtonProps,
  AgentToolbarShellProps,
  IconActionButtonProps,
  IconActionTone,
  TooltipButtonProps,
} from './types';

const ICON_ACTION_TONE_STYLES: Record<IconActionTone, React.CSSProperties> = {
  neutral: {
    color: EDITOR_CHROME.textPrimary,
  },
  accent: {
    color: EDITOR_CHROME.accent,
    background: 'rgba(0, 143, 93, 0.14)',
  },
  danger: {
    color: EDITOR_CHROME.textDanger,
    background: 'rgba(255, 120, 117, 0.12)',
  },
  dark: {
    color: EDITOR_CHROME.textPrimary,
  },
};

function SvgIcon(props: {
  children: React.ReactNode;
  size?: number;
  strokeWidth?: number;
}): React.ReactElement {
  const { children, size = ACTION_ICON_SIZE, strokeWidth = ACTION_ICON_STROKE } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <g
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

export function AgentSparkleIcon(): React.ReactElement {
  return (
    <SvgIcon>
      <path d="M8 2.5l1.4 4.1L13.5 8l-4.1 1.4L8 13.5 6.6 9.4 2.5 8l4.1-1.4L8 2.5z" />
    </SvgIcon>
  );
}

export function CloseToolIcon(): React.ReactElement {
  return (
    <span role="img" aria-hidden="true" className="anticon anticon-close">
      <SvgIcon>
        <path d="M4.5 4.5l7 7" />
        <path d="M11.5 4.5l-7 7" />
      </SvgIcon>
    </span>
  );
}

export function TooltipButton(props: TooltipButtonProps): React.ReactElement {
  const { title, children, disabled } = props;
  return (
    <Tooltip title={title} getPopupContainer={resolveRuntimePopupContainer}>
      <span style={{ display: 'inline-flex' }}>{React.cloneElement(children, { disabled })}</span>
    </Tooltip>
  );
}

export function IconActionButton(props: IconActionButtonProps): React.ReactElement {
  const { title, icon, onClick, disabled, loading, tone = 'neutral', style } = props;
  const [hovered, setHovered] = React.useState(false);
  const toneStyle = ICON_ACTION_TONE_STYLES[tone];
  const mobile = isMobileDevice();
  const btnSize = mobile ? Math.max(ACTION_BUTTON_SIZE, 36) : ACTION_BUTTON_SIZE;

  return (
    <TooltipButton title={title} disabled={disabled}>
      <Button
        size="small"
        type="text"
        aria-label={title}
        icon={loading ? <LoadingOutlined spin /> : icon}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        danger={tone === 'danger'}
        style={{
          width: btnSize,
          minWidth: btnSize,
          height: btnSize,
          padding: 0,
          fontSize: ACTION_ICON_SIZE,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          boxShadow: 'none',
          touchAction: 'manipulation',
          color: disabled
            ? EDITOR_CHROME.textMuted
            : (toneStyle.color ?? EDITOR_CHROME.textPrimary),
          background: disabled
            ? 'transparent'
            : (hovered
              ? (toneStyle.background ?? EDITOR_CHROME.hoverSubtle)
              : 'transparent'),
          transition: 'background-color 220ms ease, color 220ms ease, transform 220ms ease',
          ...style,
        }}
      />
    </TooltipButton>
  );
}

export function AgentToolbarIconButton(props: AgentToolbarIconButtonProps): React.ReactElement {
  const { title, icon, awake, active = false, disabled = false, loading = false, onClick, ariaLabel } = props;
  const [hovered, setHovered] = React.useState(false);
  const mobile = isMobileDevice();
  const btnSize = mobile ? 36 : 32;
  const defaultColor = disabled
    ? awake
      ? EDITOR_CHROME.textMuted
      : EDITOR_CHROME.textSleepingStrong
    : awake
      ? EDITOR_CHROME.textSecondary
      : EDITOR_CHROME.textSleepingStrong;
  const color = active && !disabled ? EDITOR_CHROME.accent : defaultColor;
  const background = hovered && !disabled && !active
    ? awake
      ? EDITOR_CHROME.hoverSubtle
      : EDITOR_CHROME.hoverGhost
    : 'transparent';
  const hoverColor = active ? EDITOR_CHROME.accentActive : EDITOR_CHROME.textPrimary;

  return (
    <TooltipButton title={title} disabled={disabled}>
      <button
        type="button"
        aria-label={ariaLabel ?? title}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: btnSize,
          minWidth: btnSize,
          height: btnSize,
          padding: 0,
          border: 'none',
          borderRadius: 999,
          background,
          color: hovered && !disabled ? hoverColor : color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          touchAction: 'manipulation',
          transition: 'background-color 220ms ease, color 220ms ease, transform 220ms ease',
          transform: hovered && !disabled ? 'translateY(-0.5px)' : 'translateY(0)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? <LoadingOutlined spin /> : icon}
        </span>
      </button>
    </TooltipButton>
  );
}

export function AgentToolbarShell(props: AgentToolbarShellProps): React.ReactElement {
  const {
    awake,
    connected = awake,
    children,
    dragHandleRef,
    fullWidth = false,
    style,
  } = props;
  const shellBorderColor = EDITOR_CHROME.toolbarShellBorder;
  const shellSurfaceShadow = EDITOR_CHROME.toolbarShellInset;
  const shellShadow = awake ? EDITOR_CHROME.toolbarGlow : EDITOR_CHROME.shadowCompact;

  return (
    <div
      className="we-runtime-prop-panel__drag-handle"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        height: COMPACT_TOOLBAR_HEIGHT,
        boxSizing: 'border-box',
        borderRadius: 999,
        padding: 1,
        overflow: 'visible',
        boxShadow: shellShadow,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        transition: 'box-shadow 260ms ease, transform 220ms ease',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: shellBorderColor,
        }}
      />
      <AnimatePresence>
        {connected ? (
          <motion.div
            key="toolbar-ring"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              overflow: 'hidden',
              borderRadius: 999,
            }}
          >
            <div
              className="we-runtime-toolbar__spinner"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg 320deg, rgba(0, 143, 93, 0.4) 360deg)',
                animationDuration: '6s',
              }}
            />
            <div
              className="we-runtime-toolbar__spinner"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg 320deg, rgba(0, 143, 93, 0.18) 360deg)',
                animationDuration: '8s',
                animationDirection: 'reverse',
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: fullWidth ? '100%' : undefined,
          height: '100%',
          minHeight: '100%',
          boxSizing: 'border-box',
          borderRadius: 999,
          padding: '4px 6px',
          background: EDITOR_CHROME.surface,
          boxShadow: shellSurfaceShadow,
          minWidth: fullWidth ? 0 : 'unset',
        }}
      >
        <div
          ref={dragHandleRef}
          className="we-runtime-toolbar__drag-grip data-fullscreen-prevent-event-capture"
          data-we-toolbar-drag-grip="true"
          aria-hidden="true"
          title="拖动工具栏"
          style={{
            color: EDITOR_CHROME.textMuted,
          }}
        >
          <svg
            width="8"
            height="18"
            viewBox="0 0 8 18"
            fill="currentColor"
            focusable="false"
            style={{ display: 'block', pointerEvents: 'none' }}
          >
            <circle cx="2" cy="4" r="1.25" />
            <circle cx="6" cy="4" r="1.25" />
            <circle cx="2" cy="9" r="1.25" />
            <circle cx="6" cy="9" r="1.25" />
            <circle cx="2" cy="14" r="1.25" />
            <circle cx="6" cy="14" r="1.25" />
          </svg>
        </div>
        {children}
      </div>
    </div>
  );
}
