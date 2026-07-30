import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMPACT_SIDEBAR_CLOSE_DELAY_MS,
  closeCompactSidebarAndRestoreFocus,
  createCompactSidebarInteraction,
} from './responsiveSidebarInteraction';

afterEach(() => {
  vi.useRealTimers();
});

describe('compact sidebar interaction', () => {
  it('keeps the sidebar open when the pointer leaves while focus remains inside', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createCompactSidebarInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.focusEnter();
    expect(open).toBe(true);

    interaction.pointerLeave();
    vi.advanceTimersByTime(COMPACT_SIDEBAR_CLOSE_DELAY_MS);
    expect(open).toBe(true);

    interaction.focusLeave();
    vi.advanceTimersByTime(COMPACT_SIDEBAR_CLOSE_DELAY_MS);
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('keeps the sidebar open when focus leaves while the pointer remains inside', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createCompactSidebarInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.focusEnter();
    interaction.focusLeave();
    vi.advanceTimersByTime(COMPACT_SIDEBAR_CLOSE_DELAY_MS);
    expect(open).toBe(true);

    interaction.pointerLeave();
    vi.advanceTimersByTime(COMPACT_SIDEBAR_CLOSE_DELAY_MS - 1);
    expect(open).toBe(true);

    vi.advanceTimersByTime(1);
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('cancels a pending close when the pointer returns and supports immediate Escape close', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createCompactSidebarInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.pointerLeave();
    interaction.pointerEnter();
    vi.advanceTimersByTime(COMPACT_SIDEBAR_CLOSE_DELAY_MS);
    expect(open).toBe(true);

    interaction.close();
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('clears retained pointer and focus state when forcibly closed', () => {
    vi.useFakeTimers();
    let open = false;
    const interaction = createCompactSidebarInteraction((nextOpen) => {
      open = nextOpen;
    });

    interaction.pointerEnter();
    interaction.close();
    expect(open).toBe(false);

    interaction.focusEnter();
    interaction.focusLeave();
    vi.advanceTimersByTime(COMPACT_SIDEBAR_CLOSE_DELAY_MS);
    expect(open).toBe(false);
    interaction.dispose();
  });

  it('restores focus to the compact trigger when Escape closes the sidebar', () => {
    const calls: string[] = [];

    closeCompactSidebarAndRestoreFocus(
      { close: () => calls.push('close') },
      { focus: () => calls.push('focus') },
    );

    expect(calls).toEqual(['focus', 'close']);
  });

  it('uses the shared controller without rendering a duplicate trigger button', () => {
    const source = readFileSync(resolve(__dirname, './ResponsiveSidebarShell.tsx'), 'utf8');

    expect(source).toContain('useResponsiveSidebarController()');
    expect(source).toContain('responsiveSidebar?.interaction.pointerEnter');
    expect(source).toContain('responsiveSidebar?.interaction.pointerLeave');
    expect(source).toContain('responsiveSidebar?.interaction.focusEnter');
    expect(source).toContain('responsiveSidebar?.interaction.focusLeave()');
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain('responsiveSidebar.closeAndRestoreFocus();');
    expect(source).not.toContain("import { PanelLeftOpen } from 'lucide-react';");
    expect(source).not.toContain('ax-sidebar-compact-trigger');
    expect(source).not.toContain('<button');
  });
});
