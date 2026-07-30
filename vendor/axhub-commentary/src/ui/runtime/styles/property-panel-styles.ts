import type React from 'react';
import {
  EDITOR_CHROME,
  PAGE_CONFIG_PANEL_MAX_WIDTH,
  PAGE_CONFIG_PANEL_MIN_WIDTH,
  PAGE_CONFIG_PANEL_WIDTH,
  PROPERTY_PANEL_RIGHT,
  PROPERTY_PANEL_RADIUS,
  PROPERTY_PANEL_TOP,
  PROPERTY_PANEL_WIDTH,
} from '../theme';

export const panelContainerStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 10020,
};

export const panelStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 10008,
  top: PROPERTY_PANEL_TOP,
  right: PROPERTY_PANEL_RIGHT,
  width: PROPERTY_PANEL_WIDTH,
  maxWidth: 'calc(100vw - 32px)',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: PROPERTY_PANEL_RADIUS,
  background: EDITOR_CHROME.surface,
  border: `1px solid ${EDITOR_CHROME.border}`,
  boxShadow: EDITOR_CHROME.shadow,
  pointerEvents: 'auto',
  overflow: 'hidden',
};

export const panelBodyStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '0 10px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
};

export const pageConfigPanelBodyStyle: React.CSSProperties = {
  position: 'relative',
  flex: '0 1 auto',
  minHeight: 0,
  maxHeight: 'min(52vh, 420px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '0 10px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
};

