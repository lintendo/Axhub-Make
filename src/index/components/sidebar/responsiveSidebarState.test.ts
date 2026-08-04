import { describe, expect, it } from 'vitest';

import { ADAPTIVE_DESKTOP_ACTIVATION_WIDTH } from '../../domains/device/preview-layout';
import {
  RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX,
  resolveEffectiveSidebarCollapsed,
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
});
