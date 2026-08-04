import React from 'react';
import { isMobileDevice } from '../../utils/mobile-detect';
import { createPortal } from 'react-dom';
import { MobileSelectionOverlay } from './mobile-selection-overlay';
import {
  CaretRightFilled,
  CheckCircleFilled,
  ClearOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExclamationCircleFilled,
  ExportOutlined,
  FileTextOutlined,
  FormatPainterOutlined,
} from '@ant-design/icons';
import { Dropdown, Input, Popconfirm } from 'antd';
import { computePromptCardPosition } from '../prompt-card-position';
import {
  getDesignToolExportActionState,
  triggerDesignToolExportAction,
} from '../design-tool-export-action';
import {
  getAgentPromptBubbleActionState,
  isAgentPromptActionVisible,
  triggerAgentPromptAction,
} from '../agent-prompt-action';
import { executePromptCardCurrentElementAction } from './prompt-card-actions';
import { resolvePromptCardCloseActionTitle } from './prompt-card-shortcut-label';
import { CloseToolIcon, AgentSparkleIcon, IconActionButton } from './action-buttons';
import { resolveExternalEditingStatusDescription } from './external-editing-status-hint';
import { deriveAgentUiState } from './agent-ui-state';
import { PromptImageStrip } from './prompt-image-strip';
import { PromptCardDesignEditor } from './prompt-card-design-editor';
import { resolveRuntimePopupContainer } from './popup-container';
import {
  addPromptCardSkillSelection,
  buildPromptCardSkillSavePayload,
  clearPromptCardSkillTrigger,
  deserializePromptCardSkillSelection,
  filterPromptCardSkills,
  findPromptCardSkillTrigger,
  mergePromptCardSkills,
  type PromptCardSkill,
} from './prompt-card-skills';
import { promptCardStyle } from './styles';
import {
  ANCHOR_GAP_PX,
  EDITOR_CHROME,
  POPUP_LAYER_Z_INDEX,
  PROMPT_CARD_ESTIMATED_HEIGHT,
  PROMPT_CARD_WIDTH,
  PROPERTY_PANEL_RIGHT,
  PROPERTY_PANEL_WIDTH,
  SAFE_PADDING_PX,
  TEXT_INPUT_PLACEHOLDER,
  WEB_EDITOR_POPUP_ROOT_ATTR,
} from './theme';
import type { BreadcrumbsHandle, PromptCardSize, PromptCardViewProps } from './types';
import { formatModifierShortcutLabel } from '../../core/editor/comment-shortcut-settings';
import { createElementLocator, locateElement } from '../../core/locator';
import type { ElementLocator } from '../../web-editor-types';

function normalizePromptStyleSummaryLine(line: string): string {
  return line.replace(/^样式\s+/u, '').trim();
}

function compactPromptStyleSummaryLines(lines: readonly string[], maxLines = 2): string[] {
  const normalized = lines
    .map((line) => normalizePromptStyleSummaryLine(String(line ?? '')))
    .filter(Boolean);

  if (normalized.length <= maxLines) return normalized;
  const visibleLines = normalized.slice(0, maxLines);
  const overflowCount = normalized.length - maxLines;
  const lastLine = normalized[normalized.length - 1] ?? '';
  if (lastLine.startsWith('还有 ')) {
    return [...visibleLines.slice(0, Math.max(0, maxLines - 1)), lastLine];
  }
  return [...visibleLines, `还有 ${overflowCount} 项样式修改...`];
}

const PROMPT_PRIMARY_FOCUS_EXEMPT_SELECTOR = [
  '[data-we-prompt-primary-focus-exempt="true"]',
  '.ant-color-picker-trigger',
  '.ant-input-number',
  '.ant-segmented',
  '.ant-select',
  '.ant-slider',
  'a[href]',
  'button',
  'input',
  'label',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="button"]',
  '[role="slider"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[tabindex]',
].join(', ');
const PARENT_SELECT_INPUT_TOUCHED_ATTR = 'data-we-parent-select-input-touched';
type AnnotationInputMode = 'edit' | 'generate';
const ANNOTATION_INPUT_MODE_STORAGE_KEY = 'axhub-commentary-annotation-input-mode';
let annotationInputModeFallback: AnnotationInputMode = 'generate';

function readAnnotationInputModePreference(): AnnotationInputMode {
  try {
    const storedMode = globalThis.localStorage?.getItem(ANNOTATION_INPUT_MODE_STORAGE_KEY);
    if (storedMode === 'edit' || storedMode === 'generate') {
      annotationInputModeFallback = storedMode;
    }
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
  return annotationInputModeFallback;
}

function writeAnnotationInputModePreference(mode: AnnotationInputMode): void {
  annotationInputModeFallback = mode;
  try {
    globalThis.localStorage?.setItem(ANNOTATION_INPUT_MODE_STORAGE_KEY, mode);
  } catch {
    // The in-memory preference still survives runtime remounts in this page.
  }
}

function shouldRestorePromptPrimaryFocusFromTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  return !target.closest(PROMPT_PRIMARY_FOCUS_EXEMPT_SELECTOR);
}

const ANNOTATION_GENERATION_PLACEHOLDER = '输入给 AI 的标注需求，说明生成要求';

function resolvePromptCardNotePlaceholder(isAnnotationSession: boolean): string {
  return isAnnotationSession
    ? ANNOTATION_GENERATION_PLACEHOLDER
    : '输入给 AI 的需求，/ 选择技能';
}

const ANNOTATION_PANEL_NODE_ID_ATTR = 'data-axhub-annotation-panel-node-id';
const ANNOTATION_MARKER_NODE_ID_ATTR = 'data-axhub-annotation-node-id';

const ANNOTATION_MANUAL_EDIT_DISABLED_MESSAGE =
  '无法准确定位标注位置，该标注需要由 AI 生成';
const ANNOTATION_MARKDOWN_PLACEHOLDER =
  '输入需求标注，支持 Markdown 格式。输入后即可创建标注节点。建议由 AI 创建标注，定位会更准确。';
const DOCUMENT_SOURCE_MARKDOWN_PLACEHOLDER =
  '编辑所选内容对应的原始 Markdown。保存后会直接更新本地文档。';
const ANNOTATION_EDITOR_PROMPT_CARD_WIDTH = 320;
const annotationEditorShellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 0,
};
const annotationEditorInputStyle: React.CSSProperties = {
  overflow: 'hidden',
  border: `1px solid ${EDITOR_CHROME.borderStrong}`,
  borderRadius: 12,
  background: EDITOR_CHROME.surfaceMuted,
  boxShadow: `inset 0 0 0 1px ${EDITOR_CHROME.surface}`,
  cursor: 'text',
};

function isAnnotationPanelTarget(element: Element | null): boolean {
  if (!element) return false;
  if (element.getAttribute('data-axhub-annotation-panel-target') === 'true') {
    return true;
  }
  return Boolean(element.closest?.('[data-axhub-annotation-panel-target="true"]'));
}

function readCurrentAnnotationNodeId(element: Element | null): string {
  if (!element) return '';
  for (const attr of [ANNOTATION_PANEL_NODE_ID_ATTR, ANNOTATION_MARKER_NODE_ID_ATTR]) {
    const direct = element.getAttribute?.(attr)?.trim();
    if (direct) return direct;
    const closest = element.closest?.(`[${attr}]`);
    const closestNodeId = closest?.getAttribute?.(attr)?.trim();
    if (closestNodeId) return closestNodeId;
  }
  return '';
}

