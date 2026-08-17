import { ADAPTIVE_DESKTOP_ACTIVATION_WIDTH } from '../../domains/device/preview-layout';

export const SIDEBAR_WIDTH_PX = 240;
export const RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX = ADAPTIVE_DESKTOP_ACTIVATION_WIDTH;

interface ResponsiveWorkspaceWidthInput {
  workspaceWidth: number;
  assistantVisible: boolean;
  assistantWidth: number;
}

export function resolveResponsiveWorkspaceAvailableWidth(input: ResponsiveWorkspaceWidthInput): number {
  const workspaceWidth = Number.isFinite(input.workspaceWidth)
    ? Math.max(0, input.workspaceWidth)
    : 0;
  const assistantWidth = input.assistantVisible && Number.isFinite(input.assistantWidth)
    ? Math.max(0, input.assistantWidth)
    : 0;

  return Math.max(0, workspaceWidth - assistantWidth);
}

export function resolveResponsiveSidebarDefaultCollapsed(input: ResponsiveWorkspaceWidthInput): boolean {
  return resolveResponsiveWorkspaceAvailableWidth(input) < RESPONSIVE_SIDEBAR_COLLAPSE_THRESHOLD_PX;
}

export function resolveEffectiveSidebarCollapsed(input: {
  responsiveDefaultCollapsed: boolean;
  pinnedCollapsed: boolean | null;
  systemCollapsed?: boolean | null;
}): boolean {
  return input.systemCollapsed
    ?? input.pinnedCollapsed
    ?? input.responsiveDefaultCollapsed;
}
