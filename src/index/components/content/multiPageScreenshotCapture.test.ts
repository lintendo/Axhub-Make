import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureSameOriginIframeScreenshotMock = vi.hoisted(() => vi.fn());

vi.mock('./canvas-embeds/parentScreenshotCapture', () => ({
  captureSameOriginIframeScreenshot: captureSameOriginIframeScreenshotMock,
}));

import { captureMultiPageScreenshot } from './multiPageScreenshotCapture';

describe('captureMultiPageScreenshot', () => {
  beforeEach(() => {
    captureSameOriginIframeScreenshotMock.mockReset();
  });

  it('returns the same-origin iframe screenshot for session reuse', async () => {
    const iframe = { contentWindow: {} } as HTMLIFrameElement;
    const screenshot = {
      dataUrl: 'data:image/png;base64,page-home',
      width: 1440,
      height: 900,
    };
    captureSameOriginIframeScreenshotMock.mockResolvedValue(screenshot);

    await expect(captureMultiPageScreenshot({
      iframe,
      width: 1440,
      height: 900,
    })).resolves.toEqual(screenshot);
    expect(captureSameOriginIframeScreenshotMock).toHaveBeenCalledWith({
      iframe,
      width: 1440,
      height: 900,
      captureFullContent: false,
    });
  });

  it('returns null before capture when the iframe is not ready', async () => {
    await expect(captureMultiPageScreenshot({
      iframe: null,
      width: 1440,
      height: 900,
    })).resolves.toBeNull();
    expect(captureSameOriginIframeScreenshotMock).not.toHaveBeenCalled();
  });

  it('returns null when same-origin capture fails', async () => {
    const iframe = { contentWindow: {} } as HTMLIFrameElement;
    captureSameOriginIframeScreenshotMock.mockRejectedValue(new Error('capture failed'));

    await expect(captureMultiPageScreenshot({
      iframe,
      width: 393,
      height: 852,
    })).resolves.toBeNull();
  });
});
