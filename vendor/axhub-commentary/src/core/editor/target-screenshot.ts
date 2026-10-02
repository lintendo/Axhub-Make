import type { PromptImageAttachment } from './state';
import {
  calculateTargetScreenshotBounds,
  captureTargetContextScreenshot,
  type EditorElementScreenshot,
  type TargetScreenshotBounds,
  type TargetScreenshotRect,
} from './screenshot';

export {
  calculateTargetScreenshotBounds,
  type TargetScreenshotBounds,
  type TargetScreenshotRect,
};

export interface TargetScreenshotCaptureOptions {
  isEditorUi?: (node: unknown) => boolean;
}

export type TargetScreenshotCapture = (
  element: Element,
  options: TargetScreenshotCaptureOptions,
) => Promise<EditorElementScreenshot>;

function estimateDataUrlBytes(data: string): number {
  const separatorIndex = data.indexOf(',');
  if (separatorIndex < 0) return 0;
  const header = data.slice(0, separatorIndex);
  const payload = data.slice(separatorIndex + 1);
  if (!header.includes(';base64')) {
    return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export async function captureTargetScreenshot(
  element: Element,
  commentId: string,
  options: {
    capture?: TargetScreenshotCapture;
    isEditorUi?: (node: unknown) => boolean;
    now?: () => number;
  } = {},
): Promise<PromptImageAttachment> {
  const normalizedCommentId = String(commentId ?? '').trim();
  if (!normalizedCommentId) throw new Error('目标截图缺少批注 ID。');

  const capture = options.capture
    ?? ((target: Element, captureOptions: TargetScreenshotCaptureOptions) => (
      captureTargetContextScreenshot(target, captureOptions)
    ));
  const screenshot = await capture(element, { isEditorUi: options.isEditorUi });

  return {
    id: `${normalizedCommentId}:target-screenshot`,
    name: 'target-screenshot.png',
    data: screenshot.data,
    mimeType: 'image/png',
    size: estimateDataUrlBytes(screenshot.data),
    createdAt: options.now?.() ?? Date.now(),
    source: 'target-screenshot',
  };
}