export const PROPERTY_PANEL_LOCAL_STYLES = `
  @keyframes we-runtime-agent-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

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

  .we-runtime-prop-panel__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: ${EDITOR_CHROME.textPrimary};
  }

  .we-runtime-page-config-panel {
    display: flex;
    flex-direction: column;
    width: ${PAGE_CONFIG_PANEL_WIDTH}px;
    min-width: ${PAGE_CONFIG_PANEL_MIN_WIDTH}px;
    max-width: min(${PAGE_CONFIG_PANEL_MAX_WIDTH}px, calc(100vw - 32px));
    max-height: min(52vh, 420px);
    border-radius: 16px;
    background: ${EDITOR_CHROME.surfaceOverlay};
    border: 1px solid ${EDITOR_CHROME.border};
    box-shadow: ${EDITOR_CHROME.shadowCompact};
    overflow: hidden;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .we-runtime-page-config-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px 7px;
    border-bottom: 1px solid ${EDITOR_CHROME.divider};
  }

  .we-runtime-page-config-panel__body {
    max-height: min(52vh, 420px);
  }

  .we-runtime-config-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    font-size: 12px;
  }

  .we-runtime-config-panel__attr-component {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin: 3px 0;
  }

  .we-runtime-config-panel__attr-component[data-multiline="true"] {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .we-runtime-config-panel__attr-component[data-multiline="true"] .we-runtime-config-panel__attr-label {
    flex: 0 0 auto;
    width: 100%;
  }

  .we-runtime-config-panel__attr-label {
    display: flex;
    align-items: center;
    flex: 1 1 88px;
    min-width: 88px;
    color: ${EDITOR_CHROME.textSecondary};
    font-size: 12px;
  }

  .we-runtime-config-panel__label-main {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
  }

  .we-runtime-config-panel__label-inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-width: 0;
  }

  .we-runtime-config-panel__label-text {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
  }

  .we-runtime-config-panel__collapse-icon {
    margin-right: 5px;
  }

  .we-runtime-config-panel__collapse-icon svg {
    transition: all 0.3s ease;
  }

  .we-runtime-config-panel__info-icon {
    margin-left: 2px;
    color: rgba(0, 0, 0, 0.45);
  }

  .we-runtime-config-panel__control {
    width: 44%;
    min-width: 96px;
    flex: 0 0 44%;
  }

  .we-runtime-config-panel__control--auto {
    width: auto;
    min-width: auto;
    flex: 0 0 auto;
  }

  .we-runtime-config-panel__control--full {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }

  .we-runtime-config-panel__attr-component[data-multiline="true"] .we-runtime-config-panel__control--full {
    width: 100%;
    flex: 1 1 auto;
  }

  .we-runtime-config-panel__group {
    margin: 2px 0;
  }

  .we-runtime-config-panel__group-content {
    border-radius: 2px;
    padding: 2px 4px;
  }

  .we-runtime-config-panel__group-content--collapsed {
    display: none;
  }

  .we-runtime-config-panel__group--inline .we-runtime-config-panel__group-content {
    padding: 0;
    background: transparent;
  }

  .we-runtime-config-panel__text-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 4px 0;
  }

  .we-runtime-config-panel__text {
    flex: 1 1 auto;
    min-width: 0;
    margin-bottom: 0;
    font-size: 12px;
    line-height: 1.6;
  }

  .we-runtime-config-panel__hint {
    margin: 4px 0 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: ${EDITOR_CHROME.surfaceMuted};
    border: 1px solid ${EDITOR_CHROME.border};
  }

  .we-runtime-config-panel__hint-text {
    display: block;
    margin-bottom: 0;
    font-size: 12px;
    line-height: 1.6;
    color: ${EDITOR_CHROME.textSecondary};
    white-space: pre-wrap;
  }

  .we-runtime-config-panel__card-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .we-runtime-config-panel__card-option {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid ${EDITOR_CHROME.border};
    border-radius: 10px;
    background: ${EDITOR_CHROME.surfaceMuted};
    color: ${EDITOR_CHROME.textPrimary};
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .we-runtime-config-panel__card-option:hover:not(:disabled) {
    border-color: rgba(37, 99, 235, 0.34);
    background: #fff;
  }

  .we-runtime-config-panel__card-option--selected {
    border-color: ${EDITOR_CHROME.accent};
    background: rgba(37, 99, 235, 0.08);
    box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.12);
  }

  .we-runtime-config-panel__card-option:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  .we-runtime-config-panel__card-option-title {
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .we-runtime-config-panel__card-option-description {
    color: ${EDITOR_CHROME.textSecondary};
    font-size: 11px;
    line-height: 1.45;
  }

  .we-runtime-prop-panel__collapse.ant-collapse {
    background: transparent;
  }

  .we-runtime-prop-panel__collapse.ant-collapse > .ant-collapse-item {
    border-bottom: 1px solid ${EDITOR_CHROME.divider};
  }

  .we-runtime-prop-panel__collapse.ant-collapse
    > .ant-collapse-item
    > .ant-collapse-header
  {
    padding: 6px 0 4px;
    align-items: center;
  }

  .we-runtime-prop-panel__collapse.ant-collapse
    > .ant-collapse-item
    > .ant-collapse-header
    .ant-collapse-expand-icon {
    color: ${EDITOR_CHROME.textMuted};
  }

  .we-runtime-prop-panel__collapse.ant-collapse
    > .ant-collapse-item
    > .ant-collapse-header
    .ant-collapse-header-text {
    font-size: 12px;
    font-weight: 400;
    color: ${EDITOR_CHROME.textPrimary};
  }

  .we-runtime-page-tweak-panel__header-label {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-width: 0;
    flex: 1 1 auto;
  }

  .we-runtime-page-tweak-panel__header-label-text {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.45;
  }

  .we-runtime-page-tweak-panel__header-label--active .we-runtime-page-tweak-panel__header-label-text {
    color: ${EDITOR_CHROME.accent};
  }

  .we-runtime-page-tweak-panel__header-row {
    display: inline-flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .we-runtime-page-tweak-panel__header-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
    margin-left: auto;
  }

  .we-runtime-page-tweak-panel__header-action.ant-btn.ant-btn-text {
    width: 22px;
    min-width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 999px;
    color: ${EDITOR_CHROME.textMuted};
  }

  .we-runtime-page-tweak-panel__header-action.ant-btn.ant-btn-text:not(:disabled):hover {
    color: ${EDITOR_CHROME.textPrimary};
    background: ${EDITOR_CHROME.hoverSubtle};
  }

  .we-runtime-prop-panel__collapse.ant-collapse > .ant-collapse-item > .ant-collapse-content {
    background: transparent;
    border-top: 0;
  }

  .we-runtime-prop-panel__collapse.ant-collapse
    > .ant-collapse-item
    > .ant-collapse-content
    > .ant-collapse-content-box {
    padding: 0 0 4px;
  }

  .we-runtime-prop-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 10px 8px;
    border-bottom: 1px solid ${EDITOR_CHROME.divider};
  }

  .we-runtime-prop-panel__header-title {
    font-size: 13px;
    line-height: 1.4;
    font-weight: 700;
    color: ${EDITOR_CHROME.textPrimary};
    min-width: 0;
  }

  .we-runtime-prop-panel__header-title-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .we-runtime-prop-panel__header-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .we-runtime-prop-panel__header-action.ant-btn.ant-btn-text {
    width: 28px;
    min-width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 999px;
  }

  .we-runtime-prop-panel__header-help.ant-btn.ant-btn-text {
    color: ${EDITOR_CHROME.textMuted};
  }

  .we-runtime-prop-panel__header-help.ant-btn.ant-btn-text:hover,
  .we-runtime-prop-panel__header-help.ant-btn.ant-btn-text:focus-visible {
    color: ${EDITOR_CHROME.textSecondary};
    background: ${EDITOR_CHROME.hoverSubtle};
  }

  .we-runtime-prop-panel__header-action.ant-btn.ant-btn-text.we-runtime-prop-panel__header-action--active {
    color: ${EDITOR_CHROME.accent};
  }

  .we-runtime-keyboard-shortcuts-modal,
  .we-runtime-keyboard-shortcuts-modal * {
    outline: none !important;
  }

  .we-runtime-keyboard-shortcuts-modal .ant-btn:focus,
  .we-runtime-keyboard-shortcuts-modal .ant-btn:focus-visible,
  .we-runtime-keyboard-shortcuts-modal [tabindex]:focus,
  .we-runtime-keyboard-shortcuts-modal [tabindex]:focus-visible {
    outline: none !important;
    box-shadow: none !important;
  }

  .we-runtime-feedback-modal,
  .we-runtime-feedback-modal:focus,
  .we-runtime-feedback-modal:focus-visible,
  .we-runtime-feedback-modal:focus-within,
  .we-runtime-feedback-modal .ant-modal-content,
  .we-runtime-feedback-modal .ant-modal-content:focus,
  .we-runtime-feedback-modal .ant-modal-content:focus-visible {
    outline: none !important;
  }

  .we-runtime-feedback-modal:focus,
  .we-runtime-feedback-modal:focus-visible,
  .we-runtime-feedback-modal:focus-within,
  .we-runtime-feedback-modal .ant-modal-content:focus,
  .we-runtime-feedback-modal .ant-modal-content:focus-visible {
    box-shadow: none !important;
  }

  .we-runtime-directory-picker-modal .ant-modal-content {
    overflow: hidden;
  }

  .we-runtime-directory-picker-modal .ant-modal-body {
    overflow: hidden;
    box-sizing: border-box;
  }

  .we-runtime-directory-picker-modal .ant-modal {
    max-width: calc(100vw - 24px);
  }

  .we-runtime-directory-picker__title {
    display: flex;
    flex-direction: column;
    gap: 5px;
    line-height: 1.25;
  }

  .we-runtime-directory-picker__description {
    color: ${EDITOR_CHROME.textMuted};
    font-size: 12px;
    font-weight: 400;
  }

  .we-runtime-directory-picker {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 12px;
  }

  .we-runtime-directory-picker__path-row {
    display: flex;
    flex: 0 0 auto;
    gap: 10px;
  }

  .we-runtime-directory-picker__path-field {
    position: relative;
    min-width: 0;
    flex: 1 1 auto;
  }

  .we-runtime-directory-picker__path-field .ant-input {
    height: 40px;
    border-radius: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
  }

  .we-runtime-directory-picker__path-row > .ant-btn {
    height: 40px;
    border-radius: 10px;
  }

  .we-runtime-directory-picker__recent-list {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    right: 0;
    left: 0;
    max-height: min(264px, 40vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 5px;
    border: 1px solid ${EDITOR_CHROME.borderStrong};
    border-radius: 10px;
    background: ${EDITOR_CHROME.surfaceElevated};
    box-shadow: ${EDITOR_CHROME.shadowCompact};
  }

  .we-runtime-directory-picker__recent-heading {
    padding: 5px 8px 7px;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 12px;
    font-weight: 600;
  }

  .we-runtime-directory-picker__recent-item {
    display: flex;
    min-width: 0;
    align-items: center;
    border-radius: 7px;
  }

  .we-runtime-directory-picker__recent-item--active {
    background: ${EDITOR_CHROME.hoverSubtle};
  }

  .we-runtime-directory-picker__recent-main {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: ${EDITOR_CHROME.textPrimary};
    cursor: pointer;
    text-align: left;
  }

  .we-runtime-directory-picker__recent-main > .anticon {
    flex: 0 0 auto;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 15px;
  }

  .we-runtime-directory-picker__recent-copy {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
  }

  .we-runtime-directory-picker__recent-name,
  .we-runtime-directory-picker__recent-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .we-runtime-directory-picker__recent-name {
    font-size: 13px;
    font-weight: 600;
  }

  .we-runtime-directory-picker__recent-path {
    color: ${EDITOR_CHROME.textMuted};
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
  }

  .we-runtime-directory-picker__recent-remove.ant-btn {
    width: 28px;
    min-width: 28px;
    height: 28px;
    margin-right: 3px;
    padding: 0;
    flex: 0 0 auto;
    color: ${EDITOR_CHROME.textMuted};
  }

  .we-runtime-directory-picker__recent-empty {
    padding: 20px 12px;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 12px;
    text-align: center;
  }

  .we-runtime-directory-picker__location {
    display: flex;
    min-height: 40px;
    flex: 0 0 auto;
    align-items: center;
    overflow: hidden;
    border: 1px solid ${EDITOR_CHROME.border};
    border-radius: 10px;
    background: ${EDITOR_CHROME.surfaceMuted};
  }

  .we-runtime-directory-picker__location-label {
    flex: 0 0 auto;
    padding: 0 12px;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 12px;
    font-weight: 600;
  }

  .we-runtime-directory-picker__divider {
    width: 1px;
    height: 20px;
    flex: 0 0 auto;
    background: ${EDITOR_CHROME.divider};
  }

  .we-runtime-directory-picker__breadcrumbs {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    align-items: center;
    overflow-x: auto;
    padding: 3px 4px;
    scrollbar-width: none;
    white-space: nowrap;
  }

  .we-runtime-directory-picker__breadcrumbs::-webkit-scrollbar {
    display: none;
  }

  .we-runtime-directory-picker__breadcrumb.ant-btn {
    height: 28px;
    padding: 0 7px;
    color: ${EDITOR_CHROME.textSecondary};
  }

  .we-runtime-directory-picker__breadcrumb-separator {
    flex: 0 0 auto;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 10px;
  }

  .we-runtime-directory-picker__location-actions {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 1px;
    padding: 0 4px;
  }

  .we-runtime-directory-picker__location-actions .ant-btn {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
  }

  .we-runtime-directory-picker__error,
  .we-runtime-directory-picker__recent-error {
    flex: 0 0 auto;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
  }

  .we-runtime-directory-picker__error {
    color: ${EDITOR_CHROME.textDanger};
    background: color-mix(in srgb, ${EDITOR_CHROME.textDanger} 8%, transparent);
  }

  .we-runtime-directory-picker__recent-error {
    color: ${EDITOR_CHROME.textSecondary};
    background: ${EDITOR_CHROME.surfaceMuted};
  }

  .we-runtime-directory-picker__list {
    height: min(320px, calc(100vh - 370px));
    min-height: 190px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid ${EDITOR_CHROME.border};
    border-radius: 10px;
  }

  .we-runtime-directory-picker__row {
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 42px;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    border: 0;
    border-bottom: 1px solid ${EDITOR_CHROME.divider};
    background: transparent;
    color: ${EDITOR_CHROME.textPrimary};
    cursor: pointer;
    text-align: left;
  }

  .we-runtime-directory-picker__row:last-child {
    border-bottom: 0;
  }

  .we-runtime-directory-picker__row:hover:not(:disabled),
  .we-runtime-directory-picker__row:focus-visible:not(:disabled) {
    background: ${EDITOR_CHROME.hoverSubtle} !important;
  }

  .we-runtime-directory-picker__row > .anticon:first-child {
    flex: 0 0 auto;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 15px;
  }

  .we-runtime-directory-picker__row-name {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .we-runtime-directory-picker__row-arrow {
    flex: 0 0 auto;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 11px;
  }

  .we-runtime-directory-picker__empty {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 28px 16px;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 640px) {
    .we-runtime-directory-picker-modal .ant-modal-content {
      padding: 18px 16px 14px;
    }

    .we-runtime-directory-picker__list {
      height: min(360px, calc(100vh - 340px));
      min-height: 180px;
    }

    .we-runtime-directory-picker__location-label {
      padding: 0 9px;
    }
  }

  .we-runtime-prop-panel__body .ant-input-filled,
  .we-runtime-prop-panel__body .ant-input-number-filled,
  .we-runtime-prop-panel__body .ant-select-filled:not(.ant-select-customize-input) .ant-select-selector {
    background: ${EDITOR_CHROME.surfaceMuted};
    border: none;
    box-shadow: none;
  }

  .we-runtime-prop-panel__body .ant-input-filled:hover,
  .we-runtime-prop-panel__body .ant-input-number-filled:hover,
  .we-runtime-prop-panel__body .ant-select-filled:not(.ant-select-customize-input):hover .ant-select-selector {
    background: ${EDITOR_CHROME.surfaceInteractive};
  }

  .we-runtime-prop-panel__body .ant-input-filled:focus,
  .we-runtime-prop-panel__body .ant-input-filled.ant-input-focused,
  .we-runtime-prop-panel__body .ant-input-number-filled.ant-input-number-focused,
  .we-runtime-prop-panel__body .ant-select-filled.ant-select-focused .ant-select-selector {
    background: ${EDITOR_CHROME.surfaceInteractive};
  }

  .we-runtime-prop-panel__body .ant-segmented {
    background: ${EDITOR_CHROME.surfaceMuted};
    padding: 2px;
    border-radius: 10px;
  }

  .we-runtime-prop-panel__body .ant-segmented-item {
    min-height: 28px;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }

  .we-runtime-prop-panel__body .ant-segmented-item-selected {
    box-shadow: inset 0 0 0 1px ${EDITOR_CHROME.borderStrong};
    border-radius: 8px;
  }

  .we-runtime-prop-panel__body .ant-segmented-item-label {
    width: 100%;
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1.2;
    text-align: center;
  }

  .we-runtime-config-panel__segmented-option {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-width: 0;
    width: 100%;
    padding: 2px 4px;
  }

  .we-runtime-config-panel__segmented-option-label {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${EDITOR_CHROME.textPrimary};
    font-size: 12px;
    line-height: 1.2;
  }

  .we-runtime-config-panel__segmented-option-description {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${EDITOR_CHROME.textMuted};
    font-size: 10px;
    line-height: 1.2;
  }

  .we-runtime-prop-panel__body .ant-slider {
    margin-block: 4px;
  }

  .we-runtime-prop-panel__body .ant-btn.ant-btn-text {
    padding-inline: 6px;
    color: ${EDITOR_CHROME.textSecondary};
  }

  .we-runtime-prop-panel__body .ant-btn.ant-btn-text:hover {
    color: ${EDITOR_CHROME.textPrimary};
    background: ${EDITOR_CHROME.hoverGhost};
  }

  .we-runtime-prop-panel__body .ant-empty-description {
    color: ${EDITOR_CHROME.textSecondary};
  }

  .we-runtime-prop-panel__body .ant-color-picker-trigger {
    align-items: center;
    border: 1px solid ${EDITOR_CHROME.borderStrong};
    background: ${EDITOR_CHROME.surfaceMuted};
    box-shadow: none;
    cursor: pointer;
  }

  .we-runtime-prop-panel__body .ant-color-picker-trigger:hover {
    border-color: ${EDITOR_CHROME.borderStrong};
    background: ${EDITOR_CHROME.surfaceInteractive};
  }

  .we-runtime-prop-panel__body .ant-color-picker-trigger.ant-color-picker-trigger-disabled,
  .we-runtime-prop-panel__body .ant-color-picker-trigger[disabled],
  .we-runtime-prop-panel__body .ant-color-picker-trigger[aria-disabled="true"] {
    cursor: not-allowed;
  }

  .we-runtime-prop-panel__body .we-runtime-prop-panel__unit-input {
    width: 100%;
  }

  .we-runtime-prop-panel__body .we-runtime-prop-panel__unit-input-amount {
    text-align: left;
    font-variant-numeric: tabular-nums;
  }

  .we-runtime-prop-panel__body .we-runtime-prop-panel__unit-input .ant-select.ant-select-sm,
  .we-runtime-prop-panel__body .we-runtime-prop-panel__unit-input .ant-input.ant-input-sm {
    min-width: 0;
  }

  .we-runtime-prop-panel__unit-select-popup {
    min-width: 76px !important;
  }

  .we-runtime-prop-panel__unit-select-popup .ant-select-item-option-content,
  .we-runtime-prop-panel__unit-select-popup .ant-select-item {
    white-space: nowrap;
  }

  .we-runtime-prop-panel__body .ant-input-number-input,
  .we-runtime-prop-panel__body .ant-select-selection-item,
  .we-runtime-prop-panel__body .ant-select-selection-placeholder,
  .we-runtime-prop-panel__body .ant-input,
  .we-runtime-prop-panel__body textarea {
    color: ${EDITOR_CHROME.textPrimary};
  }

  .we-runtime-prop-panel__body .ant-select,
  .we-runtime-prop-panel__body .ant-input-number,
  .we-runtime-prop-panel__body .ant-input,
  .we-runtime-prop-panel__body .ant-input-affix-wrapper {
    width: 100%;
    min-width: 0;
  }

  .we-runtime-prop-panel__body .ant-select .ant-select-arrow {
    color: ${EDITOR_CHROME.textMuted};
  }

  .we-runtime-prop-panel__body .ant-switch {
    background: ${EDITOR_CHROME.borderStrong};
    flex: 0 0 auto;
  }

  .we-runtime-prop-panel__body .ant-switch.ant-switch-checked {
    background: ${EDITOR_CHROME.accent};
  }

  .we-runtime-prop-panel__drag-handle {
    cursor: grab;
  }

  .we-runtime-toolbar__drag-grip {
    position: relative;
    z-index: 1;
    width: 0;
    min-width: 0;
    margin-right: -4px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    box-sizing: border-box;
    cursor: grab;
    touch-action: none;
    user-select: none;
    overflow: hidden;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateX(-8px) scale(0.9);
    transform-origin: left center;
    transition:
      width 200ms cubic-bezier(0.2, 0.8, 0.2, 1),
      margin-right 200ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 140ms ease,
      visibility 0s linear 140ms,
      transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .we-runtime-prop-panel__drag-handle:hover .we-runtime-toolbar__drag-grip,
  .we-runtime-toolbar__drag-grip[data-dragging="true"] {
    width: 12px;
    margin-right: 0;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(0) scale(1);
    transition-delay: 0s;
  }

  .we-runtime-toolbar__drag-grip[data-dragging="true"] {
    cursor: grabbing;
  }

  @media (hover: none) {
    .we-runtime-toolbar__drag-grip {
      width: 12px;
      margin-right: 0;
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateX(0) scale(1);
      transition-delay: 0s;
    }
  }

  .we-runtime-prop-panel__resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 12px;
    z-index: 2;
    cursor: ew-resize;
    touch-action: none;
    pointer-events: auto;
  }

  .we-runtime-prop-panel__resize-handle::after {
    content: "";
    position: absolute;
    top: 18px;
    bottom: 18px;
    left: 4px;
    width: 2px;
    border-radius: 999px;
    background: transparent;
    transition: background-color 160ms ease, box-shadow 160ms ease;
  }

  .we-runtime-prop-panel__resize-handle:hover::after,
  .we-runtime-prop-panel__resize-handle[data-resizing="true"]::after {
    background: ${EDITOR_CHROME.accentSoft};
    box-shadow: 0 0 0 1px ${EDITOR_CHROME.accentRing};
  }

  .we-runtime-toolbar__spinner {
    position: absolute;
    inset: -150%;
    animation: we-runtime-agent-spin linear infinite;
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
`;
