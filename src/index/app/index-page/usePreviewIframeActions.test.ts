import { describe, expect, it } from 'vitest';

import {
  createPreviewIframeGenerationTracker,
  resolveCurrentPreviewIframe,
} from './usePreviewIframeActions';

describe('createPreviewIframeGenerationTracker', () => {
  it('invalidates a captured iframe session after the same iframe loads again', () => {
    const tracker = createPreviewIframeGenerationTracker();
    const iframe = {} as HTMLIFrameElement;

    tracker.markLoaded(iframe);
    const capturedGeneration = tracker.getGeneration(iframe);
    expect(capturedGeneration).toBeGreaterThan(0);

    tracker.markLoaded(iframe);

    expect(tracker.getGeneration(iframe)).toBe(capturedGeneration + 1);
  });

  it('tracks replacement iframe elements independently', () => {
    const tracker = createPreviewIframeGenerationTracker();
    const firstIframe = {} as HTMLIFrameElement;
    const replacementIframe = {} as HTMLIFrameElement;

    tracker.markLoaded(firstIframe);
    tracker.markLoaded(firstIframe);
    tracker.markLoaded(replacementIframe);

    expect(tracker.getGeneration(firstIframe)).toBe(2);
    expect(tracker.getGeneration(replacementIframe)).toBe(1);
  });

  it('uses the mounted container iframe while the React ref still points to a replaced node', () => {
    const staleIframe = { isConnected: false } as HTMLIFrameElement;
    const replacementIframe = { isConnected: true } as HTMLIFrameElement;
    const container = {
      contains: (node: Node) => node === replacementIframe,
      querySelector: () => replacementIframe,
    } as unknown as HTMLDivElement;

    expect(resolveCurrentPreviewIframe(staleIframe, container)).toBe(replacementIframe);
    expect(resolveCurrentPreviewIframe(replacementIframe, container)).toBe(replacementIframe);
  });

  it('returns null while a stale referenced iframe has left the container and its replacement is not mounted yet', () => {
    const staleIframe = { isConnected: false } as HTMLIFrameElement;
    const container = {
      contains: () => false,
      querySelector: () => null,
    } as unknown as HTMLDivElement;

    expect(resolveCurrentPreviewIframe(staleIframe, container)).toBeNull();
  });
});
