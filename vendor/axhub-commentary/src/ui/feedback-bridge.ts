export interface WebEditorFeedbackBridge {
  confirm: (options: {
    title: string;
    content?: string;
    okText: string;
    cancelText?: string;
    secondaryText?: string;
    okType?: 'primary' | 'default';
    getContainer: () => HTMLElement;
    onOk: () => void;
    onSecondary?: () => void;
    onCancel: () => void;
  }) => void;
  alert: (options: {
    title: string;
    content?: string;
    okText: string;
    okType?: 'primary' | 'default';
    getContainer?: () => HTMLElement;
    onOk: () => void;
  }) => void;
  prompt: (options: {
    title: string;
    content?: string;
    label?: string;
    defaultValue?: string;
    placeholder?: string;
    okText: string;
    cancelText?: string;
    readOnly?: boolean;
    multiline?: boolean;
    rows?: number;
    selectOnOpen?: boolean;
    validate?: (value: string) => string | null;
    getContainer?: () => HTMLElement;
    onOk: (value: string) => void;
    onCancel: () => void;
  }) => void;
  message: (options: {
    type: 'success' | 'info' | 'warning' | 'error';
    content: string;
  }) => void;
}

export type WebEditorFeedbackMessage = {
  type: 'success' | 'info' | 'warning' | 'error';
  content: string;
};

let currentBridge: WebEditorFeedbackBridge | null = null;
const pendingMessages: WebEditorFeedbackMessage[] = [];

export function setWebEditorFeedbackBridge(bridge: WebEditorFeedbackBridge | null): void {
  currentBridge = bridge;
}

export function getWebEditorFeedbackBridge(): WebEditorFeedbackBridge | null {
  return currentBridge;
}

export function sendWebEditorFeedbackMessage(message: WebEditorFeedbackMessage): void {
  if (currentBridge) {
    currentBridge.message(message);
    return;
  }
  pendingMessages.push(message);
}

export function flushWebEditorFeedbackMessages(): void {
  if (!currentBridge || pendingMessages.length === 0) return;
  const pending = pendingMessages.splice(0);
  for (const message of pending) {
    currentBridge.message(message);
  }
}
