import { EDITOR_CHROME, POPUP_LAYER_Z_INDEX, WEB_EDITOR_POPUP_ROOT_ATTR } from '../theme';

export const WEB_EDITOR_POPUP_ROOT_STYLES = `
  @keyframes we-runtime-agent-task-scan {
    0% {
      top: calc(-1 * var(--we-runtime-agent-task-scan-size, 88px));
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    100% {
      top: 100%;
      opacity: 0;
    }
  }

  [data-overlayscrollbars-initialize]:not([data-overlayscrollbars-viewport]),
  [data-overlayscrollbars-viewport~="scrollbarHidden"],
  html[data-overlayscrollbars-viewport~="scrollbarHidden"] > body {
    scrollbar-width: none !important;
  }

  [data-overlayscrollbars-initialize]:not([data-overlayscrollbars-viewport])::-webkit-scrollbar,
  [data-overlayscrollbars-initialize]:not([data-overlayscrollbars-viewport])::-webkit-scrollbar-corner,
  [data-overlayscrollbars-viewport~="scrollbarHidden"]::-webkit-scrollbar,
  [data-overlayscrollbars-viewport~="scrollbarHidden"]::-webkit-scrollbar-corner,
  html[data-overlayscrollbars-viewport~="scrollbarHidden"] > body::-webkit-scrollbar,
  html[data-overlayscrollbars-viewport~="scrollbarHidden"] > body::-webkit-scrollbar-corner {
    -webkit-appearance: none !important;
    appearance: none !important;
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }

  [data-overlayscrollbars-initialize]:not([data-overlayscrollbars]):not(html):not(body) {
    overflow: auto;
  }

  [data-overlayscrollbars] {
    position: relative;
  }

  [data-overlayscrollbars~="host"],
  [data-overlayscrollbars-padding] {
    display: flex;
    align-items: stretch !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    overflow: hidden !important;
    scroll-behavior: auto !important;
  }

  [data-overlayscrollbars-padding],
  [data-overlayscrollbars-viewport]:not([data-overlayscrollbars]) {
    box-sizing: inherit;
    position: relative;
    flex: auto;
    width: 100%;
    min-width: 0;
    height: auto;
    padding: 0;
    margin: 0;
    border: none;
    z-index: 0;
  }

  [data-overlayscrollbars-viewport] {
    --os-viewport-overflow-x: hidden;
    --os-viewport-overflow-y: hidden;
    overflow-x: var(--os-viewport-overflow-x);
    overflow-y: var(--os-viewport-overflow-y);
  }

  [data-overlayscrollbars-viewport~="overflowXScroll"] {
    --os-viewport-overflow-x: scroll;
  }

  [data-overlayscrollbars-viewport~="overflowYScroll"] {
    --os-viewport-overflow-y: scroll;
  }

  [data-overlayscrollbars-content] {
    box-sizing: inherit;
  }

  .os-scrollbar {
    --os-size: 0;
    --os-padding-perpendicular: 0;
    --os-padding-axis: 0;
    --os-track-border-radius: 0;
    --os-track-bg: none;
    --os-track-bg-hover: none;
    --os-track-bg-active: none;
    --os-track-border: none;
    --os-track-border-hover: none;
    --os-track-border-active: none;
    --os-handle-border-radius: 0;
    --os-handle-bg: none;
    --os-handle-bg-hover: none;
    --os-handle-bg-active: none;
    --os-handle-border: none;
    --os-handle-border-hover: none;
    --os-handle-border-active: none;
    box-sizing: border-box;
    contain: size layout style;
    pointer-events: none;
    position: absolute;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.16s ease, visibility 0.16s ease;
  }

  .os-scrollbar-track,
  .os-scrollbar-handle {
    box-sizing: border-box;
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .os-scrollbar-track {
    padding: 0 !important;
    border: none !important;
  }

  .os-scrollbar.os-scrollbar-track-interactive .os-scrollbar-track,
  .os-scrollbar.os-scrollbar-handle-interactive .os-scrollbar-handle {
    pointer-events: auto;
    touch-action: none;
  }

  .os-scrollbar-horizontal {
    left: 0;
    bottom: 0;
  }

  .os-scrollbar-vertical {
    top: 0;
    right: 0;
  }

  .os-scrollbar-visible,
  .os-scrollbar-interaction.os-scrollbar-visible {
    opacity: 1;
    visibility: visible;
  }

  .os-scrollbar-auto-hide.os-scrollbar-auto-hide-hidden {
    opacity: 0;
    visibility: hidden;
  }

  .os-scrollbar-unusable,
  .os-scrollbar-unusable *,
  .os-scrollbar-wheel,
  .os-scrollbar-wheel * {
    pointer-events: none !important;
  }

  .os-scrollbar-unusable .os-scrollbar-handle {
    opacity: 0 !important;
    transition: none !important;
  }

  .os-scrollbar-horizontal .os-scrollbar-handle {
    left: calc(var(--os-scroll-percent, 0) * 100%);
    bottom: 0;
    width: calc(var(--os-viewport-percent, 0) * 100%);
    transform: translateX(calc(var(--os-scroll-percent, 0) * -100%));
  }

  .os-scrollbar-vertical .os-scrollbar-handle {
    top: calc(var(--os-scroll-percent, 0) * 100%);
    right: 0;
    height: calc(var(--os-viewport-percent, 0) * 100%);
    transform: translateY(calc(var(--os-scroll-percent, 0) * -100%));
  }

  .we-runtime-prompt-card__scroll-area {
    max-width: 100%;
    min-height: 0;
  }

  .we-runtime-prompt-card__scroll-content {
    padding: 8px 0 0;
  }

  .we-runtime-prompt-card__scroll-area [data-overlayscrollbars-viewport] {
    overscroll-behavior: contain;
  }

  .we-runtime-prompt-card__group-divider {
    width: 100%;
    height: 1px;
    background: color-mix(in srgb, ${EDITOR_CHROME.divider} 78%, transparent);
  }

  .we-runtime-agent-task__scanner {
    position: absolute;
    left: 0;
    right: 0;
    height: var(--we-runtime-agent-task-scan-size, 88px);
    top: calc(-1 * var(--we-runtime-agent-task-scan-size, 88px));
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--we-runtime-agent-task-accent) 14%, transparent) 38%,
      color-mix(in srgb, var(--we-runtime-agent-task-accent) 20%, transparent) 50%,
      color-mix(in srgb, var(--we-runtime-agent-task-accent) 14%, transparent) 62%,
      transparent 100%
    );
    animation: we-runtime-agent-task-scan 2.8s linear infinite;
  }

  .we-runtime-agent-task__scanner::after {
    content: "";
    width: 100%;
    height: 1px;
    background: color-mix(in srgb, var(--we-runtime-agent-task-accent) 72%, white);
    box-shadow: 0 0 14px color-mix(in srgb, var(--we-runtime-agent-task-accent) 64%, transparent);
  }

  .we-runtime-overlay-scrollbars {
    --os-size: 8px;
    --os-padding-perpendicular: 2px;
    --os-padding-axis: 2px;
    --os-track-bg: transparent;
    --os-track-bg-hover: transparent;
    --os-track-bg-active: transparent;
    --os-track-border: none;
    --os-track-border-hover: none;
    --os-track-border-active: none;
    --os-handle-border-radius: 999px;
    --os-handle-bg: color-mix(in srgb, ${EDITOR_CHROME.textMuted} 26%, transparent);
    --os-handle-bg-hover: color-mix(in srgb, ${EDITOR_CHROME.textSecondary} 34%, transparent);
    --os-handle-bg-active: color-mix(in srgb, ${EDITOR_CHROME.textPrimary} 38%, transparent);
  }

  .we-runtime-overlay-scrollbars.os-scrollbar {
    z-index: 1;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: ${POPUP_LAYER_Z_INDEX + 20};
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] > * {
    pointer-events: auto;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-tooltip,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-popover,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-popconfirm,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-color-picker-dropdown {
    z-index: ${POPUP_LAYER_Z_INDEX + 20} !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-select-dropdown,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-ai-execution-provider-dropdown {
    z-index: ${POPUP_LAYER_Z_INDEX + 40} !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-popover .ant-popover-inner,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-popconfirm .ant-popover-inner {
    box-shadow: ${EDITOR_CHROME.shadowCompact} !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-dark-mode-button.ant-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card {
    --we-runtime-settings-control-width: 120px;
    width: min(264px, calc(100vw - 32px));
    overflow: visible;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__header {
    display: flex;
    min-height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 2px;
    padding: 0 4px 6px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__title {
    color: ${EDITOR_CHROME.textPrimary};
    font-size: 15px;
    font-weight: 700;
    line-height: 22px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__list,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution {
    display: flex;
    flex-direction: column;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__list {
    gap: 2px;
    max-height: none;
    overflow: visible;
    scrollbar-width: none;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__list::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution {
    gap: 6px;
    width: 100%;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__row,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--we-runtime-settings-control-width);
    align-items: center;
    column-gap: 12px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__row {
    min-height: 36px;
    padding: 2px 6px;
    border-radius: 8px;
    cursor: default;
    transition: background-color 160ms ease, color 160ms ease;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__row--full {
    display: block;
    min-height: 0;
    margin: 0;
    padding: 4px 6px 6px;
    border-radius: 8px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__row--compact-control {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__row--action,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-row--action {
    cursor: pointer;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__row--action:hover {
    background: ${EDITOR_CHROME.hoverSubtle};
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-row {
    min-height: 30px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-row--action {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-row--action:hover .we-runtime-settings-card__value {
    color: ${EDITOR_CHROME.textPrimary};
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__label {
    min-width: 0;
    color: ${EDITOR_CHROME.textPrimary};
    font-size: 14px;
    line-height: 20px;
    white-space: nowrap;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__skill-label {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__recommended-badge {
    display: inline-flex;
    height: 18px;
    flex: 0 0 auto;
    align-items: center;
    padding: 0 5px;
    border: 1px solid ${EDITOR_CHROME.accentRing};
    border-radius: 4px;
    background: ${EDITOR_CHROME.accentSoft};
    color: ${EDITOR_CHROME.accent};
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__install-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    min-width: 0;
    height: 24px;
    padding: 0 2px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: ${EDITOR_CHROME.accent} !important;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    cursor: pointer;
    text-decoration: none;
    text-underline-offset: 3px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__install-button:hover {
    background: transparent;
    color: ${EDITOR_CHROME.accent} !important;
    text-decoration: underline;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__install-button:focus-visible {
    outline: 2px solid ${EDITOR_CHROME.accentRing};
    outline-offset: 2px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__full-control,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-control {
    min-width: 0;
    width: 100%;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-control .ant-select,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-control .ant-input-number,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__execution-control .ant-input-affix-wrapper {
    width: 100%;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__workspace-input input {
    text-overflow: ellipsis;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__row-control,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__value {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
    justify-self: stretch;
    gap: 6px;
    color: ${EDITOR_CHROME.textSecondary};
    font-size: 13px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__workspace-value {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__workspace-value-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-card__workspace-value > .anticon {
    flex: 0 0 auto;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-dark-mode-button .anticon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-settings-dark-mode-button .anticon svg {
    display: block;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-html-file-save-dropdown .ant-dropdown-menu {
    min-width: 176px;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-item,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-submenu-title,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-title-content,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-item-icon,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-submenu-arrow,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-item a {
    color: ${EDITOR_CHROME.textPrimary} !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu:not(.ant-dropdown-menu-submenu-popup),
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown .ant-dropdown-menu:not(.ant-dropdown-menu-submenu-popup) {
    background: ${EDITOR_CHROME.surfaceElevated} !important;
    border: 1px solid ${EDITOR_CHROME.border} !important;
    box-shadow: ${EDITOR_CHROME.shadowCompact} !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-item,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-submenu-title {
    border-radius: 12px !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-item-disabled,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .ant-dropdown-menu-item-disabled .ant-dropdown-menu-title-content {
    color: ${EDITOR_CHROME.textMuted} !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-agent-menu-submenu-popup {
    padding: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-agent-menu-submenu-popup::before,
  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-agent-menu-submenu-popup::after {
    display: none !important;
  }

  [${WEB_EDITOR_POPUP_ROOT_ATTR}="true"] .we-runtime-agent-menu-submenu-popup .ant-dropdown-menu {
    margin: 0 !important;
  }
`;
