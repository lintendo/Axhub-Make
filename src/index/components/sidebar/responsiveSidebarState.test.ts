import { describe, expect, it } from 'vitest';

import { ADAPTIVE_DESKTOP_ACTIVATION_WIDTH } from '../../domains/device/preview-layout';
import {
  RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX,
  resolveEffectiveSidebarCollapsed,
  resolveResponsiveWorkspaceAvailableWidth,
  resolveResponsiveSidebarDefaultCollapsed,
} from './responsiveSidebarState';

describe('responsive sidebar state', () => {
  it('collapses below the adaptive desktop activation width and expands at the threshold', () => {
    expect(RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX).toBe(ADAPTIVE_DESKTOP_ACTIVATION_WIDTH);
    expect(resolveResponsiveSidebarDefaultCollapsed({
      workspaceWidth: 1279,
      assistantVisible: false,
      assistantWidth: 0,
    })).toBe(true);
    expect(resolveResponsiveSidebarDefaultCollapsed({
      workspaceWidth: 1280,
      assistantVisible: false,
      assistantWidth: 0,
    })).toBe(false);
  });

  it('subtracts a visible in-app assistant panel from the available workspace', () => {
    expect(resolveResponsiveSidebarDefaultCollapsed({
      workspaceWidth: 1440,
      assistantVisible: true,
      assistantWidth: 320,
    })).toBe(true);
    expect(resolveResponsiveSidebarDefaultCollapsed({
      workspaceWidth: 1440,
      assistantVisible: false,
      assistantWidth: 320,
    })).toBe(false);
  });

  it('exposes stable external workspace width independently from temporary preview UI', () => {
    expect(resolveResponsiveWorkspaceAvailableWidth({
      workspaceWidth: 1920,
      assistantVisible: true,
      assistantWidth: 480,
    })).toBe(1440);
    expect(resolveResponsiveWorkspaceAvailableWidth({
      workspaceWidth: 1920,
      assistantVisible: false,
      assistantWidth: 480,
    })).toBe(1920);
  });

  it('lets an explicit pinned choice override later responsive defaults', () => {
    expect(resolveEffectiveSidebarCollapsed({
      responsiveDefaultCollapsed: true,
      pinnedCollapsed: false,
    })).toBe(false);
    expect(resolveEffectiveSidebarCollapsed({
      responsiveDefaultCollapsed: false,
      pinnedCollapsed: true,
    })).toBe(true);
    expect(resolveEffectiveSidebarCollapsed({
      responsiveDefaultCollapsed: true,
      pinnedCollapsed: null,
    })).toBe(true);
  });

  it('gives a temporary system collapse precedence without changing the pin', () => {
    expect(resolveEffectiveSidebarCollapsed({
      responsiveDefaultCollapsed: false,
      pinnedCollapsed: null,
      systemCollapsed: true,
    })).toBe(true);
    expect(resolveEffectiveSidebarCollapsed({
      responsiveDefaultCollapsed: false,
      pinnedCollapsed: false,
      systemCollapsed: null,
    })).toBe(false);
  });
});
