import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createElementScreenshotFileName,
  deriveResourceCanvasScreenshotUrl,
  getPrototypePageScreenshotFileName,
  persistPrototypeScreenshot,
} from './screenshotPersistence';

describe('screenshot persistence helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates page screenshot filenames from safe page ids', () => {
    expect(getPrototypePageScreenshotFileName('checkout-step-1')).toBe('page-checkout-step-1.png');
    expect(getPrototypePageScreenshotFileName(' checkout-step-1 ')).toBe('page-checkout-step-1.png');
    expect(getPrototypePageScreenshotFileName('Checkout Step')).toBeUndefined();
    expect(getPrototypePageScreenshotFileName('../outside')).toBeUndefined();
  });

  it('derives screenshot URLs beside resource canvas files', () => {
    vi.stubGlobal('window', { location: { origin: 'http://admin.local' } });

    expect(deriveResourceCanvasScreenshotUrl('project-b', 'src/resources/flows/app.excalidraw')).toBe(
      'http://admin.local/api/canvas/resources/flows/app.excalidraw/asset/screenshot.png?projectId=project-b',
    );
    expect(deriveResourceCanvasScreenshotUrl('project-b', 'src/resources/flows/app.excalidraw', 'page-settings.png')).toBe(
      'http://admin.local/api/canvas/resources/flows/app.excalidraw/asset/page-settings.png?projectId=project-b',
    );
    expect(deriveResourceCanvasScreenshotUrl('project-b', 'src/resources/flows/app.excalidraw', '../settings.png')).toBeUndefined();
  });

  it('persists page screenshots to the current resource canvas assets folder', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://admin.local' } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      screenshotUrl: '/api/canvas/resources/flows/app.excalidraw/asset/page-settings.png?v=123',
      path: 'src/resources/.assets/flows/app.excalidraw/page-settings.png',
      width: 393,
      height: 852,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await persistPrototypeScreenshot({
      projectId: 'project-b',
      previewUrl: '/prototypes/home#page=settings',
      canvasFilePath: 'src/resources/flows/app.excalidraw',
      pageId: 'settings',
      elementId: 'embed-1',
      dataUrl: 'data:image/png;base64,abc',
      width: 393,
      height: 852,
    });

    expect(createElementScreenshotFileName('embed-1')).toBe('embed-embed-1.png');
    expect(fetchMock).toHaveBeenCalledWith('/api/canvas/resources/flows/app.excalidraw/screenshot?projectId=project-b', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        elementId: undefined,
        pageId: 'settings',
        fileName: 'page-settings.png',
        dataUrl: 'data:image/png;base64,abc',
        width: 393,
        height: 852,
      }),
    }));
    expect(result).toMatchObject({
      screenshotUrl: 'http://admin.local/api/canvas/resources/flows/app.excalidraw/asset/page-settings.png?v=123&projectId=project-b',
      path: 'src/resources/.assets/flows/app.excalidraw/page-settings.png',
      width: 393,
      height: 852,
    });
  });

  it('does not persist screenshots without a resource canvas path', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(persistPrototypeScreenshot({
      projectId: 'project-b',
      previewUrl: '/prototypes/home#page=settings',
      pageId: 'settings',
      dataUrl: 'data:image/png;base64,abc',
    })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
