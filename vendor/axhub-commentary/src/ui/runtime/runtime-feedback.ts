import {
  flushWebEditorFeedbackMessages,
  sendWebEditorFeedbackMessage,
} from '../feedback-bridge';

export function notifyRuntimeMessage(
  type: 'success' | 'info' | 'warning' | 'error',
  content: string,
): void {
  sendWebEditorFeedbackMessage({ type, content });
}

export function flushRuntimeMessages(): void {
  flushWebEditorFeedbackMessages();
}
