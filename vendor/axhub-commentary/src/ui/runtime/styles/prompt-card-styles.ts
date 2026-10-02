import type React from 'react';
import {
  EDITOR_CHROME,
  POPUP_LAYER_Z_INDEX,
  PROMPT_CARD_WIDTH,
} from '../theme';

export const promptCardStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: POPUP_LAYER_Z_INDEX + 10,
  width: PROMPT_CARD_WIDTH,
  minWidth: 0,
  maxWidth: 'min(420px, calc(100vw - 24px))',
  maxHeight: 'min(640px, calc(100vh - 120px))',
  padding: 10,
  borderRadius: 14,
  background: EDITOR_CHROME.surfaceOverlay,
  border: `1px solid ${EDITOR_CHROME.border}`,
  color: EDITOR_CHROME.textPrimary,
  boxShadow: EDITOR_CHROME.shadow,
  pointerEvents: 'auto',
  isolation: 'isolate',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
