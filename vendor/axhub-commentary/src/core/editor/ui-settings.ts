import { isMobileDevice } from '../../utils/mobile-detect';

export type WebEditorAgentProvider = 'claude' | 'codex' | 'opencode';
export type WebEditorDesignAdjustmentTool = 'figma' | 'axure' | 'pencil';
export type WebEditorInteractionProfile = 'design' | 'text-comment' | 'annotation';
export type CommentaryAgentProvider = WebEditorAgentProvider;
export type CommentaryDesignAdjustmentTool = WebEditorDesignAdjustmentTool;
export type CommentaryInteractionProfile = WebEditorInteractionProfile;

export interface WebEditorUiSettings {
  agentProvider: WebEditorAgentProvider | null;
  agentAwake: boolean;
  designAdjustmentTool: WebEditorDesignAdjustmentTool | null;
  styleDesignEnabled: boolean;
  darkMode: boolean;
  /** When true, CSS is injected into the page to disable animations (carousels, typewriters, etc.) */
  disablePageAnimations: boolean;
  /** Attach a contextual target screenshot to future element comment saves. */
  captureTargetScreenshot: boolean;
  /** Switch between element-level design comments and document text-selection comments. */
  documentCommentMode: boolean;
  /** When true, the host page content scales down from the right edge to make room for the panel. */
  pageZoomEnabled: boolean;
  /** Maximum number of concurrent element-level Agent runs. */
  agentRunConcurrency: number;
}
export type CommentaryUiSettings = WebEditorUiSettings;

export const DEFAULT_WEB_EDITOR_UI_SETTINGS: WebEditorUiSettings = {
  agentProvider: null,
  agentAwake: false,
  designAdjustmentTool: null,
  styleDesignEnabled: true,
  darkMode: false,
  disablePageAnimations: false,
  captureTargetScreenshot: false,
  documentCommentMode: false,
  pageZoomEnabled: false,
  agentRunConcurrency: 5,
};

const AGENT_PROVIDER_SET: ReadonlySet<WebEditorAgentProvider> = new Set([
  'claude',
  'codex',
  'opencode',
]);

const DESIGN_ADJUSTMENT_TOOL_SET: ReadonlySet<WebEditorDesignAdjustmentTool> = new Set([
  'figma',
  'axure',
  'pencil',
]);

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function sanitizeAgentRunConcurrency(value: unknown): number {
  const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_WEB_EDITOR_UI_SETTINGS.agentRunConcurrency;
  }
  return Math.min(10, Math.max(1, Math.trunc(numeric)));
}

export function sanitizeWebEditorUiSettings(value: unknown): WebEditorUiSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_WEB_EDITOR_UI_SETTINGS };
  }

  const record = value as Partial<Record<keyof WebEditorUiSettings, unknown>>;
  const agentProvider = normalizeString(record.agentProvider);
  const designAdjustmentTool = normalizeString(record.designAdjustmentTool);

  return {
    agentProvider: AGENT_PROVIDER_SET.has(agentProvider as WebEditorAgentProvider)
      ? (agentProvider as WebEditorAgentProvider)
      : null,
    agentAwake: Boolean(record.agentAwake),
    agentRunConcurrency:
      record.agentRunConcurrency === undefined
        ? DEFAULT_WEB_EDITOR_UI_SETTINGS.agentRunConcurrency
        : sanitizeAgentRunConcurrency(record.agentRunConcurrency),
    designAdjustmentTool: DESIGN_ADJUSTMENT_TOOL_SET.has(
      designAdjustmentTool as WebEditorDesignAdjustmentTool,
    )
      ? (designAdjustmentTool as WebEditorDesignAdjustmentTool)
      : null,
    styleDesignEnabled:
      record.styleDesignEnabled === undefined
        ? DEFAULT_WEB_EDITOR_UI_SETTINGS.styleDesignEnabled
        : Boolean(record.styleDesignEnabled),
    darkMode: Boolean(record.darkMode),
    disablePageAnimations: Boolean(record.disablePageAnimations),
    captureTargetScreenshot:
      record.captureTargetScreenshot === undefined
        ? DEFAULT_WEB_EDITOR_UI_SETTINGS.captureTargetScreenshot
        : Boolean(record.captureTargetScreenshot),
    documentCommentMode: Boolean(record.documentCommentMode),
    pageZoomEnabled: Boolean(record.pageZoomEnabled),
  };
}

export function applyInteractionProfileToUiSettings(
  settings: WebEditorUiSettings,
  profile: WebEditorInteractionProfile,
): WebEditorUiSettings {
  if (profile === 'design') {
    return settings;
  }

  return {
    ...settings,
    designAdjustmentTool: null,
    styleDesignEnabled: false,
  };
}

/**
 * On mobile devices, force-disable design-specific settings
 * (design adjustment tool and style design) while keeping
 * agent selection and dark mode.
 *
 * This is a no-op on desktop/PC – zero impact on PC experience.
 */
export function applyMobileSettingsOverride(
  settings: WebEditorUiSettings,
): WebEditorUiSettings {
  if (!isMobileDevice()) return settings;

  return {
    ...settings,
    designAdjustmentTool: null,
    styleDesignEnabled: false,
  };
}
