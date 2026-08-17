import React from 'react';
import { WEB_EDITOR_V2_HOST_ID } from '../../constants';
import type { ViewportRect } from '../../overlay/canvas-overlay';
import type { CommentEntryMode } from '../selection-ui-mode';
import { isMobileDevice } from '../../utils/mobile-detect';
import { panelContainerStyle, WEB_EDITOR_POPUP_ROOT_STYLES } from './styles';
import { ElementAgentTaskOverlays } from './element-agent-task-overlays';
import { getAnnotationManualEditLocatorState, PromptCardView } from './prompt-card-view';
import { PropertyPanelView } from './property-panel-view';
import { syncDraftAgainstSaved } from './shared-state';
import { useFeedbackBridge } from './runtime-effects/use-feedback-bridge';
import { usePointerTracker } from './runtime-effects/use-pointer-tracker';
import { useSelectionModeGuards } from './runtime-effects/use-selection-mode-guards';
import { useClipboardCommentPaste } from './runtime-effects/use-clipboard-comment-paste';
import { useOutsideClickSelectionRestore } from './runtime-effects/use-outside-click-selection-restore';
import {
  MAX_PROMPT_IMAGE_ATTACHMENTS,
  createPromptImageAttachmentFromSvgText,
  isStandardSvgText,
  mergePromptImageAttachments,
  readPromptImageAttachmentsFromDataTransferItems,
  replaceUserPromptImageAttachments,
  splitPromptImageAttachments,
} from './image-attachments';
import {
  PROMPT_TEXT_LIMIT_MESSAGE,
  isPromptTextChangeAllowed,
} from './prompt-text-limit';
import { notifyRuntimeMessage } from './runtime-feedback';
import {
  insertLineBreakAtSelection,
  insertPlainTextAtSelection,
} from './plain-text-selection';
import { writeEditableText } from '../../core/text-content';
import type {
  SharedImageState,
  SharedAnnotationState,
  SharedNoteState,
  SharedTextState,
  WebEditorUiAppProps,
} from './types';
import type { PromptImageAttachment } from '../../core/editor/state';
import type {
  CommentarySkillOption,
} from '../../web-editor-types';
import {
  DEFAULT_WEB_EDITOR_UI_SETTINGS,
  applyInteractionProfileToUiSettings,
  applyMobileSettingsOverride,
  type WebEditorInteractionProfile,
  type WebEditorUiSettings,
  sanitizeWebEditorUiSettings,
} from '../../core/editor/ui-settings';

function normalizeRuntimeUiSettings(
  settings: unknown,
  interactionProfile: WebEditorInteractionProfile,
): WebEditorUiSettings {
  const normalized = applyMobileSettingsOverride(
    applyInteractionProfileToUiSettings(sanitizeWebEditorUiSettings(settings), interactionProfile),
  );

  if (interactionProfile !== 'design' || isMobileDevice()) {
    return normalized;
  }

  return {
    ...normalized,
    designAdjustmentTool: null,
    styleDesignEnabled: true,
  };
}

function replaceTextInControl(
  element: HTMLInputElement | HTMLTextAreaElement,
  currentValue: string,
  incomingText: string,
): string {
  const selectionStart = Number.isFinite(element.selectionStart ?? NaN)
    ? (element.selectionStart ?? currentValue.length)
    : currentValue.length;
  const selectionEnd = Number.isFinite(element.selectionEnd ?? NaN)
    ? (element.selectionEnd ?? currentValue.length)
    : currentValue.length;
  return currentValue.slice(0, selectionStart) + incomingText + currentValue.slice(selectionEnd);
}

function normalizeRuntimeUiMode(mode: CommentEntryMode | null | undefined): CommentEntryMode {
  return mode === 'panel-note' ? 'bubble-card' : (mode ?? 'bubble-card');
}

function focusEditableTextTarget(element: HTMLElement): void {
  element.focus({ preventScroll: true });

  const selection = window.getSelection?.();
  if (!selection) return;

  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Best-effort cursor placement.
  }
}

type InlineStyleSnapshot = {
  value: string;
  priority: string;
};

