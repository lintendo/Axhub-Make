import { describe, expect, it } from 'vitest';

import {
  createPreviewResponsiveBasisState,
  reducePreviewResponsiveBasisState,
  resolvePreviewResponsiveBasisWidth,
  type PreviewResponsiveBasisEvent,
  type PreviewResponsiveBasisState,
} from './preview-responsive-basis';

function apply(
  state: PreviewResponsiveBasisState,
  ...events: PreviewResponsiveBasisEvent[]
): PreviewResponsiveBasisState {
  return events.reduce(reducePreviewResponsiveBasisState, state);
}

describe('preview responsive basis', () => {
  it('uses the live preview width without stabilization', () => {
    const state = apply(
      createPreviewResponsiveBasisState(),
      { type: 'preview-width-changed', width: 1279 },
      { type: 'external-workspace-width-changed', width: 1519 },
    );

    expect(resolvePreviewResponsiveBasisWidth(state)).toBe(1279);
  });

  it('ignores internal layout changes while following external workspace resizing', () => {
    const anchored = apply(
      createPreviewResponsiveBasisState(),
      { type: 'preview-width-changed', width: 1279 },
      { type: 'external-workspace-width-changed', width: 1519 },
      { type: 'stabilization-started', reason: 'annotation-sidebar' },
      { type: 'preview-width-changed', width: 1519 },
    );

    expect(resolvePreviewResponsiveBasisWidth(anchored)).toBe(1279);

    const resized = apply(
      anchored,
      { type: 'external-workspace-width-changed', width: 1760 },
      { type: 'preview-width-changed', width: 1760 },
    );

    expect(resolvePreviewResponsiveBasisWidth(resized)).toBe(1520);
  });

  it('keeps the anchor until every overlapping owner exits', () => {
    const overlapping = apply(
      createPreviewResponsiveBasisState(),
      { type: 'preview-width-changed', width: 1350 },
      { type: 'external-workspace-width-changed', width: 1590 },
      { type: 'stabilization-started', reason: 'annotation-sidebar' },
      { type: 'stabilization-started', reason: 'review-panel' },
      { type: 'preview-width-changed', width: 970 },
      { type: 'stabilization-ended', reason: 'annotation-sidebar' },
    );

    expect(resolvePreviewResponsiveBasisWidth(overlapping)).toBe(1350);

    const released = reducePreviewResponsiveBasisState(overlapping, {
      type: 'stabilization-ended',
      reason: 'review-panel',
    });

    expect(resolvePreviewResponsiveBasisWidth(released)).toBe(970);
  });

  it('captures a deferred anchor after both measurements become usable', () => {
    const state = apply(
      createPreviewResponsiveBasisState(),
      { type: 'stabilization-started', reason: 'review-panel' },
      { type: 'preview-width-changed', width: 1200 },
      { type: 'external-workspace-width-changed', width: 1580 },
    );

    expect(state.anchor).toEqual({
      previewWidth: 1200,
      externalWorkspaceWidth: 1580,
    });
    expect(resolvePreviewResponsiveBasisWidth(state)).toBe(1200);
  });

  it('ignores invalid measurements and repeated reason events', () => {
    const state = apply(
      createPreviewResponsiveBasisState(),
      { type: 'preview-width-changed', width: 1279 },
      { type: 'external-workspace-width-changed', width: 1519 },
      { type: 'stabilization-started', reason: 'annotation-sidebar' },
      { type: 'stabilization-started', reason: 'annotation-sidebar' },
      { type: 'preview-width-changed', width: 0 },
      { type: 'preview-width-changed', width: -200 },
      { type: 'external-workspace-width-changed', width: Number.NaN },
      { type: 'stabilization-ended', reason: 'review-panel' },
    );

    expect(state.activeReasons).toEqual(['annotation-sidebar']);
    expect(resolvePreviewResponsiveBasisWidth(state)).toBe(1279);
  });
});