export function getAnnotationManualEditLocatorState(
  element: Element | null,
  resolveLocator: (locator: ElementLocator) => Element | null = locateElement,
  getCreateBlockReason?: (element: Element | null) => string | undefined,
  resolveAnnotationTarget?: (element: Element | null) => Element | null,
): { disabled: boolean; message: string } {
  const annotationTarget = resolveAnnotationTarget
    ? resolveAnnotationTarget(element)
    : element;
  if (!annotationTarget) {
    return { disabled: true, message: ANNOTATION_MANUAL_EDIT_DISABLED_MESSAGE };
  }
  const annotationNodeId = readCurrentAnnotationNodeId(annotationTarget);
  if (annotationNodeId) {
    return { disabled: false, message: '' };
  }
  const createBlockReason = getCreateBlockReason?.(annotationTarget)?.trim();
  if (createBlockReason) {
    return { disabled: true, message: createBlockReason };
  }
  const isPanelTarget = isAnnotationPanelTarget(annotationTarget);
  if (isPanelTarget) {
    return { disabled: true, message: ANNOTATION_MANUAL_EDIT_DISABLED_MESSAGE };
  }
  let locator: ElementLocator;
  try {
    locator = createElementLocator(annotationTarget);
  } catch {
    return { disabled: true, message: ANNOTATION_MANUAL_EDIT_DISABLED_MESSAGE };
  }

  let resolvedElement: Element | null = null;
  try {
    resolvedElement = resolveLocator(locator);
  } catch {
    resolvedElement = null;
  }

  if (!resolvedElement) {
    return { disabled: true, message: ANNOTATION_MANUAL_EDIT_DISABLED_MESSAGE };
  }
  if (resolvedElement !== annotationTarget) {
    return { disabled: true, message: ANNOTATION_MANUAL_EDIT_DISABLED_MESSAGE };
  }
  return { disabled: false, message: '' };
}

async function copyPromptCardTextToClipboard(text: string): Promise<void> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the legacy selection-based copy path.
  }

  if (typeof document === 'undefined' || !document.body) {
    throw new Error('Clipboard copy is unavailable');
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);

  try {
    textArea.focus();
    textArea.select();
    const copied =
      typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    if (!copied) {
      throw new Error('Clipboard copy failed');
    }
  } finally {
    textArea.remove();
  }
}

