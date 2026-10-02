import { afterEach, describe, expect, it, vi } from 'vitest';

import { waitForDocumentPreviewReady } from './documentEditorLaunch';

const targetUrl = '/api/projects/make-project/document-content?path=src%2Fprototypes%2Fdemo%2Fdocs%2Fprd.html';
const origin = 'http://localhost:53817';

function previewFrame(href: string, readyState: DocumentReadyState = 'complete'): HTMLIFrameElement {
  return {
    contentWindow: { location: { href } },
    contentDocument: { readyState },
  } as unknown as HTMLIFrameElement;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('HTML document editor launch', () => {
  it('waits for the selected document rather than treating an old or loading iframe as ready', async () => {
    vi.useFakeTimers();
    let iframe: HTMLIFrameElement | null = previewFrame('about:blank');
    const ready = waitForDocumentPreviewReady(() => iframe, targetUrl, origin);

    await vi.advanceTimersByTimeAsync(100);
    iframe = previewFrame(`${origin}${targetUrl}`, 'loading');
    await vi.advanceTimersByTimeAsync(100);
    iframe = previewFrame(`${origin}${targetUrl}`);
    await vi.advanceTimersByTimeAsync(50);

    await expect(ready).resolves.toBe(true);
  });

  it('stops waiting when the deep-link selection is cancelled', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const ready = waitForDocumentPreviewReady(() => null, targetUrl, origin, controller.signal);

    controller.abort();

    await expect(ready).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
