import { DeviceConfig } from './types';

export const STORAGE_KEY_ACTIVE_TAB = 'axhub-admin-active-tab';
export const STORAGE_KEY_DARK_MODE = 'axhub-make-dark-mode'; // 与 assets 页面保持一致
export const STORAGE_KEY_PROMPT_CLIENT = 'axhub-admin-prompt-client';
export const STORAGE_KEY_ASSISTANT_WIDTH = 'axhub:assistant-panel-width';
export const STORAGE_KEY_ASSISTANT_AUTO_OPEN_DISMISSED = 'axhub:assistant-auto-open-dismissed';
export const STORAGE_KEY_ASSISTANT_AUTO_OPEN_PANEL_MODE = 'axhub:assistant-auto-open-panel-mode';
export const STORAGE_KEY_COMMENTARY_VOICE_VISIBLE = 'axhub-make:commentary-voice-visible';
export const ASSISTANT_OPEN_URL_EVENT = 'axhub:open-assistant-url';

export const DEVICES: DeviceConfig[] = [
    { id: 'desktop', name: '电脑', width: 0, height: 0, type: 'desktop' },
    { id: 'mobile', name: '手机', width: 10, height: 21.7, type: 'mobile', ratio: '21.7:10' },
    { id: 'tablet', name: '平板', width: 10, height: 14.3, type: 'tablet', ratio: '10:14.3' },
];