export function buildPromptCardTaskErrorMessage(options: {
  currentTaskDescription: string;
  sessionId?: string | null;
  taskRef?: {
    provider?: string | null;
    sessionId?: string | null;
    requestId?: string | null;
    error?: string | null;
    code?: string | null;
    output?: string | null;
    chunk?: unknown;
    details?: unknown;
  } | null;
}): string {
  const { currentTaskDescription, sessionId, taskRef } = options;
  const serializeDiagnosticValue = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const taskSessionId = String(taskRef?.sessionId ?? sessionId ?? '').trim();
  return (
    [
      ...(currentTaskDescription ? [currentTaskDescription] : []),
      taskSessionId ? `Session ${taskSessionId}` : '',
      taskRef?.provider ? `Provider ${taskRef.provider}` : '',
      taskRef?.requestId ? `Request ${taskRef.requestId}` : '',
      taskRef?.code ? `Code ${taskRef.code}` : '',
      taskRef?.error ? `Error ${taskRef.error}` : '',
      taskRef?.output ? `Output ${taskRef.output}` : '',
      serializeDiagnosticValue(taskRef?.chunk)
        ? `Chunk ${serializeDiagnosticValue(taskRef?.chunk)}`
        : '',
      serializeDiagnosticValue(taskRef?.details)
        ? `Details ${serializeDiagnosticValue(taskRef?.details)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n') || 'AI 修改失败'
  );
}

export function dismissPromptCardTerminalState(options: {
  currentTarget: Element | null;
  currentTaskTerminal: boolean;
  onDismissSelection?: () => void;
}): boolean {
  const { currentTarget, currentTaskTerminal, onDismissSelection } = options;

  if (!currentTaskTerminal || !currentTarget) {
    return false;
  }

  onDismissSelection?.();
  return true;
}

export const PromptCardView = React.forwardRef<BreadcrumbsHandle, PromptCardViewProps>(
  function PromptCardView(props, ref) {
    const {
      options,
      currentTarget,
      anchorRect,
      uiMode,
      interactionProfile,
      transactionManager,
      tokensService,
      designAdjustmentTool,
      toolMinimized,
      propertyPanelEnabled,
      styleDesignEnabled,
      bubbleStyleEditorOpen,
      agentVisualState,
      onBubbleStyleEditorOpenChange,
      onSendCurrentElementPromptToAgent,
      onWakeAgent,
      onAgentVisualStateChange,
      getAgentBridgeConnected,
      getHasReusableAgentConversation,
      getSendCurrentElementPromptToAgentBlockReason,
      canExportSelectionToDesignTool,
      onExportSelectionToDesignTool,
      getExportSelectionToDesignToolBlockReason,
      hideExecutionControls = false,
      hideCurrentElementExecutionAction = false,
      hideContextAppendAction = false,
      enabledSkillIds,
      skillOptions,
      onHoverSelectionSuppressedChange,
      onSelectionInteractionLockChange,
      onTargetChange,
      onAnchorRectChange,
      onPromptCardVisibleChange,
      inlineTextEditing,
      onInlineTextEditingChange,
      canEditText,
      savedText,
      draftText,
      textDirty,
      onTextDraftChange,
      onCancelText,
      onConfirmText,
      images,
      onRemoveImage,
      onNotePasteCapture,
      canEditNote,
      savedNoteMeta,
      draftNote,
      noteDirty,
      onDraftChange,
      onClearCurrentElementEdits,
      onConfirmNote,
      onDismissSelection,
      annotationEnabled,
      canEditAnnotationMarkdown,
      annotationDocumentEditUrl,
      annotationDraftMarkdown,
      annotationDirty,
      annotationLoading,
      annotationSaving,
      onAnnotationDraftChange,
      onConfirmAnnotationMarkdown,
      onDeleteCurrentAnnotationNode,
    } = props;
    const documentSourceMarkdownEditor = options.annotationMarkdownEditorKind === 'document-source';
    const isAnnotationSession = interactionProfile === 'annotation';

    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const textComposerRef = React.useRef<HTMLDivElement | null>(null);
    const noteComposerRef = React.useRef<HTMLDivElement | null>(null);
    const inlineTextEditingRef = React.useRef(inlineTextEditing);
    const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);
    const [promptCardSize, setPromptCardSize] = React.useState<PromptCardSize | null>(null);
    const [sendingCurrentElementPrompt, setSendingCurrentElementPrompt] = React.useState(false);
    const [refreshKey, setRefreshKey] = React.useState(0);
    const [selectedSkills, setSelectedSkills] = React.useState<PromptCardSkill[]>([]);
    const [promptDismissed, setPromptDismissed] = React.useState(false);
    const [annotationEditorOpen, setAnnotationEditorOpen] = React.useState(
      () => readAnnotationInputModePreference() === 'edit',
    );
    const setAnnotationInputMode = React.useCallback((mode: AnnotationInputMode) => {
      writeAnnotationInputModePreference(mode);
      setAnnotationEditorOpen(mode === 'edit');
    }, []);
    const [runningElementToolId, setRunningElementToolId] = React.useState<string | null>(null);
    const [elementToolError, setElementToolError] = React.useState('');
    const elementTools = options.getElementTools?.(currentTarget) ?? [];
    const hasElementTools = elementTools.length > 0;
    const skillTrigger = React.useMemo(() => findPromptCardSkillTrigger(draftNote), [draftNote]);
    const promptCardSkills = React.useMemo(
      () => mergePromptCardSkills(skillOptions ?? []),
      [skillOptions],
    );
    const filteredSkills = React.useMemo(
      () => filterPromptCardSkills(skillTrigger?.query ?? '', enabledSkillIds, promptCardSkills),
      [enabledSkillIds, promptCardSkills, skillTrigger?.query],
    );
    const selectedSkillsDirty = React.useMemo(() => {
      const savedSkillIds = savedNoteMeta?.skillIds ?? [];
      const selectedSkillIds = selectedSkills.map((skill) => skill.id);
      return selectedSkillIds.join('\0') !== savedSkillIds.join('\0');
    }, [savedNoteMeta?.skillIds, selectedSkills]);
    const skillMenuOpen = Boolean(
      skillTrigger && !inlineTextEditing && canEditNote && filteredSkills.length > 0,
    );

    React.useEffect(() => {
      inlineTextEditingRef.current = inlineTextEditing;
    }, [inlineTextEditing]);

    React.useEffect(() => {
      setSelectedSkills(
        deserializePromptCardSkillSelection(
          savedNoteMeta,
          enabledSkillIds,
          skillOptions ?? [],
        ),
      );
      setRunningElementToolId(null);
      setElementToolError('');
    }, [enabledSkillIds, savedNoteMeta, currentTarget, skillOptions]);

    React.useEffect(() => {
      setPromptDismissed(false);
    }, [currentTarget]);

    React.useEffect(() => {
      if (isAnnotationSession && bubbleStyleEditorOpen) {
        onBubbleStyleEditorOpenChange(false);
      }
    }, [bubbleStyleEditorOpen, isAnnotationSession, onBubbleStyleEditorOpenChange]);

    const onConfirmNoteWithSelectedSkills = React.useCallback(async () => {
      const payload = buildPromptCardSkillSavePayload(draftNote, selectedSkills);
      await onConfirmNote({ skillIds: payload.skillIds });
    }, [draftNote, onConfirmNote, selectedSkills]);

    React.useImperativeHandle(
      ref,
      () => ({
        setTarget(element: Element | null) {
          onTargetChange(element);
        },
        setAnchorRect(rect) {
          onAnchorRectChange(rect);
        },
        refresh() {
          setRefreshKey((value) => value + 1);
        },
        enterInlineTextEdit() {
          onInlineTextEditingChange(true);
        },
      }),
      [onAnchorRectChange, onInlineTextEditingChange, onTargetChange],
    );

    const focusPromptTextInput = React.useCallback(() => {
      if (inlineTextEditing) return false;
      if (inlineTextEditingRef.current) return false;
      const input = textComposerRef.current?.querySelector('input');
      if (!(input instanceof HTMLInputElement) || input.disabled) return false;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== input &&
        !textComposerRef.current?.contains(activeElement)
      ) {
        activeElement.blur();
      }

      input.setAttribute(PARENT_SELECT_INPUT_TOUCHED_ATTR, 'false');
      input.focus({ preventScroll: true });
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch {
        // noop
      }
      return true;
    }, [inlineTextEditing]);

    const focusPromptTextarea = React.useCallback(() => {
      if (inlineTextEditing) return false;
      if (inlineTextEditingRef.current) return false;
      const textarea = noteComposerRef.current?.querySelector('textarea');
      if (!(textarea instanceof HTMLTextAreaElement) || textarea.disabled) return false;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== textarea &&
        !noteComposerRef.current?.contains(activeElement)
      ) {
        activeElement.blur();
      }

      textarea.setAttribute(PARENT_SELECT_INPUT_TOUCHED_ATTR, 'false');
      textarea.focus({ preventScroll: true });
      const cursor = textarea.value.length;
      try {
        textarea.setSelectionRange(cursor, cursor);
      } catch {
        // noop
      }
      return true;
    }, [inlineTextEditing]);

    const ensurePromptPrimaryFocus = React.useCallback(
      (attempts = 6) => {
        if (inlineTextEditingRef.current) return;
        let rafId = 0;
        let remaining = attempts;

        const tick = () => {
          if (inlineTextEditingRef.current) return;
          const textarea = noteComposerRef.current?.querySelector('textarea');
          if (textarea instanceof HTMLTextAreaElement && !textarea.disabled) {
            if (document.activeElement === textarea) return;
            focusPromptTextarea();
          } else {
            const input = textComposerRef.current?.querySelector('input');
            if (!(canEditText && input instanceof HTMLInputElement && !input.disabled)) return;
            if (document.activeElement === input) return;
            focusPromptTextInput();
          }
          remaining -= 1;
          if (remaining > 0) {
            rafId = window.requestAnimationFrame(tick);
          }
        };

        rafId = window.requestAnimationFrame(tick);
        return () => {
          if (rafId) {
            window.cancelAnimationFrame(rafId);
          }
        };
      },
      [canEditText, focusPromptTextInput, focusPromptTextarea, inlineTextEditing],
    );

    const promptPositionBaseVisible = Boolean(
      currentTarget && anchorRect && !toolMinimized && uiMode === 'bubble-card',
    );

    React.useLayoutEffect(() => {
      if (!promptPositionBaseVisible) {
        setPromptCardSize(null);
        return;
      }

      const root = rootRef.current;
      if (!root) return;

      const updateSize = () => {
        const rect = root.getBoundingClientRect();
        if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return;
        const nextSize = {
          width: Math.max(PROMPT_CARD_WIDTH, Math.round(rect.width)),
          height: Math.max(PROMPT_CARD_ESTIMATED_HEIGHT, Math.round(rect.height)),
        };
        setPromptCardSize((prev) => {
          if (prev && prev.width === nextSize.width && prev.height === nextSize.height) {
            return prev;
          }
          return nextSize;
        });
      };

      updateSize();

      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(root);
      return () => observer.disconnect();
    }, [
      annotationDraftMarkdown,
      annotationEditorOpen,
      canEditText,
      draftNote,
      draftText,
      images.length,
      promptPositionBaseVisible,
      propertyPanelEnabled,
      bubbleStyleEditorOpen,
    ]);

    // Track visualViewport resize (keyboard show/hide) for mobile repositioning
    const [visualViewportKey, setVisualViewportKey] = React.useState(0);
    React.useEffect(() => {
      if (!isMobileDevice()) return;
      const vv = window.visualViewport;
      if (!vv) return;
      const handleResize = () => setVisualViewportKey((k) => k + 1);
      vv.addEventListener('resize', handleResize);
      return () => vv.removeEventListener('resize', handleResize);
    }, []);

    const promptPosition = React.useMemo(() => {
      if (!currentTarget || !anchorRect || toolMinimized || uiMode !== 'bubble-card') return null;

      // On mobile, use full viewport width minus padding
      const mobileWidth = isMobileDevice()
        ? Math.max(200, window.innerWidth - 16)
        : (promptCardSize?.width ?? PROMPT_CARD_WIDTH);

      return computePromptCardPosition({
        anchorRect,
        cardWidth: mobileWidth,
        cardHeight: promptCardSize?.height ?? PROMPT_CARD_ESTIMATED_HEIGHT,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        propertyPanelEnabled,
        safePaddingPx: SAFE_PADDING_PX,
        propertyPanelWidth: PROPERTY_PANEL_WIDTH,
        propertyPanelRight: PROPERTY_PANEL_RIGHT,
        anchorGapPx: ANCHOR_GAP_PX,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      anchorRect,
      currentTarget,
      promptCardSize,
      propertyPanelEnabled,
      toolMinimized,
      uiMode,
      visualViewportKey,
    ]);

    const promptVisible = Boolean(
      currentTarget &&
        promptPosition &&
        promptCardSize &&
        !toolMinimized &&
        uiMode === 'bubble-card' &&
        !promptDismissed,
    );

    React.useEffect(() => {
      if (!promptVisible || uiMode !== 'bubble-card') {
        setSelectedSkills([]);
      }
      if (!isAnnotationSession && (!promptVisible || uiMode !== 'bubble-card')) {
        setAnnotationEditorOpen(false);
      }
    }, [isAnnotationSession, promptVisible, uiMode]);

    React.useEffect(() => {
      if (!isAnnotationSession && !canEditAnnotationMarkdown) {
        setAnnotationEditorOpen(false);
      }
    }, [canEditAnnotationMarkdown, isAnnotationSession]);

    React.useEffect(() => {
      if (!isAnnotationSession) return;
      setAnnotationEditorOpen(readAnnotationInputModePreference() === 'edit');
    }, [isAnnotationSession]);

    React.useEffect(() => {
      if (!isAnnotationSession && bubbleStyleEditorOpen) {
        setAnnotationEditorOpen(false);
      }
    }, [bubbleStyleEditorOpen, isAnnotationSession]);

    React.useEffect(() => {
      if (!hasElementTools || !bubbleStyleEditorOpen) return;
      onBubbleStyleEditorOpenChange(false);
    }, [bubbleStyleEditorOpen, hasElementTools, onBubbleStyleEditorOpenChange]);

    React.useEffect(() => {
      onPromptCardVisibleChange?.(promptVisible);
    }, [onPromptCardVisibleChange, promptVisible]);

    React.useEffect(() => {
      return () => onPromptCardVisibleChange?.(false);
    }, [onPromptCardVisibleChange]);

    React.useEffect(() => {
      if (!promptVisible || !currentTarget || toolMinimized || uiMode !== 'bubble-card' || inlineTextEditing) return;
      if (!isMobileDevice()) {
        return ensurePromptPrimaryFocus();
      }

      const timerId = window.setTimeout(() => {
        ensurePromptPrimaryFocus(10);
      }, 260);

      return () => {
        window.clearTimeout(timerId);
      };
    }, [
      currentTarget,
      ensurePromptPrimaryFocus,
      inlineTextEditing,
      promptVisible,
      toolMinimized,
      uiMode,
    ]);

    React.useEffect(() => {
      if (!inlineTextEditing || promptVisible) return;
      onInlineTextEditingChange(false);
    }, [inlineTextEditing, onInlineTextEditingChange, promptVisible]);

    React.useEffect(() => {
      if (!inlineTextEditing) return;
      const textarea = noteComposerRef.current?.querySelector('textarea');
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.blur();
      }
      const input = textComposerRef.current?.querySelector('input');
      if (input instanceof HTMLInputElement) {
        input.blur();
      }
    }, [inlineTextEditing]);

    React.useEffect(() => {
      if (!promptVisible || uiMode !== 'bubble-card') return;

      const handleWheel = (event: WheelEvent) => {
        const root = rootRef.current;
        if (!root || !(event.target instanceof Node)) return;
        if (!root.contains(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
      };

      window.addEventListener('wheel', handleWheel, {
        capture: true,
        passive: false,
      });
      return () => {
        window.removeEventListener('wheel', handleWheel, true);
      };
    }, [promptVisible, uiMode]);

    const saveAndCloseNoteComposer = React.useCallback(async () => {
      await onConfirmNoteWithSelectedSkills();
      setSelectedSkills([]);
      const textarea = noteComposerRef.current?.querySelector('textarea');
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.blur();
      }
      onDismissSelection?.();
    }, [onConfirmNoteWithSelectedSkills, onDismissSelection]);

    const saveAndDismissPromptCard = React.useCallback(async () => {
      setSelectedSkills([]);
      setPromptDismissed(true);

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && rootRef.current?.contains(activeElement)) {
        activeElement.blur();
      }

      // Hide immediately, but keep the current target alive while persistence
      // callbacks capture and save its draft.
      try {
        await onConfirmText();
        await onConfirmNoteWithSelectedSkills();
        if (
          documentSourceMarkdownEditor ||
          !getAnnotationManualEditLocatorState(
            currentTarget,
            undefined,
            options.getCreateAnnotationBlockReason,
            options.resolveAnnotationTarget,
          ).disabled
        ) {
          await onConfirmAnnotationMarkdown();
        }
      } finally {
        onDismissSelection?.();
      }
    }, [
      currentTarget,
      documentSourceMarkdownEditor,
      onConfirmAnnotationMarkdown,
      onConfirmNoteWithSelectedSkills,
      onConfirmText,
      onDismissSelection,
      options.getCreateAnnotationBlockReason,
      options.resolveAnnotationTarget,
    ]);

    const saveAndCloseAnnotationMarkdownComposer = React.useCallback(async () => {
      if (
        !documentSourceMarkdownEditor &&
        getAnnotationManualEditLocatorState(
          currentTarget,
          undefined,
          options.getCreateAnnotationBlockReason,
          options.resolveAnnotationTarget,
        ).disabled
      ) {
        return;
      }
      await onConfirmAnnotationMarkdown();
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && rootRef.current?.contains(activeElement)) {
        activeElement.blur();
      }
      onDismissSelection?.();
    }, [
      currentTarget,
      documentSourceMarkdownEditor,
      onConfirmAnnotationMarkdown,
      onDismissSelection,
      options.getCreateAnnotationBlockReason,
      options.resolveAnnotationTarget,
    ]);

    const clearSelectedSkills = React.useCallback(() => {
      setSelectedSkills([]);
    }, []);

    const handleSkillSelect = React.useCallback(
      (skill: PromptCardSkill) => {
        const nextDraftNote = clearPromptCardSkillTrigger(draftNote);
        setSelectedSkills((current) => addPromptCardSkillSelection(current, skill));
        onDraftChange(nextDraftNote);
        window.requestAnimationFrame(() => {
          ensurePromptPrimaryFocus(2);
        });
      },
      [draftNote, ensurePromptPrimaryFocus, onDraftChange],
    );

    const handleSkillRemove = React.useCallback((skillId: string) => {
      setSelectedSkills((current) => current.filter((skill) => skill.id !== skillId));
    }, []);

    React.useEffect(() => {
      setPortalContainer(
        options.container.querySelector(
          `[${WEB_EDITOR_POPUP_ROOT_ATTR}="true"]`,
        ) as HTMLElement | null,
      );
    }, [options.container]);

    React.useEffect(() => {
      if (!promptVisible) {
        onHoverSelectionSuppressedChange(false);
        onSelectionInteractionLockChange(false);
      }
    }, [onHoverSelectionSuppressedChange, onSelectionInteractionLockChange, promptVisible]);

    React.useEffect(() => {
      return () => {
        onHoverSelectionSuppressedChange(false);
        onSelectionInteractionLockChange(false);
      };
    }, [onHoverSelectionSuppressedChange, onSelectionInteractionLockChange]);

    const agentAvailable = isAgentPromptActionVisible({
      currentTarget,
      uiMode,
      toolMinimized,
      onAppendElementToAgentContext: hideContextAppendAction
        ? undefined
        : options.onAppendElementToAgentContext,
      getAgentBridgeAvailable: options.getAgentBridgeAvailable,
      getAssistantPanelOpen: options.getAssistantPanelOpen,
    });
    const designToolExportAction = getDesignToolExportActionState({
      tool: designAdjustmentTool,
      currentTarget,
      uiMode,
      toolMinimized,
      onExportSelectionToDesignTool,
      canExportSelectionToDesignTool,
      getExportSelectionToDesignToolBlockReason,
    });
    const textCommentMode = interactionProfile === 'text-comment';
    const {
      currentTask: currentAgentTask,
      currentTaskRunning,
      currentTaskSessionReady,
      currentTaskTerminal,
      pageTaskRunning,
      pageTaskSessionReady,
      hasReusableConversation,
      effectiveVisualState,
    } = deriveAgentUiState({
      currentTarget,
      visualState: agentVisualState,
      getElementAgentTaskState: options.getElementAgentTaskState,
      getVisibleElementAgentTaskStates: options.getVisibleElementAgentTaskStates,
      getHasReusableAgentConversation,
      getAgentBridgeConnected,
    });
    const dismissTerminalTaskAndSelection = React.useCallback(
      () =>
        dismissPromptCardTerminalState({
          currentTarget,
          currentTaskTerminal,
          onDismissSelection,
        }),
      [currentTarget, currentTaskTerminal, onDismissSelection],
    );
    const handlePromptCardClose = React.useCallback(() => {
      if (dismissTerminalTaskAndSelection()) return;

      void saveAndDismissPromptCard().catch(() => undefined);
    }, [dismissTerminalTaskAndSelection, saveAndDismissPromptCard]);
    const currentTaskSessionHref =
      currentAgentTask?.sessionUrl ??
      (currentAgentTask?.sessionId ? `/session/${currentAgentTask.sessionId}` : '');
    const currentTaskDescription = resolveExternalEditingStatusDescription(
      currentAgentTask,
      options.externalEditingStatusDescription,
    );
    const currentTaskErrorMessage = currentAgentTask?.status === 'error'
        ? buildPromptCardTaskErrorMessage({
            currentTaskDescription,
            sessionId: currentAgentTask.sessionId,
            taskRef: currentAgentTask.taskRef,
          })
        : '';
    const styleSummaryLines = compactPromptStyleSummaryLines(
      options.getElementStyleSummaryLines?.(currentTarget) ?? [],
    );
    const currentElementHasDraftChanges = noteDirty || textDirty;
    const currentElementBlockReason = (() => {
      const reason = getSendCurrentElementPromptToAgentBlockReason?.(currentTarget);
      if (reason === '当前元素没有可发送给 AI 的编辑' && currentElementHasDraftChanges) {
        return undefined;
      }
      return reason;
    })();
    const currentElementPromptAction = getAgentPromptBubbleActionState({
      visualState: effectiveVisualState,
      sending: sendingCurrentElementPrompt,
      pageTaskRunning,
      pageTaskSessionReady,
      currentTaskRunning,
      currentTaskSessionReady,
      onSendCurrentElementPromptToAgent,
      canWakeAgent: Boolean(onWakeAgent),
      getAgentBridgeConnected,
      getSendCurrentElementPromptToAgentBlockReason: () => currentElementBlockReason,
      hasReusableConversation,
    });

    React.useEffect(() => {
      if (!sendingCurrentElementPrompt) return;
      if (currentTaskRunning && currentTaskSessionReady) {
        setSendingCurrentElementPrompt(false);
      }
    }, [currentTaskRunning, currentTaskSessionReady, sendingCurrentElementPrompt]);

    React.useEffect(() => {
      if (!promptVisible || uiMode !== 'bubble-card' || !currentTaskTerminal) return;

      const handleWindowKeyDown = (event: KeyboardEvent) => {
        if (event.isComposing || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        dismissTerminalTaskAndSelection();
      };

      window.addEventListener('keydown', handleWindowKeyDown, true);
      return () => {
        window.removeEventListener('keydown', handleWindowKeyDown, true);
      };
    }, [currentTaskTerminal, dismissTerminalTaskAndSelection, promptVisible, uiMode]);

    const wakeAgentForCurrentElementAction = React.useCallback(async (): Promise<boolean> => {
      if (hideExecutionControls) {
        return true;
      }
      const connected = getAgentBridgeConnected?.();
      if (connected !== false && agentVisualState === 'awake') {
        return true;
      }
      if (!onWakeAgent) {
        return connected !== false;
      }

      try {
        const wakeResult = await onWakeAgent();
        if (wakeResult === true) {
          onAgentVisualStateChange?.('awake');
          return true;
        }
      } catch {
        // The wake bridge reports user-facing feedback.
      }
      return false;
    }, [
      agentVisualState,
      getAgentBridgeConnected,
      hideExecutionControls,
      onAgentVisualStateChange,
      onWakeAgent,
    ]);

    const handleConfirmSendCurrentElementPrompt = React.useCallback(async () => {
      const ready = await wakeAgentForCurrentElementAction();
      if (!ready) return;

      setSendingCurrentElementPrompt(true);
      try {
        const sent = await executePromptCardCurrentElementAction({
          currentTarget,
          onConfirmText,
          onConfirmNote: onConfirmNoteWithSelectedSkills,
          onDismissSelection,
          onSendCurrentElementPromptToAgent,
          onDispatched: () => {
            setSendingCurrentElementPrompt(false);
          },
        });
        if (sent) {
          clearSelectedSkills();
        }
      } catch {
        // The runtime bridge already surfaces user-facing feedback.
      } finally {
        setSendingCurrentElementPrompt(false);
      }
    }, [
      clearSelectedSkills,
      currentTarget,
      onConfirmNoteWithSelectedSkills,
      onConfirmText,
      onDismissSelection,
      onSendCurrentElementPromptToAgent,
      selectedSkills,
      wakeAgentForCurrentElementAction,
    ]);

    const handlePromptKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.nativeEvent as KeyboardEvent).isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          void saveAndCloseNoteComposer();
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (dismissTerminalTaskAndSelection()) return;
        void saveAndCloseNoteComposer();
      },
      [dismissTerminalTaskAndSelection, saveAndCloseNoteComposer],
    );

    if (
      !promptPositionBaseVisible ||
      !currentTarget ||
      !promptPosition ||
      toolMinimized ||
      uiMode !== 'bubble-card'
    ) {
      return <div ref={rootRef} style={{ ...promptCardStyle, visibility: 'hidden' }} />;
    }

    const promptTarget = currentTarget;
    const handleElementToolAction = async (tool: (typeof elementTools)[number]) => {
      if (tool.disabled || runningElementToolId) return;
      setRunningElementToolId(tool.id);
      setElementToolError('');
      try {
        await options.onElementToolAction?.(tool, promptTarget);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '操作失败');
        setElementToolError(message.trim() || '操作失败');
      } finally {
        setRunningElementToolId(null);
      }
    };
    const showPromptTextInput = false;
    const isCurrentAnnotationPanelTarget = isAnnotationPanelTarget(currentTarget);
    const showAnnotationMarkdownEditorButton = Boolean(
      annotationEnabled && canEditAnnotationMarkdown && currentTarget,
    );
    const showAnnotationDocumentEditButton = Boolean(currentTarget && annotationDocumentEditUrl);
    const showNoteComposer = !annotationEditorOpen && !bubbleStyleEditorOpen;
    const showAnnotationMarkdownEditor = Boolean(
      annotationEditorOpen
      && showAnnotationMarkdownEditorButton
      && !bubbleStyleEditorOpen
    );
    const annotationModeLabel = annotationEditorOpen ? '编辑' : '生成';
    const annotationManualEditLocatorState = showAnnotationMarkdownEditor
      ? documentSourceMarkdownEditor
        ? { disabled: false, message: '' }
        : getAnnotationManualEditLocatorState(
            currentTarget,
            undefined,
            options.getCreateAnnotationBlockReason,
            options.resolveAnnotationTarget,
          )
      : { disabled: false, message: '' };
    const annotationManualEditDisabled = annotationManualEditLocatorState.disabled;
    const annotationManualEditMessage = annotationManualEditLocatorState.message;
    const showPromptDesignEditor = Boolean(
      currentTarget &&
        transactionManager &&
        bubbleStyleEditorOpen &&
        styleDesignEnabled &&
        !isAnnotationSession &&
        !isCurrentAnnotationPanelTarget &&
        !textCommentMode,
    );
    const styleEditorToggleTitle = bubbleStyleEditorOpen ? '关闭样式编辑' : '打开样式编辑';
    const promptCardSendActionTitle = currentElementPromptAction.title;
    const agentSelectionShortcutSettings = options.getCommentShortcutSettings?.();
    const agentSelectionShortcutLabels = agentSelectionShortcutSettings?.enabled
      ? agentSelectionShortcutSettings.shortcuts
          .filter((shortcut): shortcut is NonNullable<typeof shortcut> => Boolean(shortcut))
          .map((shortcut) => formatModifierShortcutLabel(shortcut))
      : [];
    const agentSelectionShortcutHint =
      agentSelectionShortcutLabels.length > 0
        ? `，长按 ${agentSelectionShortcutLabels.join(' / ')} 也可唤起`
        : '';
    const agentSelectionActionTitle = currentTaskRunning
      ? '添加到 AI 对话'
      : `添加到 AI 对话${agentSelectionShortcutHint}`;
    const showContextAppendExecutionControls = !hideExecutionControls;
    const showPromptCardExecutionActions = !isAnnotationSession || !annotationEditorOpen;
    const notePlaceholder = resolvePromptCardNotePlaceholder(isAnnotationSession);
    const promptCardCloseActionTitle = resolvePromptCardCloseActionTitle(
      globalThis.navigator?.platform,
    );
    const annotationDeleteAction = !documentSourceMarkdownEditor ? (
      <Popconfirm
        title="删除标注"
        description="删除后该标注节点和页面上的 Marker 都会消失。"
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        disabled={annotationLoading || annotationSaving || !onDeleteCurrentAnnotationNode}
        getPopupContainer={resolveRuntimePopupContainer}
        onConfirm={() => {
          void onDeleteCurrentAnnotationNode?.();
        }}
      >
        <span style={{ display: 'inline-flex' }}>
          <IconActionButton
            title="删除标注"
            icon={<DeleteOutlined />}
            tone="dark"
            disabled={annotationLoading || annotationSaving || !onDeleteCurrentAnnotationNode}
          />
        </span>
      </Popconfirm>
    ) : null;

    const promptCardNode = (
      <div
        ref={rootRef}
        data-we-selection-lock-root="true"
        style={{
          ...promptCardStyle,
          width: isAnnotationSession
            ? ANNOTATION_EDITOR_PROMPT_CARD_WIDTH
            : promptCardStyle.width,
          left: promptPosition.left,
          top: promptPosition.top,
          visibility: promptVisible ? 'visible' : 'hidden',
          // Mobile: full width prompt card
          ...(isMobileDevice()
            ? {
                width: 'calc(100vw - 16px)',
                maxWidth: 'calc(100vw - 16px)',
                borderRadius: 16,
              }
            : {}),
        }}
        onPointerDownCapture={() => onSelectionInteractionLockChange(true)}
        onFocusCapture={() => onSelectionInteractionLockChange(true)}
        onPointerEnter={() => {
          onHoverSelectionSuppressedChange(true);
        }}
        onPointerLeave={() => {
          onHoverSelectionSuppressedChange(false);
        }}
      >
        <style>
          {`
            .we-runtime-prompt-card__textarea,
            .we-runtime-prompt-card__textarea:disabled,
            .we-runtime-prompt-card__textarea textarea,
            .we-runtime-prompt-card__textarea textarea:disabled {
              color: ${EDITOR_CHROME.textPrimary} !important;
              -webkit-text-fill-color: ${EDITOR_CHROME.textPrimary} !important;
              scrollbar-width: none;
              -ms-overflow-style: none;
            }

            .we-runtime-prompt-card__textarea::placeholder,
            .we-runtime-prompt-card__textarea textarea::placeholder {
              color: ${EDITOR_CHROME.textMuted} !important;
              -webkit-text-fill-color: ${EDITOR_CHROME.textMuted} !important;
            }

            .we-runtime-prompt-card__textarea::-webkit-scrollbar,
            .we-runtime-prompt-card__textarea textarea::-webkit-scrollbar {
              display: none;
            }

            [data-we-annotation-markdown-editor="true"]:focus-within {
              border-color: ${EDITOR_CHROME.accent} !important;
              box-shadow: 0 0 0 3px ${EDITOR_CHROME.accentSoft};
            }
          `}
        </style>
        <div
          data-we-annotation-session-toolbar="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            data-we-prompt-card-tool-actions="true"
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          >
            {isAnnotationSession && showAnnotationMarkdownEditorButton ? (
              <div
                data-we-annotation-mode-tabs="true"
                role="tablist"
                aria-label={`${annotationModeLabel}标注编辑已选`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  padding: 1,
                  borderRadius: 7,
                  background: EDITOR_CHROME.surface,
                  border: `1px solid ${EDITOR_CHROME.border}`,
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={annotationEditorOpen}
                  style={{
                    border: 0,
                    borderRadius: 6,
                    background: annotationEditorOpen
                      ? EDITOR_CHROME.surfaceInteractive
                      : 'transparent',
                    color: annotationEditorOpen
                      ? EDITOR_CHROME.textPrimary
                      : EDITOR_CHROME.textMuted,
                    padding: '3px 6px',
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: '16px',
                    cursor: annotationLoading ? 'default' : 'pointer',
                  }}
                  disabled={annotationLoading}
                  onClick={() => {
                    setAnnotationInputMode('edit');
                    onBubbleStyleEditorOpenChange(false);
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!annotationEditorOpen}
                  style={{
                    border: 0,
                    borderRadius: 6,
                    background: !annotationEditorOpen
                      ? EDITOR_CHROME.surfaceInteractive
                      : 'transparent',
                    color: !annotationEditorOpen
                      ? EDITOR_CHROME.textPrimary
                      : EDITOR_CHROME.textMuted,
                    padding: '3px 6px',
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: '16px',
                    cursor: annotationLoading ? 'default' : 'pointer',
                  }}
                  disabled={annotationLoading}
                  onClick={() => {
                    setAnnotationInputMode('generate');
                    onBubbleStyleEditorOpenChange(false);
                  }}
                >
                  生成
                </button>
              </div>
            ) : showAnnotationMarkdownEditorButton ? (
              <IconActionButton
                title={
                  documentSourceMarkdownEditor
                    ? annotationEditorOpen
                      ? '关闭 Markdown 源码编辑'
                      : 'Markdown 源码编辑'
                    : annotationEditorOpen
                      ? '关闭标注编辑'
                      : '标注编辑'
                }
                icon={<FileTextOutlined />}
                tone={annotationEditorOpen ? 'accent' : 'dark'}
                disabled={annotationLoading}
                onClick={() => {
                  const nextAnnotationEditorOpen = !annotationEditorOpen;
                  setAnnotationEditorOpen(nextAnnotationEditorOpen);
                  if (nextAnnotationEditorOpen && bubbleStyleEditorOpen) {
                    onBubbleStyleEditorOpenChange(false);
                  }
                }}
              />
            ) : null}
            {showAnnotationDocumentEditButton ? (
              <IconActionButton
                title="文档编辑"
                icon={<FileTextOutlined />}
                tone="dark"
                onClick={() => {
                  window.open(annotationDocumentEditUrl, '_blank', 'noopener,noreferrer');
                }}
              />
            ) : null}
            {elementTools.map((tool) => {
              const running = runningElementToolId === tool.id;
              return (
                <span key={tool.id} data-we-element-tool={tool.id}>
                  <IconActionButton
                    title={running ? `${tool.label}（正在打开）` : tool.label}
                    icon={tool.icon === 'document' ? <FileTextOutlined /> : <ExportOutlined />}
                    tone="dark"
                    loading={running}
                    disabled={Boolean(tool.disabled || runningElementToolId)}
                    onClick={() => {
                      void handleElementToolAction(tool);
                    }}
                  />
                </span>
              );
            })}
            {propertyPanelEnabled && styleDesignEnabled && !hasElementTools &&
            !isAnnotationSession &&
            !textCommentMode &&
            !isCurrentAnnotationPanelTarget ? (
              <IconActionButton
                title={styleEditorToggleTitle}
                icon={<FormatPainterOutlined />}
                tone={bubbleStyleEditorOpen ? 'accent' : 'dark'}
                onClick={() => {
                  const nextBubbleStyleEditorOpen = !bubbleStyleEditorOpen;
                  onBubbleStyleEditorOpenChange(nextBubbleStyleEditorOpen);
                  if (nextBubbleStyleEditorOpen) {
                    setAnnotationEditorOpen(false);
                  }
                }}
              />
            ) : null}
            {designToolExportAction.visible && !isAnnotationSession && !textCommentMode ? (
              <IconActionButton
                title={designToolExportAction.title}
                icon={<ExportOutlined />}
                tone="dark"
                disabled={designToolExportAction.disabled}
                onClick={() => {
                  triggerDesignToolExportAction({
                    tool: designAdjustmentTool,
                    currentTarget: promptTarget,
                    onExportSelectionToDesignTool,
                  });
                }}
              />
            ) : null}
          </div>
          <div style={{ flex: 1 }} />
          {showPromptCardExecutionActions ? (
            <div
              data-we-prompt-card-execution-actions="true"
              style={{ display: 'flex', alignItems: 'center', gap: 2 }}
            >
              {showContextAppendExecutionControls && agentAvailable ? (
                <IconActionButton
                  title={agentSelectionActionTitle}
                  icon={<AgentSparkleIcon />}
                  tone="dark"
                  disabled={!currentTarget}
                  onClick={() => {
                    triggerAgentPromptAction({
                      currentTarget: promptTarget,
                      onAppendElementToAgentContext: options.onAppendElementToAgentContext,
                    });
                  }}
                />
              ) : null}
              {!hideCurrentElementExecutionAction && currentElementPromptAction.visible ? (
                <IconActionButton
                  title={promptCardSendActionTitle}
                  icon={<CaretRightFilled />}
                  tone="accent"
                  loading={currentElementPromptAction.loading}
                  disabled={currentElementPromptAction.disabled}
                  onClick={() => {
                    void handleConfirmSendCurrentElementPrompt();
                  }}
                />
              ) : null}
              <IconActionButton
                title="清空批注"
                icon={<ClearOutlined />}
                tone="dark"
                disabled={!currentTarget}
                onClick={() => {
                  clearSelectedSkills();
                  void onClearCurrentElementEdits();
                }}
              />
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              paddingLeft: 8,
              marginLeft: 2,
              borderLeft: `1px solid ${EDITOR_CHROME.border}`,
            }}
          >
            <IconActionButton
              title={promptCardCloseActionTitle}
              icon={<CloseToolIcon />}
              tone="dark"
              onClick={handlePromptCardClose}
            />
          </div>
        </div>
        {elementToolError ? (
          <div
            role="alert"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(255, 77, 79, 0.12)',
              color: EDITOR_CHROME.textDanger,
              fontSize: 11,
              lineHeight: 1.45,
              overflowWrap: 'anywhere',
            }}
          >
            {elementToolError.slice(0, 240)}
          </div>
        ) : null}
        <div
          ref={noteComposerRef}
          onFocusCapture={(event) => {
            if (inlineTextEditing) return;
            if (!shouldRestorePromptPrimaryFocusFromTarget(event.target)) return;
            window.requestAnimationFrame(() => {
              ensurePromptPrimaryFocus(3);
            });
          }}
          onPointerDownCapture={(event) => {
            if (inlineTextEditing) return;
            if (!shouldRestorePromptPrimaryFocusFromTarget(event.target)) return;
            window.requestAnimationFrame(() => {
              ensurePromptPrimaryFocus(3);
            });
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: inlineTextEditing ? 'none' : 'auto',
          }}
        >
          {showPromptTextInput ? (
            <div ref={textComposerRef}>
              <Input
                value={draftText}
                placeholder={TEXT_INPUT_PLACEHOLDER}
                size="small"
                style={{
                  borderRadius: 12,
                  minHeight: 32,
                  background: EDITOR_CHROME.surfaceMuted,
                  borderColor: EDITOR_CHROME.borderStrong,
                  boxShadow: 'none',
                  color: EDITOR_CHROME.textPrimary,
                }}
                onChange={(event) => {
                  onTextDraftChange(event.target.value);
                }}
                onPressEnter={(event) => {
                  if (isMobileDevice()) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  void onConfirmText();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (dismissTerminalTaskAndSelection()) return;
                  onCancelText();
                }}
                onBlur={() => {
                  if (!textDirty) return;
                  void onConfirmText();
                }}
              />
            </div>
          ) : null}
          {showNoteComposer ? (
            <>
              <Dropdown
                open={skillMenuOpen}
                trigger={[]}
                placement="bottomLeft"
                autoAdjustOverflow={{ adjustX: 1, adjustY: 1 }}
                destroyOnHidden
                getPopupContainer={resolveRuntimePopupContainer}
                styles={{ root: { zIndex: POPUP_LAYER_Z_INDEX + 40 } }}
                popupRender={() => (
                  <div
                    data-we-selection-lock-root="true"
                    data-we-prompt-card-skill-menu="true"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: 'calc(100vh - 24px)',
                      overflowX: 'hidden',
                      overflowY: 'auto',
                      borderRadius: 10,
                      background: EDITOR_CHROME.surfaceElevated,
                      border: `1px solid ${EDITOR_CHROME.borderStrong}`,
                      boxShadow: EDITOR_CHROME.shadowCompact,
                    }}
                    onPointerDownCapture={() => onSelectionInteractionLockChange(true)}
                    onPointerEnter={() => {
                      onHoverSelectionSuppressedChange(true);
                    }}
                    onPointerLeave={() => {
                      onHoverSelectionSuppressedChange(false);
                    }}
                  >
                    {filteredSkills.map((skill) => {
                      const selected = selectedSkills.some(
                        (selectedSkill) => selectedSkill.id === skill.id,
                      );
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          disabled={selected}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 2,
                            border: 0,
                            background: selected
                              ? EDITOR_CHROME.surfaceInteractive
                              : 'transparent',
                            color: selected ? EDITOR_CHROME.textMuted : EDITOR_CHROME.textPrimary,
                            padding: '8px 10px',
                            textAlign: 'left',
                            cursor: selected ? 'default' : 'pointer',
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            if (!selected) {
                              handleSkillSelect(skill);
                            }
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              lineHeight: 1.35,
                            }}
                          >
                            {skill.label}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              lineHeight: 1.35,
                              color: EDITOR_CHROME.textMuted,
                            }}
                          >
                            {skill.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              >
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: selectedSkills.length > 0 ? 6 : 0,
                    minHeight: selectedSkills.length > 0 ? 64 : 44,
                    justifyContent: 'center',
                    borderRadius: 12,
                    background: EDITOR_CHROME.surfaceMuted,
                    border: `1px solid ${EDITOR_CHROME.borderStrong}`,
                  }}
                >
                  {selectedSkills.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        padding: '8px 8px 0',
                      }}
                    >
                      {selectedSkills.map((skill) => (
                        <button
                          key={skill.id}
                          type="button"
                          data-we-prompt-card-skill-tag="true"
                          title={`移除技能：${skill.label}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            maxWidth: '100%',
                            border: `1px solid ${EDITOR_CHROME.border}`,
                            borderRadius: 999,
                            background: EDITOR_CHROME.surfaceInteractive,
                            color: EDITOR_CHROME.textSecondary,
                            padding: '3px 7px',
                            fontSize: 11,
                            lineHeight: 1.2,
                            cursor: 'pointer',
                          }}
                          onClick={() => handleSkillRemove(skill.id)}
                        >
                          <span
                            style={{
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {skill.label}
                          </span>
                          <CloseOutlined style={{ fontSize: 9, color: EDITOR_CHROME.textMuted }} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <Input.TextArea
                    className="we-runtime-prompt-card__textarea"
                    value={draftNote}
                    disabled={!canEditNote}
                    readOnly={inlineTextEditing}
                    tabIndex={inlineTextEditing ? -1 : 0}
                    allowClear
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    placeholder={notePlaceholder}
                    variant="borderless"
                    styles={{
                      textarea: {
                        color: EDITOR_CHROME.textPrimary,
                        background: 'transparent',
                        minHeight: 32,
                        padding: '6px 10px',
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        caretColor: EDITOR_CHROME.textPrimary,
                      },
                    }}
                    style={{
                      borderRadius: 12,
                      background: 'transparent',
                      borderColor: 'transparent',
                      boxShadow: 'none',
                    }}
                    onChange={(event) => {
                      onDraftChange(event.target.value);
                    }}
                    onFocus={(event) => {
                      if (!inlineTextEditing) return;
                      event.currentTarget.blur();
                    }}
                    onPasteCapture={onNotePasteCapture}
                    onKeyDown={handlePromptKeyDown}
                    onBlur={(event) => {
                      const nextTarget = event.relatedTarget;
                      if (
                        nextTarget instanceof Node &&
                        noteComposerRef.current?.contains(nextTarget)
                      ) {
                        return;
                      }
                      if (!noteDirty && !selectedSkillsDirty) return;
                      void onConfirmNoteWithSelectedSkills();
                    }}
                  />
                </div>
              </Dropdown>
              <PromptImageStrip
                images={images}
                onRemoveImage={(imageId) => {
                  void onRemoveImage(imageId);
                }}
              />
            </>
          ) : null}
          {showAnnotationMarkdownEditor ? (
            <div
              data-we-prompt-primary-focus-exempt="true"
              style={annotationEditorShellStyle}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    color: EDITOR_CHROME.textSecondary,
                  }}
                >
                  {documentSourceMarkdownEditor ? 'Markdown 源码' : '需求标注'}
                </span>
                {annotationDeleteAction}
              </div>
              <div data-we-annotation-markdown-editor="true" style={annotationEditorInputStyle}>
                <Input.TextArea
                  className="we-runtime-prompt-card__textarea"
                  value={annotationDraftMarkdown}
                  disabled={annotationLoading || annotationManualEditDisabled}
                  autoSize={{ minRows: 4, maxRows: 10 }}
                  placeholder={
                    documentSourceMarkdownEditor
                      ? DOCUMENT_SOURCE_MARKDOWN_PLACEHOLDER
                      : annotationManualEditDisabled
                        ? annotationManualEditMessage
                        : ANNOTATION_MARKDOWN_PLACEHOLDER
                  }
                  variant="borderless"
                  styles={{
                    textarea: {
                      color: EDITOR_CHROME.textPrimary,
                      background: 'transparent',
                      minHeight: 96,
                      padding: '10px 12px',
                      fontSize: 12,
                      lineHeight: 1.55,
                      caretColor: EDITOR_CHROME.textPrimary,
                    },
                  }}
                  style={{
                    background: 'transparent',
                    borderColor: 'transparent',
                    boxShadow: 'none',
                  }}
                  onChange={(event) => {
                    onAnnotationDraftChange(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if ((event.nativeEvent as KeyboardEvent).isComposing) return;
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                      void saveAndCloseAnnotationMarkdownComposer();
                      return;
                    }
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                    }
                  }}
                />
              </div>
            </div>
          ) : null}
          {showPromptDesignEditor && transactionManager ? (
            <PromptCardDesignEditor
              target={currentTarget}
              transactionManager={transactionManager}
              tokensService={tokensService}
              refreshKey={refreshKey}
              onRefreshRequest={() => {
                setRefreshKey((value) => value + 1);
              }}
            />
          ) : null}
          {!isAnnotationSession && !bubbleStyleEditorOpen && styleSummaryLines.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 10px',
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${EDITOR_CHROME.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: EDITOR_CHROME.textSecondary,
                }}
              >
                样式编辑
              </span>
              {styleSummaryLines.map((line) => (
                <span
                  key={line}
                  style={{
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: EDITOR_CHROME.textMuted,
                    wordBreak: 'break-word',
                  }}
                >
                  {line}
                </span>
              ))}
            </div>
          ) : null}
          {currentAgentTask ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '2px 4px 0',
                marginTop: -2,
              }}
            >
              {currentAgentTask.status === 'completed' ? (
                <CheckCircleFilled style={{ color: '#22c55e', fontSize: 13, marginTop: 3 }} />
              ) : currentAgentTask.status === 'error' ? (
                <ExclamationCircleFilled style={{ color: '#ef4444', fontSize: 13, marginTop: 3 }} />
              ) : (
                <div style={{ marginTop: 2 }}>
                  <AgentSparkleIcon />
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color:
                        currentAgentTask.status === 'error' ? '#ef4444' : EDITOR_CHROME.textPrimary,
                    }}
                  >
                    {currentAgentTask.status === 'pending'
                      ? 'AI 准备中'
                      : currentAgentTask.status === 'created'
                        ? 'AI 正在修改'
                        : currentAgentTask.status === 'completed'
                          ? 'AI 修改完成'
                          : 'AI 修改失败'}
                  </span>
                  {currentAgentTask.status === 'error' && currentTaskErrorMessage ? (
                    <IconActionButton
                      title="复制错误信息"
                      icon={<CopyOutlined />}
                      tone="danger"
                      style={{
                        width: 20,
                        minWidth: 20,
                        height: 20,
                        fontSize: 12,
                        marginLeft: 1,
                      }}
                      onClick={() => {
                        void copyPromptCardTextToClipboard(currentTaskErrorMessage).catch(
                          () => undefined,
                        );
                      }}
                    />
                  ) : null}
                </div>
                {currentTaskDescription ? (
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: EDITOR_CHROME.textMuted,
                      marginTop: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {currentTaskDescription}
                    {currentAgentTask.sessionId ? ` · Session ${currentAgentTask.sessionId}` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );

    const overlayNode = (
      <MobileSelectionOverlay
        currentTarget={currentTarget}
        promptVisible={promptVisible}
        promptCardTop={promptPosition?.top ?? 0}
        onDismiss={() => {
          void saveAndDismissPromptCard().catch(() => undefined);
        }}
      />
    );

    if (portalContainer) {
      return createPortal(
        <>
          {overlayNode}
          {promptCardNode}
        </>,
        portalContainer,
      );
    }

    return (
      <>
        {overlayNode}
        {promptCardNode}
      </>
    );
  },
);
