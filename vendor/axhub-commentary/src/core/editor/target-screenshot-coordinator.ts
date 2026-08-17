import type { PromptImageAttachment } from './state';

export interface TargetScreenshotCoordinatorOptions {
  isEnabled: () => boolean;
  capture: (element: Element, commentId: string) => Promise<PromptImageAttachment>;
  resolveCaptureElement?: (element: Element) => Element | null;
  prepare: (
    element: Element,
    images: readonly PromptImageAttachment[],
  ) => readonly PromptImageAttachment[] | Promise<readonly PromptImageAttachment[]>;
  getCommentId: (element: Element) => string | null;
  getImages: (element: Element) => readonly PromptImageAttachment[];
  setImages: (element: Element, images: readonly PromptImageAttachment[]) => void;
  onError?: (error: unknown) => void;
}

export interface TargetScreenshotCoordinator {
  syncAfterNoteSave(
    element: Element,
    note: string,
    initialSelectionElement?: Element,
  ): Promise<void>;
  invalidate(): void;
}

function isTargetScreenshot(image: Pick<PromptImageAttachment, 'source'>): boolean {
  return image.source === 'target-screenshot';
}

function replaceTargetScreenshot(
  images: readonly PromptImageAttachment[],
  targetScreenshot: PromptImageAttachment | null,
): PromptImageAttachment[] {
  const userImages = images.filter((image) => !isTargetScreenshot(image));
  return targetScreenshot ? [...userImages, targetScreenshot] : userImages;
}

export function createTargetScreenshotCoordinator(
  options: TargetScreenshotCoordinatorOptions,
): TargetScreenshotCoordinator {
  const versionByElement = new WeakMap<Element, number>();
  let generation = 0;

  function begin(element: Element): { version: number; generation: number } {
    const version = (versionByElement.get(element) ?? 0) + 1;
    versionByElement.set(element, version);
    return { version, generation };
  }

  function isLatest(
    element: Element,
    operation: { version: number; generation: number },
    commentId: string,
  ): boolean {
    return (
      operation.generation === generation
      && versionByElement.get(element) === operation.version
      && options.getCommentId(element) === commentId
      && (element as Element & { isConnected?: boolean }).isConnected !== false
    );
  }

  async function syncAfterNoteSave(
    element: Element,
    note: string,
    initialSelectionElement?: Element,
  ): Promise<void> {
    const operation = begin(element);
    if (!String(note ?? '').trim()) {
      const currentImages = options.getImages(element);
      if (currentImages.some(isTargetScreenshot)) {
        options.setImages(element, replaceTargetScreenshot(currentImages, null));
      }
      return;
    }
    if (!options.isEnabled()) return;

    const commentId = String(options.getCommentId(element) ?? '').trim();
    if (!commentId) return;

    try {
      const screenshotElement =
        initialSelectionElement && initialSelectionElement.isConnected !== false
          ? initialSelectionElement
          : element;
      const captureElement = options.resolveCaptureElement
        ? options.resolveCaptureElement(screenshotElement)
        : screenshotElement;
      if (!captureElement) throw new Error('目标元素已不可用。');
      const captured = await options.capture(captureElement, commentId);
      const preparedImages = await options.prepare(element, [captured]);
      const prepared = preparedImages[0];
      if (!prepared) throw new Error('目标截图保存失败。');
      if (!isLatest(element, operation, commentId)) return;

      const targetScreenshot: PromptImageAttachment = {
        ...prepared,
        id: `${commentId}:target-screenshot`,
        name: 'target-screenshot.png',
        source: 'target-screenshot',
      };
      options.setImages(
        element,
        replaceTargetScreenshot(options.getImages(element), targetScreenshot),
      );
    } catch (error) {
      if (isLatest(element, operation, commentId)) {
        options.onError?.(error);
      }
    }
  }

  return {
    syncAfterNoteSave,
    invalidate() {
      generation += 1;
    },
  };
}
