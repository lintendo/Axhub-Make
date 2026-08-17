import { createWebEditorV2Controller } from './webEditorV2Integration';
import type {
  CommentaryDebugState,
  CommentaryEditedSnapshot,
  CommentaryExternalEditingState,
  CommentaryExternalEditingTaskRef,
  CommentaryExternalEditingStateResult,
  CommentaryExternalEditingTargetRef,
  CommentaryHostToolbarAction,
  CommentaryHostToolbarState,
  CommentaryPageElementActivationResult,
  CommentaryPageElementSearchQuery,
  CommentaryPageElementSearchResult,
  CommentaryPageElementStructureQuery,
  CommentaryPageElementStructureResult,
  CommentaryToolbarMode,
  CommentaryVoiceCommentOptions,
  CommentaryVoiceCommentResult,
  CommentaryVoiceTargets,
  CommentaryVoiceTargetsListener,
} from '@/common/web-editor-types';
import type {
  QuickEditSaveAction,
  QuickEditSaveCommitResult,
  QuickEditSaveDraft,
  QuickEditSavePreflight,
} from '../common/quickEditSave';

export type EditorMode = 'none' | 'webEditorV2';
export interface DevEditorEnableOptions {
  toolbarMode?: CommentaryToolbarMode;
  initialDarkMode?: boolean;
  mobileMode?: boolean;
  assistantPanelOpen?: boolean;
  commentPageScope?: string;
  makeServerOrigin?: string;
  annotationApiBaseUrl?: string;
  annotationProjectId?: string;
  agentRunConcurrency?: number;
  interactionProfile?: 'design' | 'annotation';
}

const MAKE_COMMENTARY_SKILL_INSTALL_SOURCE = [
  '.agents/skills/explore-options/SKILL.md',
  '.claude/skills/explore-options/SKILL.md',
  '.agents/skills/handle-comments/SKILL.md',
  '.claude/skills/handle-comments/SKILL.md',
].join('\n');

export interface DevEditorsApi {
  getMode: () => EditorMode;
  enable: (mode: EditorMode, options?: DevEditorEnableOptions) => Promise<void> | void;
  disable: () => Promise<void> | void;
  toggle: (mode: Exclude<EditorMode, 'none'>) => Promise<void> | void;
  enablePanelOnly: (options?: DevEditorEnableOptions) => Promise<void> | void;
  disablePanelOnly: () => Promise<void> | void;
  saveWebEditorTextChanges: () => Promise<void> | void;
  saveWebEditorStyleChanges: () => Promise<void> | void;
  clearWebEditorForcedStyles: () => Promise<void> | void;
  prepareQuickEditSave: (action: QuickEditSaveAction) => Promise<QuickEditSaveDraft | null>;
  preflightQuickEditSave: (draft: QuickEditSaveDraft) => Promise<QuickEditSavePreflight>;
  commitQuickEditSave: (draft: QuickEditSaveDraft) => Promise<QuickEditSaveCommitResult>;
  getWebEditorDebugState: () => CommentaryDebugState | null;
  getHostToolbarState: () => CommentaryHostToolbarState;
  subscribeHostToolbarState: (listener: (state: CommentaryHostToolbarState) => void) => () => void;
  runHostToolbarAction: (action: CommentaryHostToolbarAction) => Promise<boolean>;
  getEditedSnapshot: () => CommentaryEditedSnapshot | null;
  getVoiceTarget: () => unknown | null;
  getVoiceTargets: () => CommentaryVoiceTargets;
  subscribeVoiceTargets: (listener: CommentaryVoiceTargetsListener) => () => void;
  findVoiceElements: (query: CommentaryPageElementSearchQuery) => CommentaryPageElementSearchResult;
  getVoiceElementStructure: (
    query: CommentaryPageElementStructureQuery,
  ) => CommentaryPageElementStructureResult;
  activateVoiceElement: (targetRef: string) => Promise<CommentaryPageElementActivationResult>;
  createVoiceComment: (
    targetRef: string,
    content: string,
    options: CommentaryVoiceCommentOptions,
  ) => Promise<CommentaryVoiceCommentResult>;
  validateExternalEditingTarget: (
    elementKey: string,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ) => Promise<boolean>;
  getElementPromptText?: (elementKey: string) => string;
  setNodeEditingState: (
    elementKey: string,
    nextState: CommentaryExternalEditingState,
    taskRef: Partial<CommentaryExternalEditingTaskRef> | null,
    targetRef?: CommentaryExternalEditingTargetRef | null,
  ) => Promise<CommentaryExternalEditingStateResult>;
  getCopyPromptText?: () => string;
  getDecisionDataCount: () => number;
  getStatus: () => {
    mode: EditorMode;
    webEditor?: { active: boolean; undoCount: number; redoCount: number };
  };
}