function snapshotInlineStyle(element: HTMLElement, property: string): InlineStyleSnapshot {
  return {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
}

function restoreInlineStyle(
  element: HTMLElement,
  property: string,
  snapshot: InlineStyleSnapshot,
): void {
  if (snapshot.value) {
    element.style.setProperty(property, snapshot.value, snapshot.priority);
    return;
  }
  element.style.removeProperty(property);
}

function normalizeRuntimeSkillIds(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of rawValues) {
    const id = String(item ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

function normalizeRuntimeSkillOptions(
  value: readonly CommentarySkillOption[] | null | undefined,
): CommentarySkillOption[] {
  const result: CommentarySkillOption[] = [];
  const seen = new Set<string>();
  for (const item of value ?? []) {
    const id = String(item.id ?? '').trim();
    const label = String(item.label ?? '').trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      label,
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
      ...(item.sourceUrl?.trim() ? { sourceUrl: item.sourceUrl.trim() } : {}),
      ...(item.prompt?.trim() ? { prompt: item.prompt.trim() } : {}),
      ...(item.custom === true ? { custom: true } : {}),
    });
  }
  return result;
}

function resolveRuntimeSkillIds(
  value: unknown,
  options: readonly { id: string }[] | undefined,
  configured: boolean,
): string[] {
  if (!configured) {
    return (options ?? []).map((item) => String(item.id ?? '').trim()).filter(Boolean);
  }
  return normalizeRuntimeSkillIds(value);
}

export function WebEditorUiApp(props: WebEditorUiAppProps): React.ReactElement {
  const {
    propertyPanelOptions,
    propertyPanelVisible = Boolean(propertyPanelOptions),
    initialPropertyPanelOpen = false,
    initialSelectionModeActive = true,
    toolbarMode: toolbarModeProp,
    breadcrumbsOptions,
    propertyPanelRef,
    breadcrumbsRef,
    onThemeModeChange,
  } = props;
  const options = { toolbarMode: toolbarModeProp };
  const toolbarMode = options.toolbarMode ?? 'inline';
  const isHostToolbarMode = toolbarMode === 'host';
  // PropertyPanelView keeps the host-mode chrome gate as:
  // isHostToolbarMode ? null : toolMinimized ? minimizedToolbar : expandedToolbar

  const initialUiMode = normalizeRuntimeUiMode(
    propertyPanelOptions?.getUiMode?.() ?? propertyPanelOptions?.initialUiMode ?? 'bubble-card',
  );
  const interactionProfile = propertyPanelOptions?.interactionProfile ?? 'design';

  const [currentTarget, setCurrentTarget] = React.useState<Element | null>(null);
  const [anchorRect, setAnchorRect] = React.useState<ViewportRect | null>(null);
  const [uiMode, setUiMode] = React.useState<CommentEntryMode>(initialUiMode);
  const [toolMinimized, setToolMinimized] = React.useState(false);
  const [propertyPanelOpen, setPropertyPanelOpen] = React.useState<boolean>(initialPropertyPanelOpen);
  const [bubbleStyleEditorOpen, setBubbleStyleEditorOpen] = React.useState(false);
  const [inlineTextEditing, setInlineTextEditing] = React.useState(false);
  const [inlineTextTarget, setInlineTextTarget] = React.useState<HTMLElement | null>(null);
  const [blockingLayerOpen, setBlockingLayerOpen] = React.useState(false);
  const [commentarySkillOptions, setCommentarySkillOptions] = React.useState<
    CommentarySkillOption[]
  >(() => normalizeRuntimeSkillOptions(propertyPanelOptions?.commentarySkillOptions));
  const commentarySkillSelectionManaged = commentarySkillOptions.length > 0;
  const [enabledCommentarySkillIds, setEnabledCommentarySkillIds] = React.useState<string[]>(() =>
    resolveRuntimeSkillIds(
      propertyPanelOptions?.commentarySelectedSkillIds,
      propertyPanelOptions?.commentarySkillOptions,
      propertyPanelOptions?.commentarySkillSettingsConfigured === true,
    ),
  );
  const [uiSettings, setUiSettings] = React.useState(() =>
    normalizeRuntimeUiSettings(
      propertyPanelOptions?.getUiSettings?.() ?? DEFAULT_WEB_EDITOR_UI_SETTINGS,
      interactionProfile,
    ),
  );
  const [agentVisualState, setAgentVisualState] = React.useState<'sleeping' | 'awake'>(() =>
    normalizeRuntimeUiSettings(
      propertyPanelOptions?.getUiSettings?.() ?? DEFAULT_WEB_EDITOR_UI_SETTINGS,
      interactionProfile,
    ).agentAwake
      ? 'awake'
      : 'sleeping',
  );
  const [noteState, setNoteState] = React.useState<SharedNoteState>({
    savedNote: '',
    draftNote: '',
    noteDirty: false,
    savedNoteMeta: { skillIds: [] },
  });
  const [textState, setTextState] = React.useState<SharedTextState>({
    savedText: '',
    draftText: '',
    textDirty: false,
  });
  const [imageState, setImageState] = React.useState<SharedImageState>({
    images: [],
  });
  const [annotationState, setAnnotationState] = React.useState<SharedAnnotationState>({
    annotationEnabled: false,
    savedAnnotationMarkdown: '',
    annotationDraftMarkdown: '',
    annotationDirty: false,
    annotationLoading: false,
    annotationSaving: false,
  });

  const currentTargetRef = React.useRef<Element | null>(null);
  const inlineTextTargetRef = React.useRef<HTMLElement | null>(null);
  const uiModeRef = React.useRef<CommentEntryMode>(initialUiMode);
  const noteStateRef = React.useRef<SharedNoteState>(noteState);
  const textStateRef = React.useRef<SharedTextState>(textState);
  const imageStateRef = React.useRef<SharedImageState>(imageState);
  const annotationStateRef = React.useRef<SharedAnnotationState>(annotationState);

  const latestPointerPositionRef = usePointerTracker();
  const selectionGuards = useSelectionModeGuards({
    propertyPanelOptions,
    initialSelectionModeActive,
    setToolMinimized,
  });
  const promptSelectionInteractionLockChangeRef = React.useRef(
    selectionGuards.handlePromptSelectionInteractionLockChange,
  );

  const finishInlineTextEditing = React.useCallback(() => {
    promptSelectionInteractionLockChangeRef.current(false);
    inlineTextTargetRef.current = null;
    setInlineTextTarget(null);
    setInlineTextEditing(false);
  }, []);

  useFeedbackBridge();

  React.useEffect(() => {
    promptSelectionInteractionLockChangeRef.current =
      selectionGuards.handlePromptSelectionInteractionLockChange;
  }, [selectionGuards.handlePromptSelectionInteractionLockChange]);

  React.useEffect(() => {
    noteStateRef.current = noteState;
  }, [noteState]);

  React.useEffect(() => {
    textStateRef.current = textState;
  }, [textState]);

  React.useEffect(() => {
    inlineTextTargetRef.current = inlineTextTarget;
  }, [inlineTextTarget]);

  React.useEffect(() => {
    imageStateRef.current = imageState;
  }, [imageState]);

  React.useEffect(() => {
    annotationStateRef.current = annotationState;
  }, [annotationState]);

  React.useEffect(() => {
    if (!commentarySkillSelectionManaged) return;
    const configured = propertyPanelOptions?.commentarySkillSettingsConfigured === true;
    const nextSkillOptions = normalizeRuntimeSkillOptions(
      propertyPanelOptions?.commentarySkillOptions,
    );
    setCommentarySkillOptions(nextSkillOptions);
    setEnabledCommentarySkillIds(
      resolveRuntimeSkillIds(
        propertyPanelOptions?.commentarySelectedSkillIds,
        nextSkillOptions,
        configured,
      ),
    );
  }, [
    commentarySkillSelectionManaged,
    propertyPanelOptions?.commentarySkillOptions,
    propertyPanelOptions?.commentarySelectedSkillIds,
    propertyPanelOptions?.commentarySkillSettingsConfigured,
  ]);

  React.useEffect(() => {
    const nextUiMode = normalizeRuntimeUiMode(propertyPanelOptions?.getUiMode?.());
    if (!nextUiMode || uiModeRef.current === nextUiMode) return;
    uiModeRef.current = nextUiMode;
    setUiMode(nextUiMode);
  });

  React.useEffect(() => {
    onThemeModeChange?.(uiSettings.darkMode ? 'dark' : 'light');
  }, [onThemeModeChange, uiSettings.darkMode]);

  React.useEffect(() => {
    const nextVisualState = uiSettings.agentAwake ? 'awake' : 'sleeping';
    setAgentVisualState((prev) => (prev === nextVisualState ? prev : nextVisualState));
  }, [uiSettings.agentAwake]);

  React.useEffect(() => {
    selectionGuards.toolMinimizedRef.current = toolMinimized;
  }, [selectionGuards.toolMinimizedRef, toolMinimized]);

  React.useEffect(() => {
    if (!propertyPanelVisible) {
      setPropertyPanelOpen(false);
    }
  }, [propertyPanelVisible]);

  const taskStateProvider = React.useMemo(
    () => ({
      getCurrentTask: (element: Element | null) =>
        propertyPanelOptions?.getElementAgentTaskState?.(element) ??
        breadcrumbsOptions?.getElementAgentTaskState?.(element) ??
        null,
      getVisibleTasks: () =>
        propertyPanelOptions?.getVisibleElementAgentTaskStates?.() ??
        breadcrumbsOptions?.getVisibleElementAgentTaskStates?.() ??
        [],
      dismissTask: (element: Element) => {
        propertyPanelOptions?.dismissElementAgentTaskState?.(element);
        breadcrumbsOptions?.dismissElementAgentTaskState?.(element);
      },
    }),
    [breadcrumbsOptions, propertyPanelOptions],
  );
  const [taskRenderTick, setTaskRenderTick] = React.useState(0);

  React.useEffect(() => {
    let previousSignature = '';
    const timerId = window.setInterval(() => {
      const tasks = taskStateProvider.getVisibleTasks();
      const signature = tasks
        .map((task) =>
          [
            task.elementKey,
            task.requestId,
            task.status,
            task.sessionId ?? '',
            task.updatedAt,
            task.dismissed ? '1' : '0',
          ].join(':'),
        )
        .join('|');

      if (tasks.length > 0 || signature !== previousSignature) {
        setTaskRenderTick((value) => value + 1);
      }
      previousSignature = signature;
    }, 120);

    return () => {
      window.clearInterval(timerId);
    };
  }, [taskStateProvider]);

  const syncSavedNote = React.useCallback(
    (element: Element | null, resetDraft: boolean) => {
      const nextSavedNote = propertyPanelOptions?.getAiNote?.(element) ?? '';
      const nextSkillIds = propertyPanelOptions?.getAiNoteSkillIds?.(element) ?? [];
      const prev = noteStateRef.current;
      const next = syncDraftAgainstSaved(
        {
          saved: prev.savedNote,
          draft: prev.draftNote,
          dirty: prev.noteDirty,
        },
        nextSavedNote,
        resetDraft,
      );
      const nextState = {
        savedNote: next.saved,
        draftNote: next.draft,
        noteDirty: next.dirty,
        savedNoteMeta: { skillIds: nextSkillIds.slice() },
      };
      noteStateRef.current = nextState;
      setNoteState(nextState);
    },
    [propertyPanelOptions],
  );

  const syncSavedText = React.useCallback(
    (element: Element | null, resetDraft: boolean) => {
      const canEditText = propertyPanelOptions?.canEditText?.(element) ?? false;
      const nextSavedText = canEditText
        ? (propertyPanelOptions?.getTextValue?.(element) ?? '')
        : '';
      const prev = textStateRef.current;
      const next = syncDraftAgainstSaved(
        {
          saved: prev.savedText,
          draft: prev.draftText,
          dirty: prev.textDirty,
        },
        nextSavedText,
        resetDraft,
      );
      const nextState = {
        savedText: next.saved,
        draftText: next.draft,
        textDirty: next.dirty,
      };
      textStateRef.current = nextState;
      setTextState(nextState);
    },
    [propertyPanelOptions],
  );

  const imageAttachmentsEnabled = propertyPanelOptions?.enableImageAttachments !== false;

  const syncSavedImages = React.useCallback(
    (element: Element | null) => {
      if (!imageAttachmentsEnabled) {
        setImageState({ images: [] });
        return;
      }
      const { userImages } = splitPromptImageAttachments(
        propertyPanelOptions?.getAiNoteImages?.(element) ?? [],
      );
      setImageState({
        images: userImages.slice(0, MAX_PROMPT_IMAGE_ATTACHMENTS),
      });
    },
    [imageAttachmentsEnabled, propertyPanelOptions],
  );

  const syncSavedAnnotationMarkdown = React.useCallback(
    (element: Element | null, resetDraft: boolean) => {
      const canEditAnnotationMarkdown = Boolean(
        element &&
          propertyPanelOptions?.canEditAnnotationMarkdown?.(element) &&
          propertyPanelOptions?.onAnnotationMarkdownChange,
      );
      const applySavedValue = (savedValue: string) => {
        const prev = annotationStateRef.current;
        const next = syncDraftAgainstSaved(
          {
            saved: prev.savedAnnotationMarkdown,
            draft: prev.annotationDraftMarkdown,
            dirty: prev.annotationDirty,
          },
          canEditAnnotationMarkdown ? savedValue : '',
          resetDraft,
        );
        const nextState = {
          ...prev,
          annotationEnabled: canEditAnnotationMarkdown,
          savedAnnotationMarkdown: next.saved,
          annotationDraftMarkdown: next.draft,
          annotationDirty: next.dirty,
          annotationLoading: false,
        };
        annotationStateRef.current = nextState;
        setAnnotationState(nextState);
      };

      if (!canEditAnnotationMarkdown) {
        applySavedValue('');
        return;
      }

      const maybeMarkdown = propertyPanelOptions?.getAnnotationMarkdown?.(element);
      if (maybeMarkdown && typeof (maybeMarkdown as Promise<string>).then === 'function') {
        const loadingState = {
          ...annotationStateRef.current,
          annotationEnabled: true,
          annotationLoading: true,
        };
        annotationStateRef.current = loadingState;
        setAnnotationState(loadingState);
        void Promise.resolve(maybeMarkdown)
          .then((value) => {
            if (currentTargetRef.current !== element) return;
            applySavedValue(String(value ?? ''));
          })
          .catch(() => {
            if (currentTargetRef.current !== element) return;
            applySavedValue('');
          });
        return;
      }

      applySavedValue(String(maybeMarkdown ?? ''));
    },
    [propertyPanelOptions],
  );

  const commitDraftNote = React.useCallback(
    async (elementOverride?: Element | null, options: { skillIds?: readonly string[] } = {}) => {
      const element = elementOverride ?? currentTargetRef.current;
      if (!propertyPanelOptions?.onAiNoteChange) return false;

      const nextValue = noteStateRef.current.draftNote;
      const nextSkillIds =
        options.skillIds?.slice() ?? noteStateRef.current.savedNoteMeta?.skillIds ?? [];
      const skillsDirty =
        nextSkillIds.join('\0') !== (noteStateRef.current.savedNoteMeta?.skillIds ?? []).join('\0');
      if (!noteStateRef.current.noteDirty && !skillsDirty) return false;

      await propertyPanelOptions.onAiNoteChange(element, nextValue, {
        skillIds: nextSkillIds,
      });

      if (currentTargetRef.current === element) {
        const nextState = {
          savedNote: nextValue,
          draftNote: nextValue,
          noteDirty: false,
          savedNoteMeta: { skillIds: nextSkillIds.slice() },
        };
        noteStateRef.current = nextState;
        setNoteState(nextState);
      }

      return true;
    },
    [propertyPanelOptions],
  );

  const commitDraftText = React.useCallback(
    async (elementOverride?: Element | null) => {
      const element = elementOverride ?? inlineTextTargetRef.current ?? currentTargetRef.current;
      if (!element || !propertyPanelOptions?.onTextValueChange) return false;
      if (!(propertyPanelOptions?.canEditText?.(element) ?? false)) return false;
      if (!textStateRef.current.textDirty) return false;

      const nextValue = textStateRef.current.draftText;
      await propertyPanelOptions.onTextValueChange(
        element,
        nextValue,
        textStateRef.current.savedText,
      );

      if (currentTargetRef.current === element || inlineTextTargetRef.current === element) {
        const nextState = {
          savedText: nextValue,
          draftText: nextValue,
          textDirty: false,
        };
        textStateRef.current = nextState;
        setTextState(nextState);
      }

      return true;
    },
    [propertyPanelOptions],
  );

  const commitDraftAnnotationMarkdown = React.useCallback(
    async (
      elementOverride?: Element | null,
      markdownOverride?: string,
      options: { force?: boolean } = {},
    ) => {
      const element = elementOverride ?? currentTargetRef.current;
      if (!element || !propertyPanelOptions?.onAnnotationMarkdownChange) return false;
      if (!(propertyPanelOptions?.canEditAnnotationMarkdown?.(element) ?? false)) return false;
      if (
        propertyPanelOptions.annotationMarkdownEditorKind !== 'document-source'
        && getAnnotationManualEditLocatorState(
          element,
          undefined,
          propertyPanelOptions.getCreateAnnotationBlockReason,
          propertyPanelOptions.resolveAnnotationTarget,
        ).disabled
      ) return false;

      const nextValue =
        typeof markdownOverride === 'string'
          ? markdownOverride
          : annotationStateRef.current.annotationDraftMarkdown;
      if (!options.force && nextValue === annotationStateRef.current.savedAnnotationMarkdown)
        return false;
      const savingState = {
        ...annotationStateRef.current,
        annotationDraftMarkdown: nextValue,
        annotationDirty: true,
        annotationSaving: true,
      };
      annotationStateRef.current = savingState;
      setAnnotationState(savingState);
      try {
        await propertyPanelOptions.onAnnotationMarkdownChange(element, nextValue);
        if (currentTargetRef.current === element) {
          const nextState = {
            ...annotationStateRef.current,
            annotationEnabled: true,
            savedAnnotationMarkdown: nextValue,
            annotationDraftMarkdown: nextValue,
            annotationDirty: false,
            annotationSaving: false,
          };
          annotationStateRef.current = nextState;
          setAnnotationState(nextState);
        }
        return true;
      } catch (error) {
        const nextState = {
          ...annotationStateRef.current,
          annotationSaving: false,
        };
        annotationStateRef.current = nextState;
        setAnnotationState(nextState);
        throw error;
      }
    },
    [propertyPanelOptions],
  );

  const handleTargetChange = React.useCallback(
    (element: Element | null) => {
      if (currentTargetRef.current === element) return;
      const previousTarget = currentTargetRef.current;
      const previousTextTarget = inlineTextTargetRef.current ?? previousTarget;
      finishInlineTextEditing();
      if (noteStateRef.current.noteDirty) {
        void commitDraftNote(previousTarget);
      }
      if (previousTextTarget && textStateRef.current.textDirty) {
        void commitDraftText(previousTextTarget);
      }
      currentTargetRef.current = element;
      setCurrentTarget(element);
      if (!element || !element.isConnected) {
        setAnchorRect(null);
      }
      selectionGuards.selectionNeedsExplicitReactivateRef.current = Boolean(
        element &&
          selectionGuards.selectionModeActiveRef.current &&
          !selectionGuards.toolMinimizedRef.current,
      );
      selectionGuards.syncSelectionModeAvailability();
      syncSavedNote(element, true);
      syncSavedText(element, true);
      syncSavedImages(element);
      syncSavedAnnotationMarkdown(element, true);
    },
    [
      commitDraftNote,
      commitDraftText,
      finishInlineTextEditing,
      selectionGuards,
      syncSavedAnnotationMarkdown,
      syncSavedImages,
      syncSavedNote,
      syncSavedText,
    ],
  );

  const handleAnchorRectChange = React.useCallback((rect: ViewportRect | null) => {
    setAnchorRect(rect);
  }, []);

  const handleUiModeChange = React.useCallback(
    (mode: CommentEntryMode) => {
      const normalizedMode = normalizeRuntimeUiMode(mode);
      if (uiModeRef.current === normalizedMode) return;
      uiModeRef.current = normalizedMode;
      setUiMode(normalizedMode);
      propertyPanelOptions?.onUiModeChange?.(normalizedMode);
      propertyPanelOptions?.onSelectionChromeVisibleChange?.(
        !selectionGuards.toolMinimizedRef.current,
      );
    },
    [propertyPanelOptions, selectionGuards.toolMinimizedRef],
  );

  const handleRefreshNoteState = React.useCallback(() => {
    syncSavedNote(currentTargetRef.current, false);
    syncSavedText(inlineTextTargetRef.current ?? currentTargetRef.current, false);
    syncSavedImages(currentTargetRef.current);
    syncSavedAnnotationMarkdown(currentTargetRef.current, false);
  }, [syncSavedAnnotationMarkdown, syncSavedImages, syncSavedNote, syncSavedText]);

  const handleUiSettingsChange = React.useCallback(
    (nextSettings: typeof uiSettings) => {
      const sanitized = normalizeRuntimeUiSettings(nextSettings, interactionProfile);
      setUiSettings(sanitized);
      propertyPanelOptions?.onUiSettingsChange?.(sanitized);
    },
    [interactionProfile, propertyPanelOptions],
  );

  const handleAgentVisualStateChange = React.useCallback(
    (nextState: 'sleeping' | 'awake') => {
      setAgentVisualState(nextState);
      setUiSettings((prev) => {
        const nextAwake = nextState === 'awake';
        if (prev.agentAwake === nextAwake) {
          return prev;
        }
        const sanitized = normalizeRuntimeUiSettings(
          {
            ...prev,
            agentAwake: nextAwake,
          },
          interactionProfile,
        );
        propertyPanelOptions?.onUiSettingsChange?.(sanitized);
        return sanitized;
      });
    },
    [interactionProfile, propertyPanelOptions],
  );

  const currentAgentTask = taskStateProvider.getCurrentTask(currentTarget);
  const currentTaskRunning =
    currentAgentTask?.status === 'pending' || currentAgentTask?.status === 'created';
  const canEditNote = Boolean(propertyPanelOptions?.onAiNoteChange);
  const annotationDocumentEditUrl = React.useMemo(() => {
    const resolver =
      breadcrumbsOptions?.getAnnotationDocumentEditUrl ??
      propertyPanelOptions?.getAnnotationDocumentEditUrl;
    return String(resolver?.(currentTarget) ?? '').trim();
  }, [breadcrumbsOptions, currentTarget, propertyPanelOptions]);
  const canStartInlineTextEditing = React.useCallback(
    (element: Element | null) => {
      if (!element || !element.isConnected) return false;
      if (!propertyPanelOptions?.onTextValueChange) return false;
      if (!(propertyPanelOptions?.canEditText?.(element) ?? false)) return false;
      const targetTask = taskStateProvider.getCurrentTask(element);
      const selectionTask = taskStateProvider.getCurrentTask(currentTargetRef.current);
      return (
        targetTask?.status !== 'pending'
        && targetTask?.status !== 'created'
        && selectionTask?.status !== 'pending'
        && selectionTask?.status !== 'created'
      );
    },
    [propertyPanelOptions, taskStateProvider],
  );
  const activeTextTarget = inlineTextTarget ?? currentTarget;
  const canEditText = canStartInlineTextEditing(activeTextTarget);

  const handleDraftChange = React.useCallback((value: string) => {
    const prev = noteStateRef.current;
    if (!isPromptTextChangeAllowed(prev.draftNote, value)) {
      notifyRuntimeMessage('warning', PROMPT_TEXT_LIMIT_MESSAGE);
      return;
    }
    const nextState = {
      ...prev,
      draftNote: value,
      noteDirty: value !== prev.savedNote,
    };
    noteStateRef.current = nextState;
    setNoteState(nextState);
  }, []);

  const handleCancelNote = React.useCallback(() => {
    const prev = noteStateRef.current;
    const nextState = {
      ...prev,
      draftNote: prev.savedNote,
      noteDirty: false,
    };
    noteStateRef.current = nextState;
    setNoteState(nextState);
  }, []);

  const handleConfirmNote = React.useCallback(
    async (options: { skillIds?: readonly string[] } = {}) => {
      await commitDraftNote(undefined, options);
    },
    [commitDraftNote],
  );

  const handleTextDraftChange = React.useCallback((value: string) => {
    const prev = textStateRef.current;
    const nextState = {
      ...prev,
      draftText: value,
      textDirty: value !== prev.savedText,
    };
    textStateRef.current = nextState;
    setTextState(nextState);
  }, []);

  const handleCancelText = React.useCallback(() => {
    const prev = textStateRef.current;
    const nextState = {
      ...prev,
      draftText: prev.savedText,
      textDirty: false,
    };
    textStateRef.current = nextState;
    setTextState(nextState);
  }, []);

  const handleConfirmText = React.useCallback(async () => {
    await commitDraftText(inlineTextTargetRef.current);
  }, [commitDraftText]);

  const handleAnnotationDraftChange = React.useCallback((value: string) => {
    const prev = annotationStateRef.current;
    const nextState = {
      ...prev,
      annotationDraftMarkdown: value,
      annotationDirty: value !== prev.savedAnnotationMarkdown,
    };
    annotationStateRef.current = nextState;
    setAnnotationState(nextState);
  }, []);

  const handleClearAnnotationMarkdown = React.useCallback(() => {
    void commitDraftAnnotationMarkdown(undefined, '', { force: true });
  }, [commitDraftAnnotationMarkdown]);

  const handleConfirmAnnotationMarkdown = React.useCallback(
    async (markdownOverride?: string) => {
      await commitDraftAnnotationMarkdown(undefined, markdownOverride);
    },
    [commitDraftAnnotationMarkdown],
  );

  const handleInlineTextEditingChange = React.useCallback(
    (editing: boolean, element?: HTMLElement | null) => {
      if (!editing) {
        finishInlineTextEditing();
        return;
      }
      const requestedTarget = element ?? currentTargetRef.current;
      const textTarget = requestedTarget instanceof HTMLElement ? requestedTarget : null;
      const allowed = canStartInlineTextEditing(textTarget);
      if (!allowed || !textTarget) {
        finishInlineTextEditing();
        return;
      }
      selectionGuards.handlePromptSelectionInteractionLockChange(true);
      inlineTextTargetRef.current = textTarget;
      setInlineTextTarget(textTarget);
      syncSavedText(textTarget, true);
      setInlineTextEditing(true);
    },
    [canStartInlineTextEditing, finishInlineTextEditing, selectionGuards, syncSavedText],
  );

  const handleImagesChange = React.useCallback(
    async (images: readonly PromptImageAttachment[]) => {
      const element = currentTargetRef.current;
      if (!imageAttachmentsEnabled) return;
      if (!element || !propertyPanelOptions?.onAiNoteImagesChange) return;
      const clippedImages = images
        .filter((image) => image.source !== 'target-screenshot')
        .slice(0, MAX_PROMPT_IMAGE_ATTACHMENTS);
      const nextImages = replaceUserPromptImageAttachments(
        propertyPanelOptions.getAiNoteImages?.(element) ?? [],
        clippedImages,
      );
      await propertyPanelOptions.onAiNoteImagesChange(element, nextImages);
      if (currentTargetRef.current === element) {
        setImageState({ images: clippedImages.slice() });
      }
    },
    [imageAttachmentsEnabled, propertyPanelOptions],
  );

  const handleRemoveImage = React.useCallback(
    async (imageId: string) => {
      const nextImages = imageStateRef.current.images.filter((image) => image.id !== imageId);
      await handleImagesChange(nextImages);
    },
    [handleImagesChange],
  );

  const applyImagesToElement = React.useCallback(
    async (element: Element, incomingImages: readonly PromptImageAttachment[]) => {
      if (!imageAttachmentsEnabled) {
        return { acceptedCount: 0, droppedCount: incomingImages.length };
      }
      if (!incomingImages.length || !propertyPanelOptions?.onAiNoteImagesChange) {
        return { acceptedCount: 0, droppedCount: 0 };
      }
      let preparedImages = incomingImages;
      try {
        preparedImages = propertyPanelOptions.onPrepareAiNoteImages
          ? await propertyPanelOptions.onPrepareAiNoteImages(element, incomingImages)
          : incomingImages;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifyRuntimeMessage('error', message || '图片保存失败，请重新粘贴后再试。');
        return { acceptedCount: 0, droppedCount: incomingImages.length };
      }
      if (!preparedImages.length) {
        return { acceptedCount: 0, droppedCount: incomingImages.length };
      }
      const currentImages = propertyPanelOptions.getAiNoteImages?.(element) ?? [];
      const { userImages: currentUserImages } = splitPromptImageAttachments(currentImages);
      const merged = mergePromptImageAttachments(
        currentUserImages,
        preparedImages,
        MAX_PROMPT_IMAGE_ATTACHMENTS,
      );
      const nextImages = replaceUserPromptImageAttachments(currentImages, merged.images);
      await propertyPanelOptions.onAiNoteImagesChange(element, nextImages);
      if (currentTargetRef.current === element) {
        setImageState({ images: merged.images.slice() });
      }
      if (merged.droppedCount > 0) {
        notifyRuntimeMessage(
          'info',
          `最多允许 ${MAX_PROMPT_IMAGE_ATTACHMENTS} 张图片，已忽略多余图片。`,
        );
      }
      return {
        acceptedCount: merged.acceptedCount,
        droppedCount: merged.droppedCount,
      };
    },
    [imageAttachmentsEnabled, propertyPanelOptions],
  );

  const handleNotePasteCapture = React.useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const element = currentTargetRef.current;
      const clipboardItems = event.clipboardData?.items;
      const clipboardText = event.clipboardData?.getData('text/plain') ?? '';
      const hasImageItems = Boolean(clipboardItems?.length) && Array.from(clipboardItems).some(
        (item) => item.kind === 'file' && String(item.type ?? '').startsWith('image/'),
      );
      const target = event.target instanceof HTMLTextAreaElement ? event.target : null;
      const currentDraft = noteStateRef.current.draftNote;
      const nextDraft = clipboardText
        ? target
          ? replaceTextInControl(target, currentDraft, clipboardText)
          : currentDraft + clipboardText
        : currentDraft;
      const canAttachImages = Boolean(
        imageAttachmentsEnabled && element && propertyPanelOptions?.onAiNoteImagesChange,
      );

      if (canAttachImages && !hasImageItems && isStandardSvgText(clipboardText)) {
        event.preventDefault();
        event.stopPropagation();

        void (async () => {
          const svgImage = await createPromptImageAttachmentFromSvgText(clipboardText);
          if (!svgImage) return;
          await applyImagesToElement(element!, [svgImage]);
        })();
        return;
      }

      const plainTextAllowed =
        !clipboardText || isPromptTextChangeAllowed(currentDraft, nextDraft);

      if (!hasImageItems) {
        if (!plainTextAllowed) {
          event.preventDefault();
          event.stopPropagation();
          notifyRuntimeMessage('warning', PROMPT_TEXT_LIMIT_MESSAGE);
        }
        return;
      }

      if (!canAttachImages) {
        if (!plainTextAllowed) {
          event.preventDefault();
          event.stopPropagation();
          notifyRuntimeMessage('warning', PROMPT_TEXT_LIMIT_MESSAGE);
        }
        return;
      }

      const shouldInsertClipboardText = Boolean(
        target && clipboardText && !isStandardSvgText(clipboardText),
      );
      const shouldRejectClipboardText = shouldInsertClipboardText && !plainTextAllowed;
      event.preventDefault();
      event.stopPropagation();
      if (shouldRejectClipboardText) {
        notifyRuntimeMessage('warning', PROMPT_TEXT_LIMIT_MESSAGE);
      }

      void (async () => {
        const images = await readPromptImageAttachmentsFromDataTransferItems(clipboardItems);
        if (!images.length) return;

        if (shouldInsertClipboardText && !shouldRejectClipboardText) {
          const prev = noteStateRef.current;
          const nextState = {
            ...prev,
            draftNote: nextDraft,
            noteDirty: nextDraft !== prev.savedNote,
          };
          noteStateRef.current = nextState;
          setNoteState(nextState);
        }

        await applyImagesToElement(element!, images);
      })();
    },
    [applyImagesToElement, imageAttachmentsEnabled, propertyPanelOptions],
  );

  const handleClearCurrentElementEdits = React.useCallback(async () => {
    const element = currentTargetRef.current;
    if (!element || !propertyPanelOptions?.onClearCurrentElementEdits) return;

    const didClear = await propertyPanelOptions.onClearCurrentElementEdits(element);
    if (!didClear) return;

    syncSavedNote(element, true);
    syncSavedText(element, true);
    syncSavedImages(element);
    syncSavedAnnotationMarkdown(element, true);
    finishInlineTextEditing();
    propertyPanelOptions.onDismissSelection?.();
  }, [
    finishInlineTextEditing,
    propertyPanelOptions,
    syncSavedAnnotationMarkdown,
    syncSavedImages,
    syncSavedNote,
    syncSavedText,
  ]);

  const handleDeleteCurrentAnnotationNode = React.useCallback(async () => {
    const element = currentTargetRef.current;
    if (!element || !propertyPanelOptions?.onDeleteCurrentAnnotationNode) return;

    await propertyPanelOptions.onDeleteCurrentAnnotationNode(element);

    syncSavedNote(element, true);
    syncSavedText(element, true);
    syncSavedImages(element);
    syncSavedAnnotationMarkdown(element, true);
    finishInlineTextEditing();
    propertyPanelOptions.onDismissSelection?.();
  }, [
    finishInlineTextEditing,
    propertyPanelOptions,
    syncSavedAnnotationMarkdown,
    syncSavedImages,
    syncSavedNote,
    syncSavedText,
  ]);

  const handleSendCurrentElementPromptToAgent = React.useMemo(() => {
    if (!propertyPanelOptions?.onSendCurrentElementPromptToAgent) {
      return undefined;
    }

    return async (element: Element) => {
      await commitDraftText(element);
      await commitDraftNote(element);
      await propertyPanelOptions.onSendCurrentElementPromptToAgent?.(element);
    };
  }, [commitDraftNote, commitDraftText, propertyPanelOptions]);

  useClipboardCommentPaste({
    propertyPanelOptions,
    currentTargetRef,
    latestPointerPositionRef,
    isSelectionModeActive: selectionGuards.isSelectionModeActive,
    selectionNeedsExplicitReactivateRef: selectionGuards.selectionNeedsExplicitReactivateRef,
    onApplyImagesToElement: imageAttachmentsEnabled ? applyImagesToElement : undefined,
  });

  useOutsideClickSelectionRestore({
    selectionInteractionLockOwnersRef: selectionGuards.selectionInteractionLockOwnersRef,
    selectionHoverOwnersRef: selectionGuards.selectionHoverOwnersRef,
    selectionNeedsExplicitReactivateRef: selectionGuards.selectionNeedsExplicitReactivateRef,
    syncSelectionModeAvailability: selectionGuards.syncSelectionModeAvailability,
  });

  React.useEffect(() => {
    if (!inlineTextEditing) return;
    if (canEditText && activeTextTarget?.isConnected) return;
    const previousTextTarget = inlineTextTargetRef.current;
    if (previousTextTarget?.isConnected && textStateRef.current.textDirty) {
      writeEditableText(previousTextTarget, textStateRef.current.savedText);
    }
    handleCancelText();
    finishInlineTextEditing();
  }, [
    activeTextTarget,
    canEditText,
    finishInlineTextEditing,
    handleCancelText,
    inlineTextEditing,
  ]);

  React.useEffect(() => {
    const editableElement =
      inlineTextEditing && canEditText && activeTextTarget instanceof HTMLElement
        ? activeTextTarget
        : null;
    propertyPanelOptions?.onInlineTextEditingElementChange?.(editableElement);

    if (!editableElement) {
      return () => {
        propertyPanelOptions?.onInlineTextEditingElementChange?.(null);
      };
    }

    const exitInlineTextEditing = finishInlineTextEditing;

    const previousContentEditableAttr = editableElement.getAttribute('contenteditable');
    const previousSpellcheck = editableElement.spellcheck;
    const previousOutline = snapshotInlineStyle(editableElement, 'outline');
    const previousOutlineOffset = snapshotInlineStyle(editableElement, 'outline-offset');
    const previousBoxShadow = snapshotInlineStyle(editableElement, 'box-shadow');
    const previousCursor = snapshotInlineStyle(editableElement, 'cursor');

    editableElement.setAttribute('contenteditable', 'plaintext-only');
    editableElement.spellcheck = false;
    editableElement.style.setProperty('outline', 'none', 'important');
    editableElement.style.setProperty('outline-offset', '0px', 'important');
    editableElement.style.setProperty('box-shadow', 'none', 'important');
    editableElement.style.setProperty('cursor', 'text', 'important');

    const syncDraftFromDom = () => {
      const nextValue =
        propertyPanelOptions?.getTextValue?.(editableElement) ?? editableElement.textContent ?? '';
      const prev = textStateRef.current;
      const nextState = {
        ...prev,
        draftText: nextValue,
        textDirty: nextValue !== prev.savedText,
      };
      textStateRef.current = nextState;
      setTextState(nextState);
    };

    const handleInput = () => {
      syncDraftFromDom();
    };

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const plainText = event.clipboardData?.getData('text/plain') ?? '';
      if (!plainText) return;

      if (insertPlainTextAtSelection(editableElement, plainText)) {
        syncDraftFromDom();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (event.key === 'Enter' && !isMobileDevice()) {
        event.preventDefault();
        event.stopPropagation();
        if (event.metaKey || event.ctrlKey) {
          syncDraftFromDom();
          void (async () => {
            await commitDraftText(editableElement);
            exitInlineTextEditing();
            editableElement.blur();
          })();
        } else if (insertLineBreakAtSelection(editableElement)) {
          syncDraftFromDom();
        }
        return;
      }

      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      writeEditableText(editableElement, textStateRef.current.savedText);
      handleCancelText();
      exitInlineTextEditing();
      editableElement.blur();
    };

    const handleBeforeInput = (event: InputEvent) => {
      if (!isMobileDevice()) return;
      if (event.inputType !== 'insertParagraph' && event.inputType !== 'insertLineBreak') return;
      event.preventDefault();
      event.stopPropagation();
      if (insertLineBreakAtSelection(editableElement)) {
        syncDraftFromDom();
      }
    };

    const handleBlur = () => {
      syncDraftFromDom();
      void (async () => {
        if (textStateRef.current.textDirty) {
          await commitDraftText(editableElement);
        }
        exitInlineTextEditing();
      })();
    };

    editableElement.addEventListener('input', handleInput);
    editableElement.addEventListener('beforeinput', handleBeforeInput);
    editableElement.addEventListener('paste', handlePaste);
    editableElement.addEventListener('keydown', handleKeyDown);
    editableElement.addEventListener('blur', handleBlur);

    const editorHostCandidate = editableElement.ownerDocument.getElementById(WEB_EDITOR_V2_HOST_ID);
    const editorHost = editorHostCandidate instanceof HTMLDivElement ? editorHostCandidate : null;
    const editorShadowRoot = editorHost?.shadowRoot ?? null;
    let restoreFocusRafId: number | null = null;

    const scheduleEditableFocusRestore = () => {
      if (restoreFocusRafId !== null) return;
      restoreFocusRafId = window.requestAnimationFrame(() => {
        restoreFocusRafId = null;
        if (!editableElement.isConnected) return;

        const shadowActiveElement = editorShadowRoot?.activeElement;
        const documentActiveElement = editableElement.ownerDocument.activeElement;
        const shadowUiOwnsFocus =
          shadowActiveElement instanceof HTMLElement || documentActiveElement === editorHost;
        if (!shadowUiOwnsFocus) return;

        if (shadowActiveElement instanceof HTMLElement) {
          shadowActiveElement.blur();
        }
        if (
          documentActiveElement instanceof HTMLElement &&
          documentActiveElement !== editableElement &&
          documentActiveElement !== editableElement.ownerDocument.body &&
          documentActiveElement !== editorHost
        ) {
          documentActiveElement.blur();
        }
        focusEditableTextTarget(editableElement);
      });
    };

    const handleShadowFocusIn = (event: Event) => {
      if (event.target === editableElement) return;
      scheduleEditableFocusRestore();
    };

    const handleDocumentFocusIn = (event: Event) => {
      if (event.target === editorHost) {
        scheduleEditableFocusRestore();
      }
    };

    if (editorShadowRoot) {
      editorShadowRoot.addEventListener('focusin', handleShadowFocusIn, true);
    }
    editableElement.ownerDocument.addEventListener('focusin', handleDocumentFocusIn, true);

    const rafId = window.requestAnimationFrame(() => {
      focusEditableTextTarget(editableElement);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (restoreFocusRafId !== null) {
        window.cancelAnimationFrame(restoreFocusRafId);
      }
      editableElement.removeEventListener('input', handleInput);
      editableElement.removeEventListener('beforeinput', handleBeforeInput);
      editableElement.removeEventListener('paste', handlePaste);
      editableElement.removeEventListener('keydown', handleKeyDown);
      editableElement.removeEventListener('blur', handleBlur);
      if (editorShadowRoot) {
        editorShadowRoot.removeEventListener('focusin', handleShadowFocusIn, true);
      }
      editableElement.ownerDocument.removeEventListener('focusin', handleDocumentFocusIn, true);
      if (previousContentEditableAttr === null) {
        editableElement.removeAttribute('contenteditable');
      } else {
        editableElement.setAttribute('contenteditable', previousContentEditableAttr);
      }
      editableElement.spellcheck = previousSpellcheck;
      restoreInlineStyle(editableElement, 'outline', previousOutline);
      restoreInlineStyle(editableElement, 'outline-offset', previousOutlineOffset);
      restoreInlineStyle(editableElement, 'box-shadow', previousBoxShadow);
      restoreInlineStyle(editableElement, 'cursor', previousCursor);
      propertyPanelOptions?.onInlineTextEditingElementChange?.(null);
    };
  }, [
    activeTextTarget,
    canEditText,
    commitDraftText,
    finishInlineTextEditing,
    handleCancelText,
    inlineTextEditing,
    propertyPanelOptions,
  ]);

  return (
    <div style={panelContainerStyle}>
      <style>{WEB_EDITOR_POPUP_ROOT_STYLES}</style>
      <ElementAgentTaskOverlays
        tasks={blockingLayerOpen ? [] : taskStateProvider.getVisibleTasks()}
        subscribeSessionActivity={propertyPanelOptions?.subscribeSessionActivity}
        onDismissTask={taskStateProvider.dismissTask}
        renderTick={taskRenderTick}
      />
      {breadcrumbsOptions ? (
        <PromptCardView
          ref={breadcrumbsRef}
          options={breadcrumbsOptions}
          currentTarget={currentTarget}
          anchorRect={anchorRect}
          uiMode={uiMode}
          interactionProfile={interactionProfile}
          transactionManager={propertyPanelOptions?.transactionManager}
          tokensService={propertyPanelOptions?.tokensService}
          designAdjustmentTool={uiSettings.designAdjustmentTool}
          toolMinimized={toolMinimized}
          propertyPanelEnabled={propertyPanelVisible}
          styleDesignEnabled={uiSettings.styleDesignEnabled}
          bubbleStyleEditorOpen={bubbleStyleEditorOpen}
          agentVisualState={agentVisualState}
          hideExecutionControls={Boolean(
            breadcrumbsOptions.hideExecutionControls ?? propertyPanelOptions?.hideExecutionControls,
          )}
          hideCurrentElementExecutionAction={Boolean(
            propertyPanelOptions?.hideCurrentElementExecutionAction,
          )}
          hideContextAppendAction={Boolean(
            breadcrumbsOptions.hideExecutionControls ?? propertyPanelOptions?.hideExecutionControls,
          )}
          enabledSkillIds={commentarySkillSelectionManaged ? enabledCommentarySkillIds : undefined}
          skillOptions={commentarySkillOptions}
          onBubbleStyleEditorOpenChange={setBubbleStyleEditorOpen}
          onSendCurrentElementPromptToAgent={handleSendCurrentElementPromptToAgent}
          onWakeAgent={propertyPanelOptions?.onWakeAgent}
          onAgentVisualStateChange={handleAgentVisualStateChange}
          getAgentBridgeConnected={propertyPanelOptions?.getAgentBridgeConnected}
          getHasReusableAgentConversation={propertyPanelOptions?.getHasReusableAgentConversation}
          getSendCurrentElementPromptToAgentBlockReason={
            propertyPanelOptions?.getSendCurrentElementPromptToAgentBlockReason
          }
          canExportSelectionToDesignTool={propertyPanelOptions?.canExportSelectionToDesignTool}
          onExportSelectionToDesignTool={propertyPanelOptions?.onExportSelectionToDesignTool}
          getExportSelectionToDesignToolBlockReason={
            propertyPanelOptions?.getExportSelectionToDesignToolBlockReason
          }
          onHoverSelectionSuppressedChange={
            selectionGuards.handlePromptHoverSelectionSuppressedChange
          }
          onSelectionInteractionLockChange={
            selectionGuards.handlePromptSelectionInteractionLockChange
          }
          onUiModeChange={handleUiModeChange}
          onTargetChange={handleTargetChange}
          onAnchorRectChange={handleAnchorRectChange}
          onPromptCardVisibleChange={propertyPanelOptions?.onPromptCardVisibleChange}
          inlineTextEditing={inlineTextEditing}
          onInlineTextEditingChange={handleInlineTextEditingChange}
          canEditText={canEditText}
          images={imageState.images}
          onImagesChange={handleImagesChange}
          onRemoveImage={handleRemoveImage}
          onNotePasteCapture={handleNotePasteCapture}
          savedText={textState.savedText}
          draftText={textState.draftText}
          textDirty={textState.textDirty}
          onTextDraftChange={handleTextDraftChange}
          onCancelText={handleCancelText}
          onConfirmText={handleConfirmText}
          canEditNote={canEditNote}
          savedNote={noteState.savedNote}
          savedNoteMeta={noteState.savedNoteMeta}
          draftNote={noteState.draftNote}
          noteDirty={noteState.noteDirty}
          onDraftChange={handleDraftChange}
          onClearCurrentElementEdits={handleClearCurrentElementEdits}
          onCancelNote={handleCancelNote}
          onConfirmNote={handleConfirmNote}
          onDismissSelection={propertyPanelOptions?.onDismissSelection}
          annotationEnabled={annotationState.annotationEnabled}
          canEditAnnotationMarkdown={annotationState.annotationEnabled}
          annotationDocumentEditUrl={annotationDocumentEditUrl}
          annotationDraftMarkdown={annotationState.annotationDraftMarkdown}
          annotationDirty={annotationState.annotationDirty}
          annotationLoading={annotationState.annotationLoading}
          annotationSaving={annotationState.annotationSaving}
          onAnnotationDraftChange={handleAnnotationDraftChange}
          onClearAnnotationMarkdown={handleClearAnnotationMarkdown}
          onConfirmAnnotationMarkdown={handleConfirmAnnotationMarkdown}
          onDeleteCurrentAnnotationNode={handleDeleteCurrentAnnotationNode}
        />
      ) : null}
      {propertyPanelOptions && propertyPanelVisible ? (
        <PropertyPanelView
          ref={propertyPanelRef}
          options={propertyPanelOptions}
          currentTarget={currentTarget}
          uiMode={uiMode}
          toolMinimized={toolMinimized}
          selectionModeActive={selectionGuards.selectionModeActive}
          propertyPanelVisible={propertyPanelVisible}
          propertyPanelOpen={propertyPanelOpen}
          inlineTextEditing={inlineTextEditing}
          uiSettings={uiSettings}
          interactionProfile={interactionProfile}
          agentVisualState={agentVisualState}
          agentProviderAvailabilities={
            propertyPanelOptions?.getAgentProviderAvailabilities?.() ?? []
          }
          onPropertyPanelOpenChange={setPropertyPanelOpen}
          onAgentVisualStateChange={handleAgentVisualStateChange}
          onUiSettingsChange={handleUiSettingsChange}
          onRefreshAgentProviderAvailabilities={
            propertyPanelOptions?.refreshAgentProviderAvailabilities
          }
          onHoverSelectionSuppressedChange={
            selectionGuards.handlePanelHoverSelectionSuppressedChange
          }
          onSelectionInteractionLockChange={
            selectionGuards.handlePanelSelectionInteractionLockChange
          }
          onUiModeChange={handleUiModeChange}
          onToolMinimizedChange={selectionGuards.handleToolMinimizedChange}
          onSelectionModeActiveChange={selectionGuards.handleSelectionModeActiveChange}
          onTargetChange={handleTargetChange}
          onRefreshNoteState={handleRefreshNoteState}
          onInlineTextEditingChange={handleInlineTextEditingChange}
          onBlockingLayerOpenChange={setBlockingLayerOpen}
          toolbarMode={isHostToolbarMode ? 'host' : 'inline'}
          onHostToolbarStateChange={propertyPanelOptions?.onHostToolbarStateChange}
          canEditText={canEditText}
          images={imageState.images}
          onImagesChange={handleImagesChange}
          onRemoveImage={handleRemoveImage}
          onNotePasteCapture={handleNotePasteCapture}
          savedText={textState.savedText}
          draftText={textState.draftText}
          textDirty={textState.textDirty}
          onTextDraftChange={handleTextDraftChange}
          onCancelText={handleCancelText}
          onConfirmText={handleConfirmText}
          canEditNote={canEditNote}
          savedNote={noteState.savedNote}
          savedNoteMeta={noteState.savedNoteMeta}
          draftNote={noteState.draftNote}
          noteDirty={noteState.noteDirty}
          onDraftChange={handleDraftChange}
          onClearCurrentElementEdits={handleClearCurrentElementEdits}
          onCancelNote={handleCancelNote}
          onConfirmNote={handleConfirmNote}
          onDismissSelection={propertyPanelOptions?.onDismissSelection}
          annotationEnabled={annotationState.annotationEnabled}
          canEditAnnotationMarkdown={annotationState.annotationEnabled}
          annotationDocumentEditUrl={annotationDocumentEditUrl}
          annotationDraftMarkdown={annotationState.annotationDraftMarkdown}
          annotationDirty={annotationState.annotationDirty}
          annotationLoading={annotationState.annotationLoading}
          annotationSaving={annotationState.annotationSaving}
          onAnnotationDraftChange={handleAnnotationDraftChange}
          onClearAnnotationMarkdown={handleClearAnnotationMarkdown}
          onConfirmAnnotationMarkdown={handleConfirmAnnotationMarkdown}
          onDeleteCurrentAnnotationNode={handleDeleteCurrentAnnotationNode}
        />
      ) : null}
    </div>
  );
}
