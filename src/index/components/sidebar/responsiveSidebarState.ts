import { ADAPTIVE_DESKTOP_ACTIVATION_WIDTH } from '../../domains/device/preview-layout';

export const SIDEBAR_WIDTH_PX = 240;
export const RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX = ADAPTIVE_DESKTOP_ACTIVATION_WIDTH;

export function resolveResponsiveSidebarDefaultCollapsed(input: {
  workspaceWidth: number;
  assistantVisible: boolean;
  assistantWidth: number;
}): boolean {
  const workspaceWidth = Number.isFinite(input.workspaceWidth)
    ? Math.max(0, input.workspaceWidth)
    : 0;
  const assistantWidth = input.assistantVisible && Number.isFinite(input.assistantWidth)
    ? Math.max(0, input.assistantWidth)
    : 0;

  return workspaceWidth - assistantWidth < RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX;
}

export function resolveEffectiveSidebarCollapsed(input: {
  responsiveDefaultCollapsed: boolean;
  pinnedCollapsed: boolean | null;
}): boolean {
  return input.pinnedCollapsed ?? input.responsiveDefaultCollapsed;
}