export const resolveEditorMode = (search: string): EditorMode => {
  if (!search) return 'none';
  const params = new URLSearchParams(search);
  const editor = params.get('editor');
  if (editor === 'webEditorV2' || editor === 'none') {
    return editor;
  }
  return 'none';
};

export const createEditorModeManager = (initialMode?: EditorMode) => {
  const resolvedInitialMode =
    initialMode ?? (typeof window !== 'undefined' ? resolveEditorMode(window.location.search) : 'none');

  const webEditorController = createWebEditorV2Controller({
    ui: {
      skillInstallSource: MAKE_COMMENTARY_SKILL_INSTALL_SOURCE,
      hideExecutionControls: true,
    },
  });

  const controllers = {
    webEditorV2: webEditorController,
  } as const;

  let currentMode: EditorMode = 'none';
  let appliedInitial = false;

  const setMode = async (nextMode: EditorMode, options?: DevEditorEnableOptions): Promise<void> => {
    if (nextMode === currentMode) {
      if (nextMode === 'webEditorV2') {
        await Promise.resolve(webEditorController.enable(options));
      }
      return;
    }

    const prevMode = currentMode;
    currentMode = 'none';

    if (prevMode !== 'none') {
      await Promise.resolve(controllers[prevMode].disable());
    }

    if (nextMode !== 'none') {
      await Promise.resolve(webEditorController.enable(options));
      currentMode = nextMode;
    }
  };

  const applyInitialMode = () => {
    if (appliedInitial) return;
    appliedInitial = true;
    if (currentMode === 'none' && resolvedInitialMode !== 'none') {
      void setMode(resolvedInitialMode);
    }
  };

  const api: DevEditorsApi = {
    getMode: () => currentMode,
    enable: (mode, options) => setMode(mode, options),
    disable: () => setMode('none'),
    toggle: (mode) => setMode(currentMode === mode ? 'none' : mode),
    enablePanelOnly: (options) => webEditorController.enablePanelOnly(options),
    disablePanelOnly: () => {
      if (webEditorController.isPanelOnlyMode()) {
        webEditorController.disablePanelOnly();
      }
    },
    saveWebEditorTextChanges: () => webEditorController.saveTextChanges(),
    saveWebEditorStyleChanges: () => webEditorController.saveStyleChanges(),
    clearWebEditorForcedStyles: () => webEditorController.clearForcedStyles(),
    prepareQuickEditSave: (action) => webEditorController.prepareQuickEditSave(action),
    preflightQuickEditSave: (draft) => webEditorController.preflightQuickEditSave(draft),
    commitQuickEditSave: (draft) => webEditorController.commitQuickEditSave(draft),
    getWebEditorDebugState: () => webEditorController.getDebugState(),
    getHostToolbarState: () => webEditorController.getHostToolbarState(),
    subscribeHostToolbarState: (listener) => webEditorController.subscribeHostToolbarState(listener),
    runHostToolbarAction: (action) => webEditorController.runHostToolbarAction(action),
    getEditedSnapshot: () => webEditorController.getEditedSnapshot(),
    getVoiceTarget: () => webEditorController.getVoiceTarget?.() ?? null,
    getVoiceTargets: () => webEditorController.getVoiceTargets(),
    subscribeVoiceTargets: (listener) => webEditorController.subscribeVoiceTargets(listener),
    findVoiceElements: (query) => webEditorController.findVoiceElements(query),
    getVoiceElementStructure: (query) => webEditorController.getVoiceElementStructure(query),
    activateVoiceElement: (targetRef) => webEditorController.activateVoiceElement(targetRef),
    createVoiceComment: (targetRef, content, options) => (
      webEditorController.createVoiceComment(targetRef, content, options)
    ),
    validateExternalEditingTarget: (elementKey, targetRef) => (
      webEditorController.validateExternalEditingTarget(elementKey, targetRef ?? null)
    ),
    getElementPromptText: (elementKey) => webEditorController.getElementPromptText?.(elementKey) ?? '',
    setNodeEditingState: (elementKey, nextState, taskRef, targetRef) => webEditorController.setNodeEditingState(elementKey, nextState, taskRef, targetRef ?? null),
    getCopyPromptText: () => webEditorController.getCopyPromptText?.() ?? '',
    getDecisionDataCount: () => webEditorController.getDecisionDataCount(),
    getStatus: () => ({
      mode: currentMode,
      webEditor: webEditorController.getStatus(),
    }),
  };

  return {
    api,
    applyInitialMode,
    getMode: () => currentMode,
    getInitialMode: () => resolvedInitialMode,
  };
};
