import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SIDEBAR_PREVIEW_CLOSE_DELAY_MS,
  closeSidebarPreviewAndRestoreFocus,
  createSidebarPreviewInteraction,
} from './responsiveSidebarInteraction';

afterEach(() => {
  vi.useRealTimers();
});

describe('compact sidebar interaction', () => {
  it('keeps the sidebar open when the pointer leaves while focus remains inside', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createSidebarPreviewInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.focusEnter();
    expect(open).toBe(true);

    interaction.pointerLeave();
    vi.advanceTimersByTime(SIDEBAR_PREVIEW_CLOSE_DELAY_MS);
    expect(open).toBe(true);

    interaction.focusLeave();
    vi.advanceTimersByTime(SIDEBAR_PREVIEW_CLOSE_DELAY_MS);
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('keeps the sidebar open when focus leaves while the pointer remains inside', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createSidebarPreviewInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.focusEnter();
    interaction.focusLeave();
    vi.advanceTimersByTime(SIDEBAR_PREVIEW_CLOSE_DELAY_MS);
    expect(open).toBe(true);

    interaction.pointerLeave();
    vi.advanceTimersByTime(SIDEBAR_PREVIEW_CLOSE_DELAY_MS - 1);
    expect(open).toBe(true);

    vi.advanceTimersByTime(1);
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('cancels a pending close when the pointer returns and supports immediate Escape close', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createSidebarPreviewInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.pointerLeave();
    interaction.pointerEnter();
    vi.advanceTimersByTime(SIDEBAR_PREVIEW_CLOSE_DELAY_MS);
    expect(open).toBe(true);

    interaction.close();
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('clears retained pointer and focus state when forcibly closed', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createSidebarPreviewInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.close();
    expect(open).toBe(false);

    interaction.focusEnter();
    interaction.focusLeave();
    vi.advanceTimersByTime(SIDEBAR_PREVIEW_CLOSE_DELAY_MS);
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('suppresses stale hover state until the pointer leaves and re-enters', () => {
    let open = false;
    const interaction = createSidebarPreviewInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    expect(open).toBe(true);
    interaction.suppressUntilPointerLeave();
    expect(open).toBe(false);

    interaction.pointerEnter();
    expect(open).toBe(false);
    interaction.pointerLeave();
    interaction.pointerEnter();
    expect(open).toBe(true);
    interaction.dispose();
  });

  it('restores focus to the compact trigger when Escape closes the sidebar', () => {
    const calls: string[] = [];

    closeSidebarPreviewAndRestoreFocus(
      { close: () => calls.push('close') },
      { focus: () => calls.push('focus') },
    );

    expect(calls).toEqual(['focus', 'close']);
  });

  it('uses the shared controller without rendering a duplicate trigger button', () => {
    const source = readFileSync(resolve(__dirname, './ResponsiveSidebarShell.tsx'), 'utf8');

    expect(source).toContain('useResponsiveSidebarController()');
    expect(source).toContain('collapsed ? responsiveSidebar?.interaction.pointerEnter : undefined');
    expect(source).toContain('collapsed ? responsiveSidebar?.interaction.pointerLeave : undefined');
    expect(source).toContain('collapsed ? responsiveSidebar?.interaction.focusEnter : undefined');
    expect(source).toContain('responsiveSidebar?.interaction.focusLeave()');
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain('responsiveSidebar.closeAndRestoreFocus();');
    expect(source).toContain("collapsed && previewOpen && 'is-preview-open'");
    expect(source).not.toContain("import { PanelLeftOpen } from 'lucide-react';");
    expect(source).not.toContain('ax-sidebar-compact-trigger');
    expect(source).not.toContain('<button');
  });
});
