import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentaryAnnotationSaveStatus } from '@axhub/commentary';
import {
  QUICK_EDIT_SAVING_MIN_VISIBLE_MS,
  useSmoothedAnnotationSaveStatus,
} from './useSmoothedAnnotationSaveStatus';

let activeRenderer: ReactTestRenderer | null = null;

function createStatusHarness(initialStatus: CommentaryAnnotationSaveStatus) {
  function Harness({ status }: { status: CommentaryAnnotationSaveStatus }) {
    const visibleStatus = useSmoothedAnnotationSaveStatus(status);
    return React.createElement('span', { 'data-visible-status': visibleStatus });
  }

  act(() => {
    activeRenderer = create(React.createElement(Harness, { status: initialStatus }));
  });

  return {
    getVisibleStatus: () => activeRenderer?.root.findByType('span').props['data-visible-status'],
    update(status: CommentaryAnnotationSaveStatus) {
      act(() => {
        activeRenderer?.update(React.createElement(Harness, { status }));
      });
    },
    advance(milliseconds: number) {
      act(() => {
        vi.advanceTimersByTime(milliseconds);
      });
    },
    unmount() {
      act(() => activeRenderer?.unmount());
      activeRenderer = null;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T00:00:00.000Z'));
});

afterEach(() => {
  if (activeRenderer) {
    act(() => activeRenderer?.unmount());
    activeRenderer = null;
  }
  vi.useRealTimers();
});

describe('smoothed annotation save status', () => {
  it('uses the approved 600ms minimum and preserves terminal initial states', () => {
    expect(QUICK_EDIT_SAVING_MIN_VISIBLE_MS).toBe(600);
    expect(createStatusHarness('unsaved').getVisibleStatus()).toBe('unsaved');
  });

  it('keeps a fast successful save visible as saving for 600ms', () => {
    const harness = createStatusHarness('saved');

    harness.update('saving');
    harness.advance(100);
    harness.update('saved');

    expect(harness.getVisibleStatus()).toBe('saving');
    harness.advance(QUICK_EDIT_SAVING_MIN_VISIBLE_MS - 101);
    expect(harness.getVisibleStatus()).toBe('saving');
    harness.advance(1);
    expect(harness.getVisibleStatus()).toBe('saved');
  });

  it('keeps a fast failed save visible as saving before showing unsaved', () => {
    const harness = createStatusHarness('saved');

    harness.update('saving');
    harness.advance(250);
    harness.update('unsaved');

    expect(harness.getVisibleStatus()).toBe('saving');
    harness.advance(QUICK_EDIT_SAVING_MIN_VISIBLE_MS - 251);
    expect(harness.getVisibleStatus()).toBe('saving');
    harness.advance(1);
    expect(harness.getVisibleStatus()).toBe('unsaved');
  });

  it('shows the final state immediately after saving has already been visible for 600ms', () => {
    const harness = createStatusHarness('saved');

    harness.update('saving');
    harness.advance(QUICK_EDIT_SAVING_MIN_VISIBLE_MS);
    harness.update('saved');

    expect(harness.getVisibleStatus()).toBe('saved');
  });

  it('cancels an older completion when a new save starts', () => {
    const harness = createStatusHarness('saved');

    harness.update('saving');
    harness.advance(100);
    harness.update('saved');
    harness.advance(200);
    harness.update('saving');
    harness.advance(100);
    harness.update('saved');

    harness.advance(300);
    expect(harness.getVisibleStatus()).toBe('saving');
    harness.advance(200);
    expect(harness.getVisibleStatus()).toBe('saved');
  });

  it('starts a fresh 600ms window when saving becomes visible after being hidden', () => {
    const hiddenHarness = createStatusHarness('saved');
    hiddenHarness.update('saving');
    hiddenHarness.advance(100);
    hiddenHarness.unmount();
    vi.advanceTimersByTime(400);

    const visibleHarness = createStatusHarness('saving');
    visibleHarness.update('saved');

    visibleHarness.advance(QUICK_EDIT_SAVING_MIN_VISIBLE_MS - 1);
    expect(visibleHarness.getVisibleStatus()).toBe('saving');
    visibleHarness.advance(1);
    expect(visibleHarness.getVisibleStatus()).toBe('saved');
  });

  it('cleans up a pending completion timer when hidden', () => {
    const harness = createStatusHarness('saved');
    harness.update('saving');
    harness.advance(100);
    harness.update('saved');

    expect(vi.getTimerCount()).toBe(1);
    harness.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
