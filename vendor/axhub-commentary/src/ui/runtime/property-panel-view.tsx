import React from 'react';
import { isMobileDevice } from '../../utils/mobile-detect';
import {
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  CaretRightFilled,
  ExclamationCircleFilled,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  HistoryOutlined,
  QuestionCircleOutlined,
  LinkOutlined,
  MoonOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  RightOutlined,
  SaveOutlined,
  SelectOutlined,
  SettingOutlined,
  SlidersOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { setPageAnimationsDisabled } from '../../utils/page-animation-toggle';
import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Space,
  Switch,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import { setPageZoomEnabled } from '../../utils/page-zoom-toggle';
import { installFloatingDrag, type FloatingPosition } from '../floating-drag';
import {
  clampFloatingPosition,
  computeCompactPanelPosition,
  dockFloatingPanelRight,
  type RectLike,
} from '../panel-compact-position';
import { ReactPageTweakPanel } from '../property-panel/react-page-tweak-panel';
import {
  COMMENT_SHORTCUT_LONG_PRESS_MS,
  commentShortcutSettingsEqual,
  DEFAULT_COMMENT_SHORTCUT_SETTINGS,
  sanitizeCommentShortcutSettings,
  type CommentShortcutSettings,
} from '../../core/editor/comment-shortcut-settings';
import { getAgentPromptToolbarActionState } from '../agent-prompt-action';
import { resolveExternalEditingStatusDescription } from './external-editing-status-hint';
import {
  CloseToolIcon,
  AgentSparkleIcon,
  AgentToolbarIconButton,
  AgentToolbarShell,
} from './action-buttons';
import { deriveAgentUiState } from './agent-ui-state';
import { ShortcutCaptureCard, shortcutCaptureHintStyle } from './shortcut-capture-card';
import { notifyRuntimeMessage } from './runtime-feedback';
import {
  buildAiWorkspaceBreadcrumbs,
  filterAiExecutionRecentWorkspaces,
  getAiExecutionRecentWorkspaceName,
  normalizeAiExecutionRecentWorkspaces,
  recordAiExecutionRecentWorkspace,
  removeAiExecutionRecentWorkspace,
  type AiExecutionRecentWorkspace,
} from './ai-workspace-picker';
import {
  appendRecentSessionActivities,
  limitVisibleSessionActivities,
  resolveSessionActivityTarget,
} from './session-activity-utils';
import { resolveRuntimePopupContainer } from './popup-container';
import { pageConfigPanelBodyStyle, PROPERTY_PANEL_LOCAL_STYLES, panelStyle } from './styles';
import {
  BRAND_PRIMARY_SHADOW,
  COMPACT_TOOL_SIZE,
  COMPACT_TOOLBAR_HEIGHT,
  COMPACT_TOOLBAR_WIDTH,
  EDITOR_CHROME,
  FLOATING_CLAMP_MARGIN,
  HEADER_CONTROL_SIZE,
  HEADER_HORIZONTAL_PADDING,
  HEADER_VERTICAL_PADDING,
  PAGE_CONFIG_PANEL_WIDTH,
  PROPERTY_PANEL_RIGHT,
  PROPERTY_PANEL_TOP,
  TOOLBAR_BOTTOM,
} from './theme';
import type { PropertyPanelHandle, PropertyPanelViewProps } from './types';
import type { SessionActivityItem, SessionActivityTarget } from '../../core/editor/contracts';
import type {
  CommentaryHostToolbarAction,
  CommentaryHostToolbarState,
} from '../../web-editor-types';

const AGENT_WAKE_FAILURE_MESSAGE = 'AI 唤醒失败，请在终端执行 npx @axhub/acp@latest，再重试';
const AGENT_WAKE_TIMEOUT_MS = 12000;
const AGENT_INTERRUPT_TIMEOUT_MS = 12000;
const COMMENTARY_SKILL_URL =
  'https://github.com/lintendo/Axhub-Skills/blob/main/skills/axhub-commentary/SKILL.md';
const AGENT_MENU_OPTIONS = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'opencode', label: 'OpenCode' },
] as const;
const PROPERTY_PANEL_HELP_TOOLTIP =
  '可以直接把需求发给你正在用的 IDE 或本地 agent，也可以先在页面上批注，让它帮你生成或整理设计决策。';
const SELECTION_MODE_TOGGLE_SHORTCUT_LABEL = 'Ctrl / Cmd + S';
const PARENT_SELECT_SHORTCUT_LABEL = '↑';
const PARENT_RETURN_SHORTCUT_LABEL = '↓';
const DELETE_ELEMENT_SHORTCUT_LABEL = 'Delete / Backspace';
const PARENT_SELECT_INPUT_TOUCHED_ATTR = 'data-we-parent-select-input-touched';

function buildCommentarySkillGuidancePrompt(skillInstallSource?: string | null): string {
  const resolvedSkillInstallSource =
    typeof skillInstallSource === 'string' && skillInstallSource.trim()
      ? skillInstallSource.trim()
      : '';
  return [
    '处理页面或组件批注、设计决策、多方案探索、多方案对比时，默认使用 axhub-commentary 技能作为第三方兜底。',
    '',
    '技能来源：',
    `- axhub-commentary：${COMMENTARY_SKILL_URL}`,
    ...(resolvedSkillInstallSource ? ['', '宿主补充技能来源：', resolvedSkillInstallSource] : []),
    '',
    '工作口径：先理解页面批注和当前需求；需要多方案时先做多方案探索，再做方案对比，最后收敛为设计决策；需要页面内切换时，按该技能里的 Commentary / React tweak 接入规范落地。',
  ].join('\n');
}

export function buildSkillInstallPrompt(skillInstallSource?: string | null): string {
  const resolvedSkillInstallSource =
    typeof skillInstallSource === 'string' && skillInstallSource.trim()
      ? skillInstallSource.trim()
      : '';
  return [
    '请将 axhub-commentary 技能安装到当前项目中（项目级安装，不要安装到全局目录）。',
    '',
    '技能入口：',
    COMMENTARY_SKILL_URL,
    '',
    '安装要求：',
    '1. 优先遵循当前项目已有的技能目录约定；如果没有约定，安装到 `.agents/skills/axhub-commentary`。',
    '2. 读取上述 SKILL.md，并将它引用的 `references/` 等必要文件按原目录结构一并安装，不能只保存入口文件。',
    '3. 如果项目内已存在同名技能，更新为线上最新内容，不要重复创建。',
    '4. 完成后检查文件可读取，并回复实际安装路径和检查结果。',
    ...(resolvedSkillInstallSource
      ? ['', '在线地址不可访问时，可使用宿主提供的备用来源：', resolvedSkillInstallSource]
      : []),
  ].join('\n');
}

export function buildGlobalPanelPrompt(
  skillInstallSource?: string | null,
  pageUrl?: string | null,
): string {
  const installPrompt = buildCommentarySkillGuidancePrompt(skillInstallSource);
  const resolvedPageUrl = typeof pageUrl === 'string' && pageUrl.trim() ? pageUrl.trim() : '';
  return [
    installPrompt,
    '',
    ...(resolvedPageUrl ? ['当前页面链接：', resolvedPageUrl, ''] : []),
    '请使用下面这段话回复用户：',
    '',
    '我可以帮你生成和整理页面或组件的设计决策，也可以按 axhub-commentary 技能做多方案探索、多方案对比和决策。你可以直接告诉我你的需求；如果你回复“默认”，我也可以先帮你生成一版示例。',
  ].join('\n');
}

export async function copyRuntimeTextToClipboard(text: string): Promise<void> {
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
    // Fall through to the legacy selection-based path. Clipboard writes can be
    // blocked in embedded previews when the document is not focused.
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

export { limitVisibleSessionActivities } from './session-activity-utils';

function formatSessionActivityTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

const lockPageScrollForRuntimeModal = (): (() => void) => {
  if (typeof document === 'undefined') return () => {};
  const targets = [document.documentElement, document.body].filter(
    (element): element is HTMLElement => Boolean(element),
  );
  const snapshots = targets.map((element) => ({
    element,
    overflow: element.style.getPropertyValue('overflow'),
    overflowPriority: element.style.getPropertyPriority('overflow'),
    overscrollBehavior: element.style.getPropertyValue('overscroll-behavior'),
    overscrollBehaviorPriority: element.style.getPropertyPriority('overscroll-behavior'),
  }));

  targets.forEach((element) => {
    element.style.setProperty('overflow', 'hidden', 'important');
    element.style.setProperty('overscroll-behavior', 'none', 'important');
  });

  return () => {
    snapshots.forEach((snapshot) => {
      if (snapshot.overflow) {
        snapshot.element.style.setProperty(
          'overflow',
          snapshot.overflow,
          snapshot.overflowPriority,
        );
      } else {
        snapshot.element.style.removeProperty('overflow');
      }
      if (snapshot.overscrollBehavior) {
        snapshot.element.style.setProperty(
          'overscroll-behavior',
          snapshot.overscrollBehavior,
          snapshot.overscrollBehaviorPriority,
        );
      } else {
        snapshot.element.style.removeProperty('overscroll-behavior');
      }
    });
  };
};

const normalizeAiExecutionWorkspacePath = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const getPathDisplayName = (value: unknown): string => {
  const normalized = normalizeAiExecutionWorkspacePath(value).replace(/[\\/]+$/u, '');
  if (!normalized) return '';
  return normalized.split(/[\\/]/u).filter(Boolean).pop() || normalized;
};

type LocalDirectoryBrowserState = {
  path: string;
  home: string;
  parent: string | null;
  roots: string[];
  directories: Array<{ name: string; path: string }>;
};

const readLocalDirectoryBrowserResult = (value: unknown): LocalDirectoryBrowserState | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const path = normalizeAiExecutionWorkspacePath(record.path);
  if (!path) return null;
  const directories = Array.isArray(record.directories)
    ? record.directories
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const itemRecord = item as Record<string, unknown>;
          const name = normalizeAiExecutionWorkspacePath(itemRecord.name);
          const directoryPath = normalizeAiExecutionWorkspacePath(itemRecord.path);
          return name && directoryPath ? { name, path: directoryPath } : null;
        })
        .filter((item): item is { name: string; path: string } => Boolean(item))
    : [];
  const roots = Array.isArray(record.roots)
    ? record.roots.map((item) => normalizeAiExecutionWorkspacePath(item)).filter(Boolean)
    : [];

  return {
    path,
    home: normalizeAiExecutionWorkspacePath(record.home),
    parent: normalizeAiExecutionWorkspacePath(record.parent) || null,
    roots,
    directories,
  };
};

export const PropertyPanelView = React.forwardRef<PropertyPanelHandle, PropertyPanelViewProps>(
  function PropertyPanelView(props, ref) {
    const {
      options,
      currentTarget,
      uiMode,
      toolMinimized,
      selectionModeActive,
      propertyPanelVisible = true,
      propertyPanelOpen,
      inlineTextEditing = false,
      uiSettings: propUiSettings,
      interactionProfile,
      agentVisualState,
      agentProviderAvailabilities,
      onPropertyPanelOpenChange,
      onAgentVisualStateChange,
      onUiSettingsChange,
      onHoverSelectionSuppressedChange,
      onSelectionInteractionLockChange,
      onUiModeChange,
      onToolMinimizedChange,
      onSelectionModeActiveChange,
      onTargetChange,
      onRefreshNoteState,
      onInlineTextEditingChange,
      onBlockingLayerOpenChange,
      canEditText,
      draftText,
      textDirty,
      onTextDraftChange,
      onCancelText,
      onConfirmText,
      images,
      onRemoveImage,
      onNotePasteCapture,
      canEditNote,
      draftNote,
      noteDirty,
      onDraftChange,
      onClearCurrentElementEdits,
      onConfirmNote,
      onDismissSelection,
    } = props;
    const toolbarMode = props.toolbarMode ?? options.toolbarMode ?? 'inline';
    const isHostToolbarMode = toolbarMode === 'host';
    const hideExecutionControls = Boolean(options.hideExecutionControls);
    const hostSurfaceVisibilityControl = options.hostSurfaceVisibilityControl;
    const selectionModeAvailable = interactionProfile !== 'text-comment';

    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const pagePanelRef = React.useRef<HTMLDivElement | null>(null);
    const pagePanelBodyRef = React.useRef<HTMLDivElement | null>(null);
    const pagePanelHeaderRef = React.useRef<HTMLDivElement | null>(null);
    const toolbarHeaderRef = React.useRef<HTMLDivElement | null>(null);
    const minimizedButtonRef = React.useRef<HTMLButtonElement | null>(null);
    const textComposerRef = React.useRef<HTMLDivElement | null>(null);
    const noteComposerRef = React.useRef<HTMLDivElement | null>(null);
    const inlineTextEditingRef = React.useRef(inlineTextEditing);
    const shortcutCardRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const styleObserverRef = React.useRef<MutationObserver | null>(null);
    const styleObserverRafIdRef = React.useRef<number | null>(null);
    const currentTargetRef = React.useRef<Element | null>(currentTarget);
    const toolbarPositionRef = React.useRef<FloatingPosition | null>(null);
    const pagePanelPositionRef = React.useRef<FloatingPosition | null>(
      options.initialPosition ?? null,
    );
    const onDismissSelectionRef = React.useRef(onDismissSelection);
    const onTargetChangeRef = React.useRef(onTargetChange);
    const hostToolbarListenersRef = React.useRef<Set<(state: CommentaryHostToolbarState) => void>>(
      new Set(),
    );
    const [undoCount, setUndoCount] = React.useState(0);
    const [redoCount, setRedoCount] = React.useState(0);
    const [modifiedCount, setModifiedCount] = React.useState(
      Math.max(0, options.getModifiedElementCount?.() ?? 0),
    );
    const [actionBusy, setActionBusy] = React.useState(false);
    const [hostSurfaceVisible, setHostSurfaceVisible] = React.useState(
      () => hostSurfaceVisibilityControl?.initialVisible !== false,
    );
    const [markdownSourceEditorOpen, setMarkdownSourceEditorOpen] = React.useState(
      () => options.getMarkdownSourceEditorOpen?.() === true,
    );
    const [agentPromptSending, setAgentPromptSending] = React.useState(false);
    const [agentPromptInterrupting, setAgentPromptInterrupting] = React.useState(false);
    const [agentWakeChecking, setAgentWakeChecking] = React.useState(false);
    const [sessionActivityCardOpen, setSessionActivityCardOpen] = React.useState(false);
    const [sessionActivities, setSessionActivities] = React.useState<SessionActivityItem[]>([]);
    const [toolbarPosition, setToolbarPosition] = React.useState<FloatingPosition | null>(null);
    const [pagePanelPosition, setPagePanelPosition] = React.useState<FloatingPosition | null>(
      options.initialPosition ?? null,
    );
    const [toolbarDragging, setToolbarDragging] = React.useState(false);
    const [viewportSize, setViewportSize] = React.useState(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const [compactAnchorRect, setCompactAnchorRect] = React.useState<RectLike | null>(null);
    const [shortcutDialogOpen, setShortcutDialogOpen] = React.useState(false);
    const [shortcutDraft, setShortcutDraft] = React.useState<CommentShortcutSettings>(
      options.getCommentShortcutSettings?.() ?? {
        ...DEFAULT_COMMENT_SHORTCUT_SETTINGS,
      },
    );
    const [capturingShortcutIndex, setCapturingShortcutIndex] = React.useState<number | null>(null);
    const [panelRefreshKey, setPanelRefreshKey] = React.useState(0);
    const [tweakRevision, setTweakRevision] = React.useState(0);
    const [agentPromptSendingElementKey, setAgentPromptSendingElementKey] = React.useState<
      string | null
    >(null);
    const [settingsPopoverOpen, setSettingsPopoverOpen] = React.useState(false);
    const [skillInstallPromptCopied, setSkillInstallPromptCopied] = React.useState(false);
    const skillInstallFeedbackTimerRef = React.useRef<number | null>(null);
    const [keyboardShortcutsDialogOpen, setKeyboardShortcutsDialogOpen] = React.useState(false);
    const [annotationToolbarTick, setAnnotationToolbarTick] = React.useState(0);
    const uiSettings = React.useMemo(
      () => options.getUiSettings?.() ?? propUiSettings,
      [options, panelRefreshKey, propUiSettings],
    );
    const [aiExecutionWorkspacePath, setAiExecutionWorkspacePath] = React.useState(() =>
      normalizeAiExecutionWorkspacePath(options.aiExecutionWorkspacePath),
    );
    const [directoryPickerOpen, setDirectoryPickerOpen] = React.useState(false);
    const [directoryPickerBusy, setDirectoryPickerBusy] = React.useState(false);
    const [directoryPickerError, setDirectoryPickerError] = React.useState('');
    const [directoryPickerState, setDirectoryPickerState] =
      React.useState<LocalDirectoryBrowserState | null>(null);
    const [directoryPickerPathInput, setDirectoryPickerPathInput] = React.useState('');
    const [directoryPickerRecentWorkspaces, setDirectoryPickerRecentWorkspaces] = React.useState<
      AiExecutionRecentWorkspace[]
    >([]);
    const [directoryPickerRecentOpen, setDirectoryPickerRecentOpen] = React.useState(false);
    const [directoryPickerRecentQuery, setDirectoryPickerRecentQuery] = React.useState('');
    const [directoryPickerRecentActiveIndex, setDirectoryPickerRecentActiveIndex] =
      React.useState(0);
    const [directoryPickerRecentError, setDirectoryPickerRecentError] = React.useState('');
    const directoryPickerPathFieldRef = React.useRef<HTMLDivElement>(null);
    const directoryPickerBreadcrumbRef = React.useRef<HTMLDivElement>(null);
    const agentProviderAvailabilityMap = React.useMemo(
      () => new Map(agentProviderAvailabilities.map((item) => [item.provider, item] as const)),
      [agentProviderAvailabilities],
    );
    React.useEffect(() => {
      setAiExecutionWorkspacePath(
        normalizeAiExecutionWorkspacePath(options.aiExecutionWorkspacePath),
      );
    }, [options.aiExecutionWorkspacePath]);

    React.useEffect(
      () => () => {
        if (skillInstallFeedbackTimerRef.current !== null) {
          window.clearTimeout(skillInstallFeedbackTimerRef.current);
        }
      },
      [],
    );

    React.useEffect(() => {
      inlineTextEditingRef.current = inlineTextEditing;
    }, [inlineTextEditing]);

    React.useEffect(() => {
      setHostSurfaceVisible(hostSurfaceVisibilityControl?.initialVisible !== false);
    }, [hostSurfaceVisibilityControl?.initialVisible]);

    React.useEffect(() => {
      onDismissSelectionRef.current = onDismissSelection;
    }, [onDismissSelection]);

    React.useEffect(() => {
      onTargetChangeRef.current = onTargetChange;
    }, [onTargetChange]);

    currentTargetRef.current = currentTarget;
    React.useEffect(() => {
      if (!options.subscribeTweak) return;
      return options.subscribeTweak(() => {
        setTweakRevision((value) => value + 1);
      });
    }, [options]);

    const pageTweakEntries = React.useMemo(
      () => options.getPageTweakEntries?.() ?? [],
      [options, tweakRevision],
    );
    const hasPageTweakEntries = pageTweakEntries.length > 0;
    const showPropertyPanelToolbarButton = propertyPanelVisible && hasPageTweakEntries;
    const pageEditingSettingsAvailable = options.pageEditingSettingsAvailable !== false;
    const showPropertyPanelSettingsItem =
      pageEditingSettingsAvailable && propertyPanelVisible && !showPropertyPanelToolbarButton;
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
      visualState: uiSettings.agentAwake ? 'awake' : agentVisualState,
      getElementAgentTaskState: options.getElementAgentTaskState,
      getVisibleElementAgentTaskStates: options.getVisibleElementAgentTaskStates,
      getHasReusableAgentConversation: options.getHasReusableAgentConversation,
      getAgentBridgeConnected: options.getAgentBridgeConnected,
    });
    const visibleExecutionTerminalTaskCount = (
      options.getVisibleElementAgentTaskStates?.() ?? []
    ).filter((task) => task.status === 'completed' || task.status === 'error').length;
    const visibleTerminalTaskCount = hideExecutionControls ? 0 : visibleExecutionTerminalTaskCount;
    const currentAgentConversation = options.getCurrentAgentConversationState?.() ?? null;
    const sessionActivityTarget = React.useMemo(
      () =>
        resolveSessionActivityTarget({
          requestId: currentAgentTask?.requestId ?? null,
          sessionId: currentAgentTask?.sessionId ?? null,
          provider: currentAgentTask?.provider ?? null,
          conversationSessionId: currentAgentConversation?.sessionId ?? null,
          conversationProvider: currentAgentConversation?.provider ?? null,
        }),
      [
        currentAgentConversation?.provider,
        currentAgentConversation?.sessionId,
        currentAgentTask?.provider,
        currentAgentTask?.requestId,
        currentAgentTask?.sessionId,
      ],
    );
    const activeTaskCanInterrupt = Boolean(
      currentTarget ? options.getCanAbortAgentPrompt?.(currentTarget) : false,
    );
    const pageTaskCanInterrupt = Boolean(options.getCanAbortAgentPrompt?.(null));
    const currentTaskIsSending = Boolean(
      agentPromptSending &&
        currentAgentTask &&
        agentPromptSendingElementKey &&
        currentAgentTask.elementKey === agentPromptSendingElementKey,
    );
    React.useEffect(() => {
      if (!agentPromptSending) return;
      if (currentTaskRunning && currentTaskSessionReady) {
        setAgentPromptSending(false);
        setAgentPromptSendingElementKey(null);
      }
    }, [currentTaskRunning, currentTaskSessionReady, agentPromptSending]);

    React.useEffect(() => {
      if (!sessionActivityCardOpen) {
        setSessionActivities([]);
        return;
      }
      if (!options.subscribeSessionActivity || !sessionActivityTarget) {
        setSessionActivities([]);
        return;
      }

      setSessionActivities([]);
      return options.subscribeSessionActivity(sessionActivityTarget, (item) => {
        setSessionActivities((previous) => appendRecentSessionActivities(previous, item));
      });
    }, [options, sessionActivityCardOpen, sessionActivityTarget]);

    const visibleSessionActivities = React.useMemo(
      () => limitVisibleSessionActivities(sessionActivities),
      [sessionActivities],
    );

    const disconnectStyleObserver = React.useCallback(() => {
      if (styleObserverRafIdRef.current !== null) {
        window.cancelAnimationFrame(styleObserverRafIdRef.current);
        styleObserverRafIdRef.current = null;
      }
      try {
        styleObserverRef.current?.disconnect();
      } catch {
        // Best-effort cleanup.
      }
      styleObserverRef.current = null;
    }, [options.skillInstallSource]);

    const requestPanelRefresh = React.useCallback(() => {
      setPanelRefreshKey((value) => value + 1);
    }, [options.skillInstallSource]);

    const scheduleLiveStyleRefresh = React.useCallback(() => {
      if (styleObserverRafIdRef.current !== null) return;
      styleObserverRafIdRef.current = window.requestAnimationFrame(() => {
        styleObserverRafIdRef.current = null;
        requestPanelRefresh();
      });
    }, [requestPanelRefresh]);

    const connectStyleObserver = React.useCallback(
      (element: Element | null) => {
        disconnectStyleObserver();
        if (!element || !element.isConnected || typeof MutationObserver === 'undefined') return;

        const observer = new MutationObserver(() => {
          if (currentTargetRef.current !== element) return;
          scheduleLiveStyleRefresh();
        });

        try {
          observer.observe(element, {
            attributes: true,
            attributeFilter: ['style'],
          });
          styleObserverRef.current = observer;
        } catch {
          try {
            observer.disconnect();
          } catch {
            // noop
          }
        }
      },
      [disconnectStyleObserver, scheduleLiveStyleRefresh],
    );

    const clampToViewport = React.useCallback(
      (
        position: FloatingPosition,
        sizeOverride?: { width: number; height: number },
      ): FloatingPosition => {
        const root = rootRef.current;
        const rect = root?.getBoundingClientRect();
        const width =
          sizeOverride?.width ??
          rect?.width ??
          (toolMinimized ? COMPACT_TOOL_SIZE : COMPACT_TOOLBAR_WIDTH);
        const height =
          sizeOverride?.height ?? rect?.height ?? (toolMinimized ? COMPACT_TOOL_SIZE : 72);

        return clampFloatingPosition({
          position,
          size: { width, height },
          viewport: viewportSize,
          margin: FLOATING_CLAMP_MARGIN,
        });
      },
      [toolMinimized, viewportSize],
    );

    const applyToolbarPosition = React.useCallback(
      (nextPosition: FloatingPosition | null) => {
        toolbarPositionRef.current = nextPosition
          ? clampToViewport(nextPosition, {
              width: COMPACT_TOOL_SIZE,
              height: COMPACT_TOOL_SIZE,
            })
          : null;
        setToolbarPosition(toolbarPositionRef.current);
      },
      [clampToViewport],
    );

    const clampPagePanelToViewport = React.useCallback(
      (
        position: FloatingPosition,
        sizeOverride?: { width: number; height: number },
      ): FloatingPosition => {
        const pagePanel = pagePanelRef.current;
        const rect = pagePanel ? pagePanel.getBoundingClientRect() : null;
        const size =
          sizeOverride ??
          (rect
            ? { width: rect.width, height: rect.height }
            : { width: PAGE_CONFIG_PANEL_WIDTH, height: 160 });

        return clampFloatingPosition({
          position,
          size,
          viewport: viewportSize,
          margin: FLOATING_CLAMP_MARGIN,
        });
      },
      [viewportSize],
    );

    const applyPanelPosition = React.useCallback(
      (nextPosition: FloatingPosition | null) => {
        pagePanelPositionRef.current = nextPosition ? clampPagePanelToViewport(nextPosition) : null;
        setPagePanelPosition(pagePanelPositionRef.current);
        options.onPositionChange?.(pagePanelPositionRef.current);
      },
      [clampPagePanelToViewport, options],
    );

    const dockPagePanelRight = React.useCallback(() => {
      const pagePanel = pagePanelRef.current;
      const rect = pagePanel ? pagePanel.getBoundingClientRect() : null;
      const size = rect
        ? { width: rect.width, height: rect.height }
        : { width: PAGE_CONFIG_PANEL_WIDTH, height: 160 };
      applyPanelPosition(
        dockFloatingPanelRight({
          currentPosition: pagePanelPositionRef.current,
          size,
          viewport: viewportSize,
          panelTop: PROPERTY_PANEL_TOP,
          panelRight: PROPERTY_PANEL_RIGHT,
          margin: FLOATING_CLAMP_MARGIN,
        }),
      );
    }, [applyPanelPosition, viewportSize]);

    const syncPanelMetaState = React.useCallback(() => {
      setModifiedCount(Math.max(0, options.getModifiedElementCount?.() ?? 0));
    }, [options]);

    const runAction = React.useCallback(
      async <T,>(action?: () => T | Promise<T>): Promise<T | undefined> => {
        if (!action) return;
        setActionBusy(true);
        try {
          return await action();
        } finally {
          setActionBusy(false);
          syncPanelMetaState();
        }
      },
      [syncPanelMetaState],
    );

    const handleHtmlFileSaveAction = React.useCallback(async (): Promise<void> => {
      if (actionBusy || !options.htmlFileSaveEnabled || !options.onHostToolbarAction) return;

      try {
        let result: unknown = false;
        await runAction(async () => {
          result = await options.onHostToolbarAction?.({
            type: 'save-html-all',
          });
          if (result === false) throw new Error('当前宿主无法保存 HTML 文件');
        });
        const record =
          result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
        const message =
          typeof record.message === 'string' && record.message.trim()
            ? record.message.trim()
            : 'HTML 文本和样式已保存';
        notifyRuntimeMessage(record.changed === false ? 'info' : 'success', message);
      } catch (error) {
        notifyRuntimeMessage(
          'error',
          error instanceof Error ? error.message : 'HTML 文件保存失败，请稍后重试',
        );
      }
    }, [actionBusy, options.htmlFileSaveEnabled, options.onHostToolbarAction, runAction]);

    const handleToggleHostSurfaceVisibility = React.useCallback(async (): Promise<void> => {
      if (actionBusy || !hostSurfaceVisibilityControl || !options.onHostToolbarAction) return;

      const requestedVisible = !hostSurfaceVisible;
      try {
        const result = await runAction(() =>
          options.onHostToolbarAction?.({
            type: 'set-host-surface-visibility',
            visible: requestedVisible,
          }),
        );
        if (result === false || result === undefined) {
          throw new Error('当前宿主无法切换窗口显示状态');
        }
        const record =
          result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
        setHostSurfaceVisible(
          typeof record.visible === 'boolean' ? record.visible : requestedVisible,
        );
      } catch (error) {
        notifyRuntimeMessage(
          'error',
          error instanceof Error ? error.message : '窗口显示状态切换失败，请稍后重试',
        );
      }
    }, [
      actionBusy,
      hostSurfaceVisibilityControl,
      hostSurfaceVisible,
      options.onHostToolbarAction,
      runAction,
    ]);

    const agentAwake = effectiveVisualState === 'awake';

    const wakeAgentForAction = React.useCallback(async (): Promise<boolean> => {
      if (agentWakeChecking) {
        return false;
      }

      if (agentAwake && options.getAgentBridgeConnected?.() !== false) {
        return true;
      }

      if (!options.onWakeAgent) {
        return options.getAgentBridgeConnected?.() !== false;
      }

      setAgentWakeChecking(true);
      const createWakeTimeout = () =>
        new Promise<false>((resolve) => {
          window.setTimeout(() => resolve(false), AGENT_WAKE_TIMEOUT_MS);
        });
      try {
        const wakeResult = await Promise.race([options.onWakeAgent(), createWakeTimeout()]);
        if (wakeResult !== true) {
          notifyRuntimeMessage('warning', AGENT_WAKE_FAILURE_MESSAGE);
          return false;
        }
        onAgentVisualStateChange('awake');
        return true;
      } catch {
        notifyRuntimeMessage('warning', AGENT_WAKE_FAILURE_MESSAGE);
        return false;
      } finally {
        setAgentWakeChecking(false);
      }
    }, [agentAwake, agentWakeChecking, onAgentVisualStateChange, options]);

    const handleConfirmSendPromptToAgent = React.useCallback(async () => {
      if (!options.onSendPromptToAgent) return;
      const ready = await wakeAgentForAction();
      if (!ready) return;

      setAgentPromptSending(true);
      setAgentPromptSendingElementKey(currentAgentTask?.elementKey ?? null);
      setAgentPromptInterrupting(false);
      try {
        await options.onSendPromptToAgent(currentTarget);
      } catch {
        // The bridge already surfaces user-facing feedback.
      } finally {
        setAgentPromptSending(false);
        setAgentPromptInterrupting(false);
        setAgentPromptSendingElementKey(null);
        syncPanelMetaState();
      }
    }, [
      currentAgentTask?.elementKey,
      currentTarget,
      options,
      syncPanelMetaState,
      wakeAgentForAction,
    ]);

    const handleInterruptSendPromptToAgent = React.useCallback(
      async (target?: Element | null) => {
        if (!options.onAbortAgentPrompt) return;
        setAgentPromptInterrupting(true);
        const createInterruptTimeout = () =>
          new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), AGENT_INTERRUPT_TIMEOUT_MS);
          });
        try {
          await Promise.race([
            options.onAbortAgentPrompt(target === undefined ? currentTarget : target),
            createInterruptTimeout(),
          ]);
        } catch {
          // The bridge already surfaces user-facing feedback.
        } finally {
          setAgentPromptInterrupting(false);
        }
      },
      [currentTarget, options],
    );

    const restoreTool = React.useCallback(() => {
      setCompactAnchorRect(null);
      onToolMinimizedChange(false);
    }, [onToolMinimizedChange]);

    const minimizeTool = React.useCallback(() => {
      setCompactAnchorRect(null);
      onToolMinimizedChange(true);
    }, [onToolMinimizedChange]);

    const handleTogglePropertyPanel = React.useCallback(
      (nextOpen = !propertyPanelOpen) => {
        if (nextOpen && toolMinimized) {
          restoreTool();
        }
        onPropertyPanelOpenChange(nextOpen);
      },
      [onPropertyPanelOpenChange, propertyPanelOpen, restoreTool, toolMinimized],
    );

    const closeShortcutDialog = React.useCallback(() => {
      setShortcutDialogOpen(false);
      setCapturingShortcutIndex(null);
      options.onCommentShortcutDialogOpenChange?.(false);
    }, [options]);

    const shortcutValidationError = React.useMemo(() => {
      const [first, second] = shortcutDraft.shortcuts;
      if (first && second && first === second) {
        return '两个快捷键不能配置为同一个修饰键。';
      }
      return '';
    }, [shortcutDraft.shortcuts]);

    const showExpandedPanel = !toolMinimized && propertyPanelOpen;
    const pageZoomActive = showExpandedPanel && uiSettings.pageZoomEnabled;
    const previousPageZoomEnabledRef = React.useRef(uiSettings.pageZoomEnabled);
    const previousPageZoomActiveRef = React.useRef(pageZoomActive);

    const handleShortcutDraftChange = React.useCallback(
      (updater: (prev: CommentShortcutSettings) => CommentShortcutSettings) => {
        setShortcutDraft((prev) => sanitizeCommentShortcutSettings(updater(prev)));
      },
      [],
    );

    const handleShortcutSave = React.useCallback(() => {
      if (shortcutValidationError) return;
      const nextSettings = sanitizeCommentShortcutSettings(shortcutDraft);
      const currentSettings = sanitizeCommentShortcutSettings(
        options.getCommentShortcutSettings?.() ?? DEFAULT_COMMENT_SHORTCUT_SETTINGS,
      );
      if (!commentShortcutSettingsEqual(nextSettings, currentSettings)) {
        options.onCommentShortcutSettingsChange?.(nextSettings);
      }
      closeShortcutDialog();
    }, [closeShortcutDialog, options, shortcutDraft, shortcutValidationError]);

    React.useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      setToolbarDragging(false);

      const updatePosition = (nextPosition: FloatingPosition) => {
        setCompactAnchorRect(null);
        applyToolbarPosition(nextPosition);
      };

      if (toolMinimized) {
        const handle = minimizedButtonRef.current;
        if (!handle) return;
        return installFloatingDrag({
          handleEl: handle,
          targetEl: root,
          clampMargin: FLOATING_CLAMP_MARGIN,
          onPositionChange: updatePosition,
          moveThresholdPx: isMobileDevice() ? 8 : 3,
          onDragStateChange: (active) => {
            setToolbarDragging(active);
          },
        });
      }

      const handles = [toolbarHeaderRef.current].filter((handle): handle is HTMLDivElement =>
        Boolean(handle),
      );
      if (handles.length === 0) return;

      const cleanups = handles.map((handle) =>
        installFloatingDrag({
          handleEl: handle,
          targetEl: root,
          clampMargin: FLOATING_CLAMP_MARGIN,
          onPositionChange: updatePosition,
          moveThresholdPx: isMobileDevice() ? 8 : 3,
          ignoreInteractiveChildren: true,
          onDragStateChange: (active) => {
            setToolbarDragging(active);
          },
        }),
      );

      return () => {
        setToolbarDragging(false);
        cleanups.forEach((cleanup) => cleanup());
      };
    }, [applyToolbarPosition, showExpandedPanel, toolMinimized]);

    React.useEffect(() => {
      const pagePanel = pagePanelRef.current;
      const pagePanelHeader = pagePanelHeaderRef.current;
      if (!pagePanel || !pagePanelHeader || !showExpandedPanel || toolMinimized) return;

      return installFloatingDrag({
        handleEl: pagePanelHeader,
        targetEl: pagePanel,
        clampMargin: FLOATING_CLAMP_MARGIN,
        onPositionChange: applyPanelPosition,
        moveThresholdPx: isMobileDevice() ? 8 : 3,
        ignoreInteractiveChildren: true,
        onDragStateChange: (active) => {
          setToolbarDragging(active);
        },
      });
    }, [applyPanelPosition, showExpandedPanel, toolMinimized]);

    React.useEffect(() => {
      const updateViewport = () => {
        setViewportSize({ width: window.innerWidth, height: window.innerHeight });
      };

      window.addEventListener('resize', updateViewport);
      return () => {
        window.removeEventListener('resize', updateViewport);
      };
    }, []);

    React.useEffect(() => {
      const onWindowWheel = (event: WheelEvent) => {
        const body = pagePanelBodyRef.current;
        if (!body || !showExpandedPanel) return;

        const rect = body.getBoundingClientRect();
        const withinX = event.clientX >= rect.left && event.clientX <= rect.right;
        const withinY = event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!withinX || !withinY) return;
        if (body.scrollHeight <= body.clientHeight) return;

        body.scrollTop += event.deltaY;
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();
      };

      window.addEventListener('wheel', onWindowWheel, {
        capture: true,
        passive: false,
      });
      return () => {
        window.removeEventListener('wheel', onWindowWheel, { capture: true });
      };
    }, [showExpandedPanel]);

    React.useEffect(() => {
      connectStyleObserver(currentTarget);
      return () => {
        disconnectStyleObserver();
      };
    }, [connectStyleObserver, currentTarget, disconnectStyleObserver]);

    React.useEffect(() => {
      requestPanelRefresh();
    }, [currentTarget, requestPanelRefresh]);

    React.useEffect(() => {
      return () => {
        options.onCommentShortcutDialogOpenChange?.(false);
      };
    }, [options]);

    const blockingLayerOpen =
      settingsPopoverOpen ||
      shortcutDialogOpen ||
      keyboardShortcutsDialogOpen ||
      directoryPickerOpen;

    React.useEffect(() => {
      onBlockingLayerOpenChange?.(blockingLayerOpen);
      return () => {
        onBlockingLayerOpenChange?.(false);
      };
    }, [blockingLayerOpen, onBlockingLayerOpenChange]);

    React.useEffect(() => {
      if (!directoryPickerOpen) return undefined;
      return lockPageScrollForRuntimeModal();
    }, [directoryPickerOpen]);

    const focusPanelTextInput = React.useCallback(() => {
      if (inlineTextEditingRef.current) return false;
      const input = textComposerRef.current?.querySelector('input');
      if (!(input instanceof HTMLInputElement) || input.disabled) return false;
      input.setAttribute(PARENT_SELECT_INPUT_TOUCHED_ATTR, 'false');
      input.focus({ preventScroll: true });
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch {
        // Best-effort cursor placement.
      }
      return true;
    }, []);

    const focusPanelNoteTextarea = React.useCallback(() => {
      if (inlineTextEditingRef.current) return false;
      const textarea = noteComposerRef.current?.querySelector('textarea');
      if (!(textarea instanceof HTMLTextAreaElement) || textarea.disabled) return false;
      textarea.setAttribute(PARENT_SELECT_INPUT_TOUCHED_ATTR, 'false');
      textarea.focus({ preventScroll: true });
      try {
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      } catch {
        // Best-effort cursor placement.
      }
      return true;
    }, []);

    React.useEffect(() => {
      if (inlineTextEditing || toolMinimized || !showExpandedPanel) return;

      const rafId = window.requestAnimationFrame(() => {
        focusPanelTextInput();
      });

      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }, [focusPanelTextInput, inlineTextEditing, showExpandedPanel, toolMinimized]);

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

    const saveAndCloseNoteComposer = React.useCallback(async () => {
      await onConfirmNote();
      const textarea = noteComposerRef.current?.querySelector('textarea');
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.blur();
      }
      onDismissSelection?.();
    }, [onConfirmNote, onDismissSelection]);

    React.useEffect(() => {
      if (toolMinimized) {
        onHoverSelectionSuppressedChange(false);
      }
    }, [onHoverSelectionSuppressedChange, toolMinimized]);

    React.useEffect(() => {
      if (toolMinimized) {
        onSelectionInteractionLockChange(false);
      }
    }, [onSelectionInteractionLockChange, toolMinimized]);

    React.useEffect(() => {
      if (!toolMinimized) return;
      setSessionActivityCardOpen(false);
      setSettingsPopoverOpen(false);
      setDirectoryPickerOpen(false);
    }, [toolMinimized]);

    React.useEffect(() => {
      return () => {
        onHoverSelectionSuppressedChange(false);
        onSelectionInteractionLockChange(false);
      };
    }, [onHoverSelectionSuppressedChange, onSelectionInteractionLockChange]);

    React.useEffect(() => {
      syncPanelMetaState();
    }, [syncPanelMetaState]);

    // Sync page animation disable state whenever the setting changes.
    React.useEffect(() => {
      setPageAnimationsDisabled(uiSettings.disablePageAnimations);
      return () => {
        // Always restore animations on unmount.
        setPageAnimationsDisabled(false);
      };
    }, [uiSettings.disablePageAnimations]);

    React.useEffect(() => {
      if (previousPageZoomEnabledRef.current !== uiSettings.pageZoomEnabled) {
        onDismissSelection?.();
        onTargetChange(null);
      }
      previousPageZoomEnabledRef.current = uiSettings.pageZoomEnabled;
    }, [onDismissSelection, onTargetChange, uiSettings.pageZoomEnabled]);

    React.useEffect(() => {
      if (previousPageZoomActiveRef.current !== pageZoomActive) {
        onDismissSelection?.();
        onTargetChange(null);
      }
      previousPageZoomActiveRef.current = pageZoomActive;
    }, [onDismissSelection, onTargetChange, pageZoomActive]);

    React.useEffect(() => {
      setPageZoomEnabled(pageZoomActive, {
        reservedRightWidth: PAGE_CONFIG_PANEL_WIDTH + PROPERTY_PANEL_RIGHT + 24,
      });
      return () => {
        setPageZoomEnabled(false);
      };
    }, [pageZoomActive]);

    React.useEffect(
      () => () => {
        if (!previousPageZoomActiveRef.current) return;
        onDismissSelectionRef.current?.();
        onTargetChangeRef.current(null);
      },
      [],
    );

    React.useEffect(() => {
      if (!toolMinimized) return;
      if (shortcutDialogOpen) {
        closeShortcutDialog();
      }
    }, [closeShortcutDialog, shortcutDialogOpen, toolMinimized]);

    React.useLayoutEffect(() => {
      if (toolMinimized) return;

      const updateAnchor = () => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        setCompactAnchorRect((prev) => {
          const next = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };

          if (
            prev &&
            prev.left === next.left &&
            prev.top === next.top &&
            prev.width === next.width &&
            prev.height === next.height
          ) {
            return prev;
          }
          return next;
        });
      };

      updateAnchor();
      window.addEventListener('resize', updateAnchor);
      return () => {
        window.removeEventListener('resize', updateAnchor);
      };
    }, [
      actionBusy,
      currentTarget,
      modifiedCount,
      pagePanelPosition,
      redoCount,
      shortcutDialogOpen,
      toolbarPosition,
      toolMinimized,
      uiMode,
      undoCount,
    ]);

    React.useEffect(() => {
      if (capturingShortcutIndex === null) return;
      const button = shortcutCardRefs.current[capturingShortcutIndex];
      if (!button) return;
      const rafId = window.requestAnimationFrame(() => {
        button.focus({ preventScroll: true });
      });
      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }, [capturingShortcutIndex]);

    const copyReason = options.getCopyPromptBlockReason?.();
    const copyBlocked = !options.onCopyPrompt || !!copyReason;
    const agentPromptToolbarAction = getAgentPromptToolbarActionState({
      toolMinimized,
      visualState: effectiveVisualState,
      waking: agentWakeChecking,
      sending: currentTaskIsSending,
      interrupting: agentPromptInterrupting,
      hasReusableConversation,
      pageTaskRunning,
      pageTaskSessionReady,
      currentTaskRunning,
      currentTaskSessionReady,
      canInterrupt: activeTaskCanInterrupt || pageTaskCanInterrupt,
      canWakeAgent: Boolean(options.onWakeAgent),
      onSendPromptToAgent: options.onSendPromptToAgent,
      getAgentBridgeConnected: options.getAgentBridgeConnected,
      getSendPromptToAgentBlockReason: () =>
        options.getSendPromptToAgentBlockReason?.(currentTarget),
    });
    const agentPromptCanInterrupt = activeTaskCanInterrupt;
    const agentShellAwake =
      agentPromptToolbarAction.robotState === 'awake' ||
      agentPromptToolbarAction.robotState === 'working';
    const acpUiConnected = options.getAcpUiConnected
      ? Boolean(options.getAcpUiConnected())
      : agentShellAwake;
    const currentTaskSessionHref =
      currentAgentTask?.sessionUrl ??
      (currentAgentTask?.sessionId ? `/session/${currentAgentTask.sessionId}` : '');
    const currentTaskDescription = resolveExternalEditingStatusDescription(
      currentAgentTask,
      options.externalEditingStatusDescription,
    );
    const handleOpenCurrentTaskSession = React.useCallback(() => {
      if (!currentTaskSessionHref) return;
      window.open(currentTaskSessionHref, '_blank', 'noopener,noreferrer');
    }, [currentTaskSessionHref]);
    const handleDismissCurrentTaskState = React.useCallback(() => {
      if (!currentTarget || !options.dismissElementAgentTaskState) return;
      options.dismissElementAgentTaskState(currentTarget);
    }, [currentTarget, options]);
    const agentTaskStatusCard = currentAgentTask ? (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 18,
          border:
            currentAgentTask.status === 'error'
              ? '1px solid rgba(239, 68, 68, 0.24)'
              : currentAgentTask.status === 'completed'
                ? '1px solid rgba(34, 197, 94, 0.24)'
                : '1px solid rgba(0, 143, 93, 0.22)',
          background:
            currentAgentTask.status === 'error'
              ? 'rgba(127, 29, 29, 0.14)'
              : currentAgentTask.status === 'completed'
                ? 'rgba(20, 83, 45, 0.14)'
                : 'rgba(0, 143, 93, 0.08)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {currentAgentTask.status === 'completed' ? (
            <CheckCircleFilled style={{ color: '#22c55e' }} />
          ) : currentAgentTask.status === 'error' ? (
            <ExclamationCircleFilled style={{ color: '#ef4444' }} />
          ) : (
            <AgentSparkleIcon />
          )}
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: EDITOR_CHROME.textPrimary,
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
        </div>
        <span
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: EDITOR_CHROME.textSecondary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {currentTaskDescription}
          {currentAgentTask.sessionId ? ` · Session ${currentAgentTask.sessionId}` : ''}
        </span>
        <Space size={8} wrap>
          {!hideExecutionControls && currentTaskRunning ? (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              disabled={!agentPromptCanInterrupt || agentPromptInterrupting}
              loading={agentPromptInterrupting}
              onClick={() => {
                void handleInterruptSendPromptToAgent();
              }}
            >
              中断
            </Button>
          ) : null}
          {!hideExecutionControls && currentAgentTask.status === 'error' ? (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              disabled={agentPromptToolbarAction.sendDisabled || actionBusy}
              onClick={() => {
                void handleConfirmSendPromptToAgent();
              }}
            >
              重试
            </Button>
          ) : null}
          {currentTaskSessionHref ? (
            <Button size="small" icon={<LinkOutlined />} onClick={handleOpenCurrentTaskSession}>
              打开会话
            </Button>
          ) : null}
          {currentTaskTerminal ? (
            <Button size="small" icon={<CloseToolIcon />} onClick={handleDismissCurrentTaskState}>
              关闭提示
            </Button>
          ) : null}
        </Space>
      </div>
    ) : null;

    const compactPosition = React.useMemo(
      () =>
        computeCompactPanelPosition({
          actionRect: compactAnchorRect,
          floatingPosition: toolbarPosition,
          viewport: viewportSize,
          panelWidth: PAGE_CONFIG_PANEL_WIDTH,
          panelTop: PROPERTY_PANEL_TOP,
          panelRight: PROPERTY_PANEL_RIGHT,
          panelBottom: TOOLBAR_BOTTOM,
          compactSize: COMPACT_TOOL_SIZE,
          compactWidth: toolMinimized ? COMPACT_TOOL_SIZE : COMPACT_TOOLBAR_WIDTH,
          compactHeight: toolMinimized ? COMPACT_TOOL_SIZE : COMPACT_TOOLBAR_HEIGHT,
          margin: FLOATING_CLAMP_MARGIN,
          headerPaddingX: HEADER_HORIZONTAL_PADDING,
          headerPaddingY: HEADER_VERTICAL_PADDING,
          controlSize: HEADER_CONTROL_SIZE,
        }),
      [compactAnchorRect, toolbarPosition, toolMinimized, viewportSize],
    );

    const clampedExpandedToolbarPosition = React.useMemo(
      () =>
        toolbarPosition
          ? clampToViewport(toolbarPosition, {
              width: COMPACT_TOOLBAR_WIDTH,
              height: COMPACT_TOOLBAR_HEIGHT,
            })
          : null,
      [clampToViewport, toolbarPosition],
    );

    // On mobile, when a bubble card is actively showing, hide the expanded toolbar
    // to prevent touch events from passing through to toolbar buttons behind the card.
    const mobileHideToolbar =
      isMobileDevice() && !toolMinimized && uiMode === 'bubble-card' && !!currentTarget;

    const shellStyle: React.CSSProperties = toolMinimized
      ? {
          ...(toolbarPosition
            ? {
                left: toolbarPosition.left,
                top: toolbarPosition.top,
                right: 'auto',
                bottom: 'auto',
              }
            : compactAnchorRect
              ? {
                  left: compactPosition.left,
                  top: compactPosition.top,
                  right: 'auto',
                  bottom: 'auto',
                }
              : {
                  right: PROPERTY_PANEL_RIGHT,
                  bottom: TOOLBAR_BOTTOM,
                  top: 'auto',
                }),
          position: 'absolute',
          zIndex: panelStyle.zIndex,
          width: COMPACT_TOOL_SIZE,
          height: COMPACT_TOOL_SIZE,
          maxWidth: COMPACT_TOOL_SIZE,
          borderRadius: 999,
          pointerEvents: 'auto',
          overflow: 'visible',
          border: 'none',
          background: 'transparent',
          boxShadow: 'none',
        }
      : !showExpandedPanel
        ? {
            ...panelStyle,
            width: 'fit-content',
            height: 'auto',
            maxWidth: 'calc(100vw - 32px)',
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            pointerEvents: mobileHideToolbar ? 'none' : 'auto',
            overflow: 'visible',
            opacity: mobileHideToolbar ? 0 : 1,
            ...(clampedExpandedToolbarPosition
              ? {
                  left: clampedExpandedToolbarPosition.left,
                  top: clampedExpandedToolbarPosition.top,
                  right: 'auto',
                  bottom: 'auto',
                }
              : {
                  right: PROPERTY_PANEL_RIGHT,
                  bottom: TOOLBAR_BOTTOM,
                  top: 'auto',
                }),
          }
        : {
            ...panelStyle,
            width: 'fit-content',
            height: 'auto',
            maxWidth: 'calc(100vw - 32px)',
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            pointerEvents: mobileHideToolbar ? 'none' : 'auto',
            overflow: 'visible',
            opacity: mobileHideToolbar ? 0 : 1,
            ...(clampedExpandedToolbarPosition
              ? {
                  left: clampedExpandedToolbarPosition.left,
                  top: clampedExpandedToolbarPosition.top,
                  right: 'auto',
                  bottom: 'auto',
                }
              : {
                  right: PROPERTY_PANEL_RIGHT,
                  bottom: TOOLBAR_BOTTOM,
                  top: 'auto',
                }),
          };

    const showCopyPromptAction = options.showCopyPromptAction !== false;
    const hasPrototypeClearableEdits = Boolean(options.hasPrototypeComments?.());
    const hasClearableEdits =
      modifiedCount + visibleTerminalTaskCount > 0 || hasPrototypeClearableEdits;
    const clearAllEditsDisabled = actionBusy || !hasClearableEdits || !options.onClearEdits;
    const copyPromptDisabled = clearAllEditsDisabled || copyBlocked;
    const copyToolbarButton = showCopyPromptAction ? (
      <AgentToolbarIconButton
        title={copyReason ?? '复制 Prompt'}
        icon={<CopyOutlined />}
        awake={agentShellAwake}
        disabled={copyPromptDisabled}
        onClick={() => {
          void runAction(options.onCopyPrompt);
        }}
      />
    ) : null;
    const copyPromptVisible = Boolean(copyToolbarButton);
    const inlineSendVisible = !hideExecutionControls && agentPromptToolbarAction.sendVisible;
    const inlineInterruptVisible =
      !hideExecutionControls && agentPromptToolbarAction.interruptVisible;
    const hostSendVisible = agentPromptToolbarAction.sendVisible;

    const sessionActivityCardContent = (
      <div
        style={{
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: EDITOR_CHROME.textPrimary,
            }}
          >
            最近动态
          </span>
          {!hideExecutionControls && currentTaskRunning ? (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              disabled={!agentPromptCanInterrupt || agentPromptInterrupting}
              loading={agentPromptInterrupting}
              onClick={() => {
                void handleInterruptSendPromptToAgent();
              }}
            >
              停止执行
            </Button>
          ) : null}
        </div>
        {visibleSessionActivities.length > 0 ? (
          <Timeline
            items={visibleSessionActivities.map((item) => ({
              key: item.id,
              children: (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    paddingBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: EDITOR_CHROME.textPrimary,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.text}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: EDITOR_CHROME.textMuted,
                    }}
                  >
                    {formatSessionActivityTime(item.timestamp)}
                  </span>
                </div>
              ),
            }))}
          />
        ) : (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: EDITOR_CHROME.textMuted,
            }}
          >
            最近暂无动态
          </div>
        )}
      </div>
    );

    // NOTE: Activity Popover temporarily hidden — will be restored after
    // session-activity subscription optimisation is complete.
    // The sessionActivityCardContent and subscription logic above are
    // intentionally kept for future re-enablement.
    const agentPrimaryMenuLabel = agentPromptToolbarAction.sendTitle.includes('追加')
      ? '追加'
      : '快速执行';
    const clearEditsTitle = hasPrototypeClearableEdits ? '清空批注' : '清空全部编辑';
    const clearAllEditsToolbarButton = clearAllEditsDisabled ? (
      <AgentToolbarIconButton
        title={clearEditsTitle}
        icon={<DeleteOutlined />}
        awake={agentShellAwake}
        disabled
      />
    ) : hasPrototypeClearableEdits ? (
      <Popconfirm
        title="清空当前原型批注"
        description={
          <>
            请选择清空范围：已完成批注，或全部批注。
            <br />
            已保存的代码修改不受影响。
          </>
        }
        arrow={{ pointAtCenter: true }}
        overlayStyle={{ maxWidth: 420 }}
        getPopupContainer={resolveRuntimePopupContainer}
        okText="清空已完成批注"
        cancelText="清空所有批注"
        onConfirm={() =>
          runAction(() =>
            options.onClearEdits?.({
              skipConfirm: true,
              scope: 'prototype',
              target: 'completed',
            }),
          )
        }
        onCancel={() => {
          void runAction(() =>
            options.onClearEdits?.({
              skipConfirm: true,
              scope: 'prototype',
              target: 'all',
            }),
          );
        }}
      >
        <span style={{ display: 'inline-flex' }}>
          <AgentToolbarIconButton
            title={clearEditsTitle}
            icon={<DeleteOutlined />}
            awake={agentShellAwake}
          />
        </span>
      </Popconfirm>
    ) : (
      <Popconfirm
        title="清空全部编辑"
        description="确认后会清空所有待修改内容，已保存的修改不受影响。"
        arrow={{ pointAtCenter: true }}
        getPopupContainer={resolveRuntimePopupContainer}
        okText="清空"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onConfirm={() => runAction(() => options.onClearEdits?.({ skipConfirm: true }))}
      >
        <span style={{ display: 'inline-flex' }}>
          <AgentToolbarIconButton
            title={clearEditsTitle}
            icon={<DeleteOutlined />}
            awake={agentShellAwake}
          />
        </span>
      </Popconfirm>
    );

    const htmlFileSaveToolbarButton =
      options.htmlFileSaveEnabled && options.onHostToolbarAction ? (
        <AgentToolbarIconButton
          title="保存文本和样式"
          ariaLabel="保存文本和样式"
          icon={<SaveOutlined />}
          awake={agentShellAwake}
          disabled={actionBusy}
          onClick={() => {
            void handleHtmlFileSaveAction();
          }}
        />
      ) : null;

    const agentExecutionToolbarButton = hideExecutionControls ? null : inlineInterruptVisible ? (
      <Popconfirm
        title="终止全部修改"
        description="确认后会终止当前页面所有正在进行的 AI 修改。"
        okText="终止"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        disabled={agentPromptToolbarAction.interruptDisabled}
        getPopupContainer={resolveRuntimePopupContainer}
        onConfirm={() => {
          void handleInterruptSendPromptToAgent(null);
        }}
      >
        <span style={{ display: 'inline-flex' }}>
          <AgentToolbarIconButton
            title={agentPromptToolbarAction.interruptTitle}
            ariaLabel="终止全部修改"
            icon={<PoweroffOutlined />}
            awake={agentShellAwake}
            active={!agentPromptToolbarAction.interruptDisabled}
            disabled={agentPromptToolbarAction.interruptDisabled}
            loading={agentPromptToolbarAction.interruptLoading}
          />
        </span>
      </Popconfirm>
    ) : (
      <AgentToolbarIconButton
        title={
          agentPromptToolbarAction.sendDisabled
            ? agentPromptToolbarAction.sendTitle
            : agentPrimaryMenuLabel
        }
        ariaLabel={agentPrimaryMenuLabel}
        icon={<CaretRightFilled />}
        awake={agentShellAwake}
        active={inlineSendVisible && !agentPromptToolbarAction.sendDisabled}
        disabled={!inlineSendVisible || agentPromptToolbarAction.sendDisabled || actionBusy}
        loading={agentPromptToolbarAction.sendLoading}
        onClick={() => {
          void handleConfirmSendPromptToAgent();
        }}
      />
    );

    const hostSurfaceVisibilityToolbarButton =
      hostSurfaceVisibilityControl && options.onHostToolbarAction ? (
        <AgentToolbarIconButton
          title={
            hostSurfaceVisible
              ? hostSurfaceVisibilityControl.hideTitle || '隐藏窗口'
              : hostSurfaceVisibilityControl.showTitle || '显示窗口'
          }
          ariaLabel={
            hostSurfaceVisible
              ? hostSurfaceVisibilityControl.hideTitle || '隐藏窗口'
              : hostSurfaceVisibilityControl.showTitle || '显示窗口'
          }
          icon={hostSurfaceVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          awake={agentShellAwake}
          active={hostSurfaceVisible}
          disabled={actionBusy}
          onClick={() => {
            void handleToggleHostSurfaceVisibility();
          }}
        />
      ) : null;

    const handleCopySkillInstallPrompt = React.useCallback(async () => {
      const text = buildSkillInstallPrompt(options.skillInstallSource);
      try {
        await copyRuntimeTextToClipboard(text);
        setSkillInstallPromptCopied(true);
        if (skillInstallFeedbackTimerRef.current !== null) {
          window.clearTimeout(skillInstallFeedbackTimerRef.current);
        }
        skillInstallFeedbackTimerRef.current = window.setTimeout(() => {
          setSkillInstallPromptCopied(false);
          skillInstallFeedbackTimerRef.current = null;
        }, 1800);
        notifyRuntimeMessage('success', '安装提示词已复制，请发送给 AI');
      } catch {
        setSkillInstallPromptCopied(false);
        notifyRuntimeMessage('error', '复制失败');
      }
    }, [options.skillInstallSource]);

    const handleCopyGlobalPanelPrompt = React.useCallback(async () => {
      const pageUrl =
        typeof window !== 'undefined' && typeof window.location?.href === 'string'
          ? window.location.href
          : '';
      const text = buildGlobalPanelPrompt(options.skillInstallSource, pageUrl);
      try {
        await copyRuntimeTextToClipboard(text);
        if (text) {
          notifyRuntimeMessage('success', '已复制提示，请发给对应 agent 处理');
          return;
        }
        notifyRuntimeMessage('info', '提示词暂未配置，已复制空模板');
      } catch {
        notifyRuntimeMessage('error', '复制失败');
      }
    }, []);

    const handleRefreshAiExecutionWorkspace = React.useCallback(async () => {
      if (!options.onHostToolbarAction) return;
      try {
        const result = await options.onHostToolbarAction({
          type: 'get-ai-execution-config',
        });
        const resultRecord =
          result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
        if (resultRecord && Object.prototype.hasOwnProperty.call(resultRecord, 'workspacePath')) {
          setAiExecutionWorkspacePath(
            normalizeAiExecutionWorkspacePath(resultRecord.workspacePath),
          );
        }
      } catch (error) {
        notifyRuntimeMessage('warning', error instanceof Error ? error.message : String(error));
      }
    }, [options]);
    const browseAiExecutionDirectories = React.useCallback(
      async (path?: string) => {
        if (!options.onHostToolbarAction) return;
        setDirectoryPickerBusy(true);
        setDirectoryPickerError('');
        try {
          const result = await options.onHostToolbarAction({
            type: 'browse-ai-execution-directories',
            ...(path ? { path } : {}),
          });
          const nextState = readLocalDirectoryBrowserResult(result);
          if (!nextState) {
            throw new Error('ACP 未返回可用目录列表');
          }
          setDirectoryPickerState(nextState);
          setDirectoryPickerPathInput(nextState.path);
          return nextState;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setDirectoryPickerError(message);
          notifyRuntimeMessage('error', message);
          return null;
        } finally {
          setDirectoryPickerBusy(false);
        }
      },
      [options],
    );
    const loadAiExecutionRecentWorkspaces = React.useCallback(async () => {
      if (!options.onHostToolbarAction) return;
      setDirectoryPickerRecentError('');
      try {
        const result = await options.onHostToolbarAction({
          type: 'list-ai-execution-recent-workspaces',
        });
        setDirectoryPickerRecentWorkspaces(normalizeAiExecutionRecentWorkspaces(result));
      } catch (error) {
        setDirectoryPickerRecentError(error instanceof Error ? error.message : String(error));
      }
    }, [options]);
    const handleOpenDirectoryPicker = React.useCallback(async () => {
      setDirectoryPickerOpen(true);
      setSettingsPopoverOpen(false);
      setDirectoryPickerRecentOpen(false);
      setDirectoryPickerRecentQuery('');
      setDirectoryPickerRecentActiveIndex(0);
      const initialPath = normalizeAiExecutionWorkspacePath(aiExecutionWorkspacePath);
      setDirectoryPickerPathInput(initialPath);
      void loadAiExecutionRecentWorkspaces();
      const opened = await browseAiExecutionDirectories(initialPath || undefined);
      if (!opened && initialPath) {
        await browseAiExecutionDirectories(undefined);
      }
    }, [aiExecutionWorkspacePath, browseAiExecutionDirectories, loadAiExecutionRecentWorkspaces]);
    const filteredDirectoryPickerRecentWorkspaces = React.useMemo(
      () =>
        filterAiExecutionRecentWorkspaces(
          directoryPickerRecentWorkspaces,
          directoryPickerRecentQuery,
        ),
      [directoryPickerRecentQuery, directoryPickerRecentWorkspaces],
    );
    const directoryPickerBreadcrumbs = React.useMemo(
      () => buildAiWorkspaceBreadcrumbs(directoryPickerState?.path || ''),
      [directoryPickerState?.path],
    );
    React.useEffect(() => {
      if (!directoryPickerState?.path) return;
      const navigation = directoryPickerBreadcrumbRef.current;
      if (navigation) navigation.scrollLeft = navigation.scrollWidth;
    }, [directoryPickerState?.path]);
    React.useEffect(() => {
      if (!directoryPickerRecentOpen) return;
      directoryPickerPathFieldRef.current
        ?.querySelector(`#we-runtime-directory-picker-recent-${directoryPickerRecentActiveIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [
      directoryPickerRecentActiveIndex,
      directoryPickerRecentOpen,
      filteredDirectoryPickerRecentWorkspaces.length,
    ]);
    const handleDirectoryPickerPathSubmit = React.useCallback(() => {
      const path = normalizeAiExecutionWorkspacePath(directoryPickerPathInput);
      if (path && !directoryPickerBusy) {
        setDirectoryPickerRecentOpen(false);
        void browseAiExecutionDirectories(path);
      }
    }, [browseAiExecutionDirectories, directoryPickerBusy, directoryPickerPathInput]);
    const handleDirectoryPickerPathClick = React.useCallback(() => {
      if (directoryPickerBusy) return;
      if (!directoryPickerRecentOpen) {
        setDirectoryPickerRecentQuery('');
        setDirectoryPickerRecentActiveIndex(0);
      }
      if (directoryPickerRecentWorkspaces.length > 0) {
        setDirectoryPickerRecentOpen(true);
      }
    }, [directoryPickerBusy, directoryPickerRecentOpen, directoryPickerRecentWorkspaces.length]);
    const handleDirectoryPickerPathBlur = React.useCallback(() => {
      window.requestAnimationFrame(() => {
        if (!directoryPickerPathFieldRef.current?.contains(document.activeElement)) {
          setDirectoryPickerRecentOpen(false);
        }
      });
    }, []);
    const handleDirectoryPickerRecentBrowse = React.useCallback(
      (workspacePath: string) => {
        if (directoryPickerBusy) return;
        setDirectoryPickerPathInput(workspacePath);
        setDirectoryPickerRecentOpen(false);
        setDirectoryPickerRecentQuery('');
        void browseAiExecutionDirectories(workspacePath);
      },
      [browseAiExecutionDirectories, directoryPickerBusy],
    );
    const handleDirectoryPickerRecentRemove = React.useCallback(
      (workspacePath: string) => {
        const next = removeAiExecutionRecentWorkspace(
          directoryPickerRecentWorkspaces,
          workspacePath,
        );
        setDirectoryPickerRecentWorkspaces(next);
        setDirectoryPickerRecentActiveIndex((index) =>
          Math.max(0, Math.min(index, next.length - 1)),
        );
        const request = options.onHostToolbarAction?.({
          type: 'remove-ai-execution-recent-workspace',
          path: workspacePath,
        });
        if (!request) return;
        void Promise.resolve(request)
          .then((result) => {
            setDirectoryPickerRecentWorkspaces(normalizeAiExecutionRecentWorkspaces(result));
          })
          .catch(() => undefined);
      },
      [directoryPickerRecentWorkspaces, options],
    );
    const handleDirectoryPickerPathKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' && directoryPickerRecentOpen) {
          event.preventDefault();
          event.stopPropagation();
          setDirectoryPickerRecentOpen(false);
          return;
        }
        if (event.key === 'ArrowDown') {
          if (directoryPickerBusy || filteredDirectoryPickerRecentWorkspaces.length === 0) {
            return;
          }
          event.preventDefault();
          setDirectoryPickerRecentOpen(true);
          setDirectoryPickerRecentActiveIndex((index) =>
            directoryPickerRecentOpen
              ? (index + 1) % filteredDirectoryPickerRecentWorkspaces.length
              : Math.min(index, filteredDirectoryPickerRecentWorkspaces.length - 1),
          );
          return;
        }
        if (event.key === 'ArrowUp' && directoryPickerRecentOpen) {
          if (filteredDirectoryPickerRecentWorkspaces.length === 0) return;
          event.preventDefault();
          setDirectoryPickerRecentActiveIndex(
            (index) =>
              (index - 1 + filteredDirectoryPickerRecentWorkspaces.length) %
              filteredDirectoryPickerRecentWorkspaces.length,
          );
          return;
        }
        if (event.key === 'Enter' && directoryPickerRecentOpen) {
          const workspace =
            filteredDirectoryPickerRecentWorkspaces[directoryPickerRecentActiveIndex];
          if (!workspace) return;
          event.preventDefault();
          handleDirectoryPickerRecentBrowse(workspace.path);
        }
      },
      [
        directoryPickerBusy,
        directoryPickerRecentActiveIndex,
        directoryPickerRecentOpen,
        filteredDirectoryPickerRecentWorkspaces,
        handleDirectoryPickerRecentBrowse,
      ],
    );
    const handleConfirmDirectoryPicker = React.useCallback(async () => {
      const selectedPath = normalizeAiExecutionWorkspacePath(directoryPickerState?.path);
      if (!selectedPath) return;
      setDirectoryPickerBusy(true);
      try {
        setAiExecutionWorkspacePath(selectedPath);
        const result = await options.onHostToolbarAction?.({
          type: 'set-ai-execution-config',
          workspacePath: selectedPath,
        });
        const resultRecord =
          result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
        if (resultRecord && Object.prototype.hasOwnProperty.call(resultRecord, 'workspacePath')) {
          setAiExecutionWorkspacePath(
            normalizeAiExecutionWorkspacePath(resultRecord.workspacePath),
          );
        }
        const optimisticRecentWorkspaces = recordAiExecutionRecentWorkspace(
          directoryPickerRecentWorkspaces,
          selectedPath,
        );
        setDirectoryPickerRecentWorkspaces(optimisticRecentWorkspaces);
        const recentWorkspaceRequest = options.onHostToolbarAction?.({
          type: 'record-ai-execution-recent-workspace',
          path: selectedPath,
        });
        if (recentWorkspaceRequest) {
          void Promise.resolve(recentWorkspaceRequest)
            .then((result) => {
              setDirectoryPickerRecentWorkspaces(normalizeAiExecutionRecentWorkspaces(result));
            })
            .catch(() => undefined);
        }
        setDirectoryPickerOpen(false);
        notifyRuntimeMessage('success', '已选择 AI 工作目录');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDirectoryPickerError(message);
        notifyRuntimeMessage('error', message);
      } finally {
        setDirectoryPickerBusy(false);
      }
    }, [directoryPickerRecentWorkspaces, directoryPickerState?.path, options]);
    const aiExecutionWorkspaceDisplayName = getPathDisplayName(aiExecutionWorkspacePath);
    const toggleSelectionMode = React.useCallback(() => {
      const nextSelectionModeActive = !selectionModeActive;
      if (!nextSelectionModeActive) {
        onDismissSelection?.();
        onTargetChange(null);
        onSelectionInteractionLockChange(false);
        onHoverSelectionSuppressedChange(false);
      }
      if (nextSelectionModeActive) {
        onSelectionInteractionLockChange(false);
        onHoverSelectionSuppressedChange(false);
      }
      onSelectionModeActiveChange(nextSelectionModeActive);
    }, [
      onDismissSelection,
      onHoverSelectionSuppressedChange,
      onSelectionInteractionLockChange,
      onSelectionModeActiveChange,
      onTargetChange,
      selectionModeActive,
    ]);
    type SettingsItem = {
      key: string;
      label?: React.ReactNode;
      action?: () => void | Promise<void>;
      control: React.ReactNode;
      fullWidth?: boolean;
      compactControl?: boolean;
    };
    const commentarySkillInstallSettingsItem: SettingsItem = {
      key: 'commentary-skill-install',
      compactControl: true,
      label: (
        <span className="we-runtime-settings-card__skill-label">
          <span>批注技能</span>
          <span className="we-runtime-settings-card__recommended-badge">推荐</span>
        </span>
      ),
      control: (
        <Tooltip
          title={skillInstallPromptCopied ? '安装提示词已复制' : '复制安装提示词'}
          placement="bottomRight"
          getPopupContainer={resolveRuntimePopupContainer}
        >
          <button
            type="button"
            className="we-runtime-settings-card__install-button"
            aria-label="复制批注技能安装提示词"
            onClick={(event) => {
              event.stopPropagation();
              void handleCopySkillInstallPrompt();
            }}
          >
            {skillInstallPromptCopied ? '已复制' : '安装'}
          </button>
        </Tooltip>
      ),
    };
    const aiWorkspaceSettingsItem: SettingsItem | null = !options.onHostToolbarAction
      ? null
      : {
          key: 'ai-workspace',
          label: 'AI 工作目录',
          action: handleOpenDirectoryPicker,
          control: (
            <span
              className="we-runtime-settings-card__value we-runtime-settings-card__workspace-value"
              title={aiExecutionWorkspacePath || undefined}
            >
              <span className="we-runtime-settings-card__workspace-value-text">
                {aiExecutionWorkspaceDisplayName || '未配置'}
              </span>
              <RightOutlined style={{ fontSize: 10 }} />
            </span>
          ),
        };
    const propertyPanelSettingsItem: SettingsItem | null = showPropertyPanelSettingsItem
      ? {
          key: 'property-panel',
          label: '设计决策',
          control: (
            <Switch
              checked={propertyPanelOpen}
              onChange={(checked) => {
                handleTogglePropertyPanel(checked);
              }}
            />
          ),
        }
      : null;
    const settingsItems: SettingsItem[] = [
      commentarySkillInstallSettingsItem,
      ...(aiWorkspaceSettingsItem ? [aiWorkspaceSettingsItem] : []),
      ...(propertyPanelSettingsItem ? [propertyPanelSettingsItem] : []),
      ...(interactionProfile === 'text-comment'
        ? []
        : [
            {
              key: 'capture-target-screenshot',
              label: '附带目标截图',
              control: (
                <Switch
                  checked={uiSettings.captureTargetScreenshot}
                  onChange={(checked) => {
                    onUiSettingsChange({
                      ...uiSettings,
                      captureTargetScreenshot: checked,
                    });
                  }}
                />
              ),
            },
          ]),
      ...(pageEditingSettingsAvailable
        ? [
            {
              key: 'disable-page-animations',
              label: '关闭页面动画',
              control: (
                <Switch
                  checked={uiSettings.disablePageAnimations}
                  onChange={(checked) => {
                    onUiSettingsChange({
                      ...uiSettings,
                      disablePageAnimations: checked,
                    });
                  }}
                />
              ),
            },
            ...(options.documentCommentModeAvailable === false
              ? []
              : [
                  {
                    key: 'document-comment-mode',
                    label: '文档批注模式',
                    control: (
                      <Switch
                        checked={uiSettings.documentCommentMode}
                        onChange={(checked) => {
                          onUiSettingsChange({
                            ...uiSettings,
                            documentCommentMode: checked,
                          });
                        }}
                      />
                    ),
                  },
                ]),
          ]
        : []),
      {
        key: 'keyboard-shortcuts',
        label: '快捷键',
        action: () => {
          setKeyboardShortcutsDialogOpen(true);
          setSettingsPopoverOpen(false);
        },
        control: (
          <span
            style={{
              color: EDITOR_CHROME.textSecondary,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>查看</span>
            <RightOutlined style={{ fontSize: 10 }} />
          </span>
        ),
      },
    ];

    const settingsCardContent = (
      <div
        className="we-runtime-settings-card"
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <div className="we-runtime-settings-card__header">
          <span className="we-runtime-settings-card__title">Axhub 批注</span>
          <Tooltip
            title={uiSettings.darkMode ? '关闭深色模式' : '开启深色模式'}
            placement="bottomRight"
            getPopupContainer={resolveRuntimePopupContainer}
          >
            <Button
              type="text"
              size="small"
              className="we-runtime-settings-dark-mode-button"
              aria-label={uiSettings.darkMode ? '关闭深色模式' : '开启深色模式'}
              icon={<MoonOutlined style={{ fontSize: 18 }} />}
              onClick={(event) => {
                event.stopPropagation();
                onUiSettingsChange({
                  ...uiSettings,
                  darkMode: !uiSettings.darkMode,
                });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 32,
                width: 32,
                padding: 0,
                color: uiSettings.darkMode ? EDITOR_CHROME.accent : EDITOR_CHROME.textSecondary,
              }}
            />
          </Tooltip>
        </div>

        <div className="we-runtime-settings-card__list">
          {settingsItems.map((item) => (
            <div
              key={item.key}
              className={[
                'we-runtime-settings-card__row',
                item.fullWidth ? 'we-runtime-settings-card__row--full' : '',
                item.compactControl ? 'we-runtime-settings-card__row--compact-control' : '',
                'action' in item && item.action ? 'we-runtime-settings-card__row--action' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if ('action' in item && item.action) {
                  void item.action();
                }
              }}
            >
              {item.fullWidth ? (
                <div className="we-runtime-settings-card__full-control">{item.control}</div>
              ) : (
                <>
                  <span className="we-runtime-settings-card__label">{item.label}</span>
                  <div className="we-runtime-settings-card__row-control">{item.control}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );

    const settingsToolbarButton = (
      <Popover
        trigger="click"
        placement="bottomRight"
        arrow={{ pointAtCenter: true }}
        open={settingsPopoverOpen}
        onOpenChange={(nextOpen) => {
          if (actionBusy && nextOpen) return;
          setSettingsPopoverOpen(nextOpen);
          if (nextOpen) {
            void handleRefreshAiExecutionWorkspace();
          }
        }}
        content={settingsCardContent}
        getPopupContainer={resolveRuntimePopupContainer}
      >
        <span style={{ display: 'inline-flex' }}>
          <AgentToolbarIconButton
            title="设置"
            icon={<SettingOutlined />}
            awake={agentShellAwake}
            disabled={actionBusy}
          />
        </span>
      </Popover>
    );
    const selectionModeToolbarTitle = `${
      selectionModeActive ? '关闭选择元素' : '开启选择元素'
    }（${SELECTION_MODE_TOGGLE_SHORTCUT_LABEL}）`;
    const selectionModeToolbarButton = selectionModeAvailable ? (
      <AgentToolbarIconButton
        title={selectionModeToolbarTitle}
        icon={<SelectOutlined />}
        ariaLabel={selectionModeActive ? '关闭选择元素' : '开启选择元素'}
        awake={agentShellAwake}
        active={selectionModeActive}
        disabled={actionBusy}
        onClick={toggleSelectionMode}
      />
    ) : null;
    const markdownSourceEditorToolbarButton = options.markdownSourceEditorAvailable ? (
      <AgentToolbarIconButton
        title={markdownSourceEditorOpen ? '隐藏 Markdown 原文' : '显示 Markdown 原文'}
        icon={<FileTextOutlined />}
        ariaLabel={markdownSourceEditorOpen ? '隐藏 Markdown 原文' : '显示 Markdown 原文'}
        awake={agentShellAwake}
        active={markdownSourceEditorOpen}
        disabled={actionBusy || !options.onMarkdownSourceEditorOpenChange}
        onClick={() => {
          if (actionBusy || !options.onMarkdownSourceEditorOpenChange) return;
          const requestedOpen = !markdownSourceEditorOpen;
          void (async () => {
            try {
              const result = await runAction(() =>
                options.onMarkdownSourceEditorOpenChange?.(requestedOpen),
              );
              const actualOpen =
                typeof result === 'boolean'
                  ? result
                  : options.getMarkdownSourceEditorOpen?.() === true;
              setMarkdownSourceEditorOpen(actualOpen);
              if (!requestedOpen && actualOpen) {
                notifyRuntimeMessage('warning', 'Markdown 尚未保存，已保留原文编辑区');
              }
            } catch (error) {
              setMarkdownSourceEditorOpen(options.getMarkdownSourceEditorOpen?.() === true);
              notifyRuntimeMessage(
                'error',
                error instanceof Error ? error.message : 'Markdown 编辑视图切换失败',
              );
            }
          })();
        }}
      />
    ) : null;
    const closeToolbarButton = (
      <AgentToolbarIconButton
        title={options.onRequestFullExit ? '退出批注' : '关闭工具栏'}
        icon={<CloseToolIcon />}
        ariaLabel={options.onRequestFullExit ? '退出批注' : '关闭工具栏'}
        awake={agentShellAwake}
        disabled={actionBusy}
        onClick={() => {
          if (options.onRequestFullExit) {
            void options.onRequestFullExit();
            return;
          }
          minimizeTool();
        }}
      />
    );
    const propertyPanelEmptyState = (
      <div
        className="we-runtime-prop-panel__empty-state"
        style={{
          padding: '14px 0 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <Typography.Text
          style={{
            color: EDITOR_CHROME.textMuted,
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          暂时没有需要处理的设计决策。可以先生成多个设计方案，再进行对比和决策。
        </Typography.Text>
        {showCopyPromptAction ? (
          <Button
            type="default"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => {
              void handleCopyGlobalPanelPrompt();
            }}
            style={{ alignSelf: 'flex-start' }}
          >
            复制提示词
          </Button>
        ) : null}
      </div>
    );

    const propertyPanelToggleButton = showPropertyPanelToolbarButton ? (
      <AgentToolbarIconButton
        title={propertyPanelOpen ? '关闭设计决策' : '打开设计决策'}
        icon={<SlidersOutlined />}
        ariaLabel="设计决策"
        awake={agentShellAwake}
        active={propertyPanelOpen}
        disabled={actionBusy}
        onClick={() => handleTogglePropertyPanel()}
      />
    ) : null;

    const handleTogglePageZoom = React.useCallback(() => {
      onDismissSelection?.();
      onTargetChange(null);
      const nextPageZoomEnabled = !uiSettings.pageZoomEnabled;
      if (nextPageZoomEnabled) {
        dockPagePanelRight();
      }
      onUiSettingsChange({ ...uiSettings, pageZoomEnabled: nextPageZoomEnabled });
    }, [dockPagePanelRight, onDismissSelection, onTargetChange, onUiSettingsChange, uiSettings]);

    const annotationSaveStatus = options.getAnnotationSaveStatus?.() ?? 'saved';

    const hostToolbarState = React.useMemo<CommentaryHostToolbarState>(() => {
      const agentOptions = [
        { value: null, label: '默认' },
        ...AGENT_MENU_OPTIONS.map((item) => {
          const availability = agentProviderAvailabilityMap.get(item.value) ?? null;
          return {
            value: item.value,
            label: item.label,
            disabled: availability?.installed === false,
          };
        }),
      ];
      const annotationEnabled = options.getAnnotationEnabled?.() ?? false;
      const annotationEnableAvailable = options.getAnnotationEnableAvailable?.() ?? false;
      const annotationEnableLoading = options.getAnnotationEnableLoading?.() ?? false;

      return {
        toolbarMode,
        visible: isHostToolbarMode,
        robotState: agentPromptToolbarAction.robotState,
        robotTitle: agentPromptToolbarAction.robotTitle,
        robotDisabled: agentPromptToolbarAction.robotDisabled,
        robotLoading: agentPromptToolbarAction.robotLoading,
        sendVisible: hostSendVisible,
        sendTitle: agentPromptToolbarAction.sendTitle,
        sendDisabled: agentPromptToolbarAction.sendDisabled || actionBusy,
        sendLoading: agentPromptToolbarAction.sendLoading,
        interruptVisible: !hideExecutionControls && agentPromptToolbarAction.interruptVisible,
        interruptTitle: agentPromptToolbarAction.interruptTitle,
        interruptDisabled: agentPromptToolbarAction.interruptDisabled,
        interruptLoading: agentPromptToolbarAction.interruptLoading,
        copyPromptVisible: copyPromptVisible,
        copyPromptTitle: copyReason ?? '复制 Prompt',
        copyPromptDisabled,
        clearEditsTitle,
        clearEditsDisabled: clearAllEditsDisabled,
        propertyPanelVisible: showPropertyPanelToolbarButton,
        propertyPanelOpen,
        propertyPanelTitle: propertyPanelOpen ? '关闭设计决策' : '打开设计决策',
        modifiedCount,
        terminalTaskCount: visibleTerminalTaskCount,
        annotationSaveStatus,
        selectedAgent: hideExecutionControls ? null : uiSettings.agentProvider,
        agentOptions: hideExecutionControls ? [] : agentOptions,
        aiExecutionConfigSummary: options.aiExecutionConfigSummary ?? '',
        aiExecutionConfigConfigured:
          Boolean(aiExecutionWorkspacePath) || options.aiExecutionConfigConfigured === true,
        aiExecutionProvider: options.aiExecutionProvider?.trim() || 'codex',
        aiExecutionWorkspacePath,
        aiExecutionRunConcurrency: options.aiExecutionRunConcurrency ?? 5,
        aiExecutionProviderOptions: options.aiExecutionProviderOptions ?? [],
        darkMode: uiSettings.darkMode,
        disablePageAnimations: uiSettings.disablePageAnimations,
        captureTargetScreenshotAvailable: interactionProfile !== 'text-comment',
        captureTargetScreenshot: uiSettings.captureTargetScreenshot,
        pageZoomEnabled: uiSettings.pageZoomEnabled,
        copySkillInstallPromptDisabled: actionBusy,
        selectionModeActive: selectionModeAvailable && selectionModeActive,
        fullExitAvailable: Boolean(options.onRequestFullExit),
        annotationEnabled,
        annotationEnableAvailable,
        annotationEnableLoading,
        annotationEnableDisabled: Boolean(
          annotationEnabled ||
            annotationEnableLoading ||
            !annotationEnableAvailable ||
            !options.onEnableAnnotation,
        ),
        annotationEnableTitle: annotationEnabled ? '需求标注已开启' : '开启需求标注',
      };
    }, [
      actionBusy,
      annotationSaveStatus,
      annotationToolbarTick,
      clearAllEditsDisabled,
      clearEditsTitle,
      copyBlocked,
      copyPromptDisabled,
      copyPromptVisible,
      copyReason,
      agentPromptToolbarAction,
      agentProviderAvailabilityMap,
      hideExecutionControls,
      hostSendVisible,
      isHostToolbarMode,
      aiExecutionWorkspacePath,
      modifiedCount,
      options.getAnnotationEnabled,
      options.getAnnotationEnableAvailable,
      options.getAnnotationEnableLoading,
      options.onEnableAnnotation,
      options.onRequestFullExit,
      options.aiExecutionConfigConfigured,
      options.aiExecutionConfigSummary,
      options.aiExecutionProvider,
      options.aiExecutionProviderOptions,
      options.aiExecutionRunConcurrency,
      propertyPanelOpen,
      showPropertyPanelToolbarButton,
      selectionModeActive,
      toolbarMode,
      uiSettings.disablePageAnimations,
      uiSettings.captureTargetScreenshot,
      uiSettings.darkMode,
      uiSettings.agentProvider,
      uiSettings.pageZoomEnabled,
      visibleTerminalTaskCount,
    ]);

    const onHostToolbarStateChange = props.onHostToolbarStateChange;
    const optionHostToolbarStateChange = options.onHostToolbarStateChange;
    React.useEffect(() => {
      onHostToolbarStateChange?.(hostToolbarState);
      optionHostToolbarStateChange?.(hostToolbarState);
      for (const listener of hostToolbarListenersRef.current) {
        try {
          listener(hostToolbarState);
        } catch {
          // Host listeners are best-effort; one failed consumer must not break the editor UI.
        }
      }
    }, [hostToolbarState, onHostToolbarStateChange, optionHostToolbarStateChange]);

    const runHostToolbarAction = React.useCallback(
      async (action: CommentaryHostToolbarAction): Promise<boolean> => {
        switch (action.type) {
          case 'wake-agent':
            if (agentPromptToolbarAction.robotDisabled) return false;
            return wakeAgentForAction();
          case 'send-to-agent':
            if (!hostSendVisible || agentPromptToolbarAction.sendDisabled || actionBusy) {
              return false;
            }
            await handleConfirmSendPromptToAgent();
            return true;
          case 'interrupt-agent':
            if (
              !agentPromptToolbarAction.interruptVisible ||
              agentPromptToolbarAction.interruptDisabled
            ) {
              return false;
            }
            await handleInterruptSendPromptToAgent(null);
            return true;
          case 'copy-prompt':
            if (!copyPromptVisible || copyPromptDisabled) return false;
            await runAction(options.onCopyPrompt);
            return true;
          case 'clear-edits':
            if (clearAllEditsDisabled || !options.onClearEdits) return false;
            const clearedTarget = await runAction(() =>
              options.onClearEdits?.({
                ...(action.skipConfirm ? { skipConfirm: true } : {}),
                ...(action.scope ? { scope: action.scope } : {}),
                ...(action.target ? { target: action.target } : {}),
              }),
            );
            return Boolean(clearedTarget);
          case 'toggle-property-panel': {
            const nextOpen = action.open ?? !propertyPanelOpen;
            handleTogglePropertyPanel(nextOpen);
            return true;
          }
          case 'set-active-agent': {
            const nextAgent = action.agent;
            if (nextAgent && !AGENT_MENU_OPTIONS.some((item) => item.value === nextAgent)) {
              return false;
            }
            onUiSettingsChange({ ...uiSettings, agentProvider: nextAgent });
            return true;
          }
          case 'get-acp-ui-status':
            return Boolean(await options.onHostToolbarAction?.(action));
          case 'save-html-all':
          case 'save-html-text':
          case 'save-html-style':
          case 'clear-html-style':
            if (!options.htmlFileSaveEnabled) return false;
            return Boolean(await options.onHostToolbarAction?.(action));
          case 'get-ai-execution-config':
          case 'set-ai-execution-config':
          case 'browse-ai-execution-directories':
          case 'list-ai-execution-recent-workspaces':
          case 'record-ai-execution-recent-workspace':
          case 'remove-ai-execution-recent-workspace':
            return Boolean(await options.onHostToolbarAction?.(action));
          case 'disconnect-agent':
            setAgentWakeChecking(false);
            setAgentPromptInterrupting(false);
            setAgentPromptSending(false);
            setAgentPromptSendingElementKey(null);
            onAgentVisualStateChange('sleeping');
            return true;
          case 'copy-skill-install-prompt':
            await handleCopySkillInstallPrompt();
            return true;
          case 'copy-global-panel-prompt':
            await handleCopyGlobalPanelPrompt();
            return true;
          case 'toggle-dark-mode':
            onUiSettingsChange({
              ...uiSettings,
              darkMode:
                typeof action.darkMode === 'boolean' ? action.darkMode : !uiSettings.darkMode,
            });
            return true;
          case 'toggle-page-animations':
            onUiSettingsChange({
              ...uiSettings,
              disablePageAnimations: !uiSettings.disablePageAnimations,
            });
            return true;
          case 'toggle-target-screenshot':
            if (interactionProfile === 'text-comment') return false;
            onUiSettingsChange({
              ...uiSettings,
              captureTargetScreenshot: action.enabled ?? !uiSettings.captureTargetScreenshot,
            });
            return true;
          case 'toggle-page-zoom':
            handleTogglePageZoom();
            return true;
          case 'toggle-selection-mode': {
            if (!selectionModeAvailable) return false;
            const nextSelectionModeActive = action.active ?? !selectionModeActive;
            if (!nextSelectionModeActive) {
              onDismissSelection?.();
              onTargetChange(null);
              onSelectionInteractionLockChange(false);
              onHoverSelectionSuppressedChange(false);
            }
            if (nextSelectionModeActive) {
              onSelectionInteractionLockChange(false);
              onHoverSelectionSuppressedChange(false);
            }
            onSelectionModeActiveChange(nextSelectionModeActive);
            return true;
          }
          case 'enable-annotation':
            if (options.getAnnotationEnabled?.()) return true;
            if (options.getAnnotationEnableLoading?.()) return false;
            if (!(options.getAnnotationEnableAvailable?.() ?? false)) return false;
            if (!(await options.onEnableAnnotation?.())) return false;
            setAnnotationToolbarTick((value) => value + 1);
            return true;
          case 'open-keyboard-shortcuts':
            setKeyboardShortcutsDialogOpen(true);
            return true;
          case 'full-exit':
            if (!options.onRequestFullExit) return false;
            await options.onRequestFullExit();
            return true;
          default:
            return false;
        }
      },
      [
        actionBusy,
        clearAllEditsDisabled,
        copyBlocked,
        copyPromptDisabled,
        copyPromptVisible,
        agentPromptToolbarAction,
        handleConfirmSendPromptToAgent,
        handleCopyGlobalPanelPrompt,
        handleCopySkillInstallPrompt,
        handleTogglePropertyPanel,
        handleInterruptSendPromptToAgent,
        handleTogglePageZoom,
        hostSendVisible,
        interactionProfile,
        onDismissSelection,
        onAgentVisualStateChange,
        onHoverSelectionSuppressedChange,
        onSelectionInteractionLockChange,
        onTargetChange,
        onToolMinimizedChange,
        onSelectionModeActiveChange,
        onUiSettingsChange,
        options,
        propertyPanelOpen,
        runAction,
        selectionModeAvailable,
        selectionModeActive,
        uiSettings,
        wakeAgentForAction,
      ],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        setTarget(element: Element | null) {
          onTargetChange(element);
        },
        setTab() {
          // Legacy no-op: the global property panel no longer exposes visible tabs.
        },
        getTab() {
          return 'tweak';
        },
        refresh() {
          onRefreshNoteState();
          requestPanelRefresh();
          setAnnotationToolbarTick((value) => value + 1);
          syncPanelMetaState();
        },
        setHistory(nextUndo: number, nextRedo: number) {
          setUndoCount(Math.max(0, Math.floor(nextUndo)));
          setRedoCount(Math.max(0, Math.floor(nextRedo)));
          syncPanelMetaState();
        },
        getPosition() {
          return showExpandedPanel ? pagePanelPositionRef.current : toolbarPositionRef.current;
        },
        setPosition(position: FloatingPosition | null) {
          applyPanelPosition(position);
        },
        enterCommentInput(mode = 'bubble-card') {
          if (toolMinimized) {
            restoreTool();
          }
          onUiModeChange(mode);
          onRefreshNoteState();
        },
        enterInlineTextEdit(element?: HTMLElement | null) {
          if (toolMinimized) {
            restoreTool();
          }
          onInlineTextEditingChange?.(true, element);
        },
        getHostToolbarState() {
          return hostToolbarState;
        },
        subscribeHostToolbarState(listener) {
          hostToolbarListenersRef.current.add(listener);
          listener(hostToolbarState);
          return () => {
            hostToolbarListenersRef.current.delete(listener);
          };
        },
        runHostToolbarAction,
      }),
      [
        applyPanelPosition,
        hostToolbarState,
        onInlineTextEditingChange,
        onRefreshNoteState,
        onTargetChange,
        onUiModeChange,
        requestPanelRefresh,
        restoreTool,
        runHostToolbarAction,
        showExpandedPanel,
        syncPanelMetaState,
        toolMinimized,
      ],
    );

    const pageConfigPanelHeader = showExpandedPanel ? (
      <div
        ref={pagePanelHeaderRef}
        className="we-runtime-page-config-panel__header we-runtime-prop-panel__drag-handle"
      >
        <div className="we-runtime-prop-panel__header-title-group">
          <span className="we-runtime-prop-panel__header-title">设计决策</span>
          <Tooltip
            title={PROPERTY_PANEL_HELP_TOOLTIP}
            placement="bottomRight"
            arrow={{ pointAtCenter: true }}
            getPopupContainer={resolveRuntimePopupContainer}
          >
            <Button
              type="text"
              size="small"
              className="we-runtime-prop-panel__header-action we-runtime-prop-panel__header-help"
              aria-label="设计决策说明"
              title="设计决策说明"
              icon={<QuestionCircleOutlined />}
            />
          </Tooltip>
        </div>
        <div
          className="we-runtime-prop-panel__header-actions"
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <Button
            type="text"
            size="small"
            className="we-runtime-prop-panel__header-action"
            aria-label="复制提示词"
            title="复制提示词"
            icon={<CopyOutlined />}
            onClick={() => {
              void handleCopyGlobalPanelPrompt();
            }}
          />
        </div>
      </div>
    ) : null;

    const expandedToolbar = (
      <AgentToolbarShell
        awake={agentShellAwake}
        connected={acpUiConnected}
        dragHandleRef={toolbarHeaderRef}
        style={{
          alignSelf: 'flex-start',
          width: 'fit-content',
          maxWidth: 'calc(100% - 8px)',
          margin: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 8,
            width: 'auto',
            minWidth: 0,
          }}
        >
          <Space size={4} style={{ minWidth: 0, flex: '0 0 auto' }}>
            {selectionModeToolbarButton}
            {markdownSourceEditorToolbarButton}
            {hostSurfaceVisibilityToolbarButton ?? agentExecutionToolbarButton}
            {copyToolbarButton}
            {propertyPanelToggleButton}
            {clearAllEditsToolbarButton}
            {htmlFileSaveToolbarButton}
            {settingsToolbarButton}
            {closeToolbarButton}
          </Space>
        </div>
      </AgentToolbarShell>
    );

    const minimizedToolbar = (
      <button
        className="we-runtime-prop-panel__minimized-trigger we-runtime-prop-panel__drag-handle"
        ref={minimizedButtonRef}
        type="button"
        aria-label="开启编辑"
        title="开启编辑"
        onClick={restoreTool}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          border: 'none',
          background: 'transparent',
          color: EDITOR_CHROME.textPrimary,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          touchAction: 'none',
          pointerEvents: toolMinimized ? 'auto' : 'none',
          opacity: toolMinimized ? 1 : 0,
          transform: toolMinimized ? 'scale(1)' : 'scale(0.9)',
          transition:
            'opacity 220ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 220ms ease',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 999,
            background: EDITOR_CHROME.toolbarShellBorder,
            boxShadow: EDITOR_CHROME.shadowCompact,
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 1,
            borderRadius: 999,
            background: EDITOR_CHROME.surface,
            boxShadow: EDITOR_CHROME.toolbarShellInset,
          }}
        />
        <span
          style={{
            position: 'relative',
            zIndex: 1,
            width: 32,
            height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: EDITOR_CHROME.textSecondary,
            transition: 'background-color 220ms ease, color 220ms ease, transform 220ms ease',
          }}
        >
          <AgentSparkleIcon />
        </span>
        {modifiedCount > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              paddingInline: 5,
              borderRadius: 999,
              background: EDITOR_CHROME.accent,
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '18px',
              boxShadow: `0 6px 14px ${BRAND_PRIMARY_SHADOW}`,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            {modifiedCount > 99 ? '99+' : modifiedCount}
          </span>
        ) : null}
      </button>
    );

    const pageConfigPanelStyle: React.CSSProperties = {
      position: 'fixed',
      zIndex: Number(panelStyle.zIndex ?? 10008) + 1,
      pointerEvents: mobileHideToolbar ? 'none' : 'auto',
      opacity: mobileHideToolbar ? 0 : 1,
      ...(pagePanelPosition
        ? {
            left: pagePanelPosition.left,
            top: pagePanelPosition.top,
            right: 'auto',
            bottom: 'auto',
          }
        : { right: PROPERTY_PANEL_RIGHT, top: PROPERTY_PANEL_TOP }),
    };

    const pageConfigPanel = showExpandedPanel ? (
      <div
        ref={pagePanelRef}
        className="we-runtime-page-config-panel"
        data-we-selection-lock-root="true"
        style={pageConfigPanelStyle}
        onPointerDownCapture={() => {
          onSelectionInteractionLockChange(true);
        }}
        onFocusCapture={() => {
          onSelectionInteractionLockChange(true);
        }}
        onPointerEnter={() => {
          onHoverSelectionSuppressedChange(true);
        }}
        onPointerLeave={() => onHoverSelectionSuppressedChange(false)}
      >
        {pageConfigPanelHeader}
        <div
          ref={pagePanelBodyRef}
          className="we-runtime-page-config-panel__body"
          style={pageConfigPanelBodyStyle}
          aria-hidden={false}
        >
          <div
            onPointerDownCapture={(event) => event.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {hasPageTweakEntries ? (
              <ReactPageTweakPanel
                entries={pageTweakEntries}
                disabled={actionBusy || !options.onUpdateTweakValues}
                onChange={(element, patch) => {
                  if (!options.onUpdateTweakValues) return;
                  onDismissSelection?.();
                  onTargetChange(null);
                  void options.onUpdateTweakValues(element, patch);
                }}
                onClearEntry={
                  options.onClearCurrentElementEdits
                    ? (element) => {
                        void options.onClearCurrentElementEdits?.(element);
                      }
                    : undefined
                }
                onLocateEntry={(element) => {
                  onSelectionInteractionLockChange(false);
                  onHoverSelectionSuppressedChange(false);
                  options.onLocateElement?.(element);
                }}
              />
            ) : (
              propertyPanelEmptyState
            )}
          </div>
        </div>
      </div>
    ) : null;

    return (
      <>
        <div
          ref={rootRef}
          data-we-selection-lock-root="true"
          style={{
            ...shellStyle,
            transition: toolbarDragging
              ? 'none'
              : 'left 220ms cubic-bezier(0.2, 0.8, 0.2, 1), top 220ms cubic-bezier(0.2, 0.8, 0.2, 1), width 220ms cubic-bezier(0.2, 0.8, 0.2, 1), height 220ms cubic-bezier(0.2, 0.8, 0.2, 1), max-height 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease, border-radius 220ms ease, border-color 220ms ease, background-color 220ms ease',
            willChange: toolbarDragging ? 'left, top' : undefined,
          }}
          onPointerDownCapture={() => {
            if (toolMinimized) return;
            onSelectionInteractionLockChange(true);
          }}
          onFocusCapture={() => {
            if (toolMinimized) return;
            onSelectionInteractionLockChange(true);
          }}
          onPointerEnter={() => {
            if (!toolMinimized) {
              onHoverSelectionSuppressedChange(true);
            }
          }}
          onPointerLeave={() => onHoverSelectionSuppressedChange(false)}
        >
          <style>{PROPERTY_PANEL_LOCAL_STYLES}</style>
          {isHostToolbarMode ? null : toolMinimized ? minimizedToolbar : expandedToolbar}
          <Modal
            title="语音快捷键"
            open={shortcutDialogOpen}
            centered
            getContainer={false}
            maskClosable
            onCancel={closeShortcutDialog}
            footer={[
              <Button key="cancel" onClick={closeShortcutDialog}>
                取消
              </Button>,
              <Button
                key="save"
                type="primary"
                disabled={Boolean(shortcutValidationError)}
                onClick={handleShortcutSave}
              >
                保存
              </Button>,
            ]}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 0',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: EDITOR_CHROME.textPrimary,
                    }}
                  >
                    启用语音快捷键
                  </div>
                  <div style={shortcutCaptureHintStyle}>开启后才会响应长按修饰键和鼠标中键。</div>
                </div>
                <Switch
                  checked={shortcutDraft.enabled}
                  onChange={(checked) => {
                    handleShortcutDraftChange((prev) => ({
                      ...prev,
                      enabled: checked,
                    }));
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: `1px solid ${EDITOR_CHROME.border}`,
                  borderBottom: `1px solid ${EDITOR_CHROME.border}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: EDITOR_CHROME.textPrimary,
                    }}
                  >
                    启用鼠标中键监听
                  </div>
                  <div style={shortcutCaptureHintStyle}>鼠标中键单击会直接进入批注气泡卡片。</div>
                </div>
                <Switch
                  checked={shortcutDraft.middleClickEnabled}
                  onChange={(checked) => {
                    handleShortcutDraftChange((prev) => ({
                      ...prev,
                      middleClickEnabled: checked,
                    }));
                  }}
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                {[0, 1].map((index) => (
                  <ShortcutCaptureCard
                    key={index}
                    ref={(node) => {
                      shortcutCardRefs.current[index] = node;
                    }}
                    label={`快捷键 ${index + 1}`}
                    value={shortcutDraft.shortcuts[index] ?? null}
                    capturing={capturingShortcutIndex === index}
                    onActivate={() => setCapturingShortcutIndex(index)}
                    onCapture={(key) => {
                      handleShortcutDraftChange((prev) => {
                        const nextShortcuts = [
                          ...prev.shortcuts,
                        ] as CommentShortcutSettings['shortcuts'];
                        nextShortcuts[index] = key;
                        return {
                          ...prev,
                          shortcuts: nextShortcuts,
                        };
                      });
                      setCapturingShortcutIndex(null);
                    }}
                    onCancelCapture={() => setCapturingShortcutIndex(null)}
                    onClear={() => {
                      handleShortcutDraftChange((prev) => {
                        const nextShortcuts = [
                          ...prev.shortcuts,
                        ] as CommentShortcutSettings['shortcuts'];
                        nextShortcuts[index] = null;
                        return {
                          ...prev,
                          shortcuts: nextShortcuts,
                        };
                      });
                    }}
                  />
                ))}
              </div>
              <div style={shortcutCaptureHintStyle}>
                仅支持 Shift / Alt / Ctrl / Command，长按 {COMMENT_SHORTCUT_LONG_PRESS_MS}ms 触发。
              </div>
              {shortcutValidationError ? (
                <div style={{ fontSize: 12, color: EDITOR_CHROME.textDanger }}>
                  {shortcutValidationError}
                </div>
              ) : null}
            </div>
          </Modal>
          <Modal
            title={
              <div className="we-runtime-directory-picker__title">
                <div>选择 AI 工作目录</div>
                <div className="we-runtime-directory-picker__description">
                  选择批注和 AI 文件操作所在的项目目录。
                </div>
              </div>
            }
            open={directoryPickerOpen}
            centered
            width={720}
            className="we-runtime-directory-picker-modal"
            getContainer={false}
            closeIcon={
              <Tooltip
                title="关闭目录选择器"
                placement="bottomRight"
                getPopupContainer={resolveRuntimePopupContainer}
              >
                <CloseOutlined aria-label="关闭目录选择器" />
              </Tooltip>
            }
            keyboard={!directoryPickerBusy && !directoryPickerRecentOpen}
            maskClosable={!directoryPickerBusy}
            onCancel={() => {
              if (!directoryPickerBusy) {
                setDirectoryPickerRecentOpen(false);
                setDirectoryPickerOpen(false);
              }
            }}
            footer={[
              <Button
                key="cancel"
                disabled={directoryPickerBusy}
                onClick={() => setDirectoryPickerOpen(false)}
              >
                取消
              </Button>,
              <Button
                key="select"
                type="primary"
                loading={directoryPickerBusy}
                disabled={!directoryPickerState?.path}
                onClick={() => {
                  void handleConfirmDirectoryPicker();
                }}
              >
                选择当前目录
              </Button>,
            ]}
          >
            <div
              className="we-runtime-directory-picker"
              onPointerDownCapture={(event) => {
                const field = directoryPickerPathFieldRef.current;
                if (
                  directoryPickerRecentOpen &&
                  field &&
                  !event.nativeEvent.composedPath().includes(field)
                ) {
                  setDirectoryPickerRecentOpen(false);
                }
              }}
            >
              <form
                className="we-runtime-directory-picker__path-row"
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleDirectoryPickerPathSubmit();
                }}
              >
                <div
                  ref={directoryPickerPathFieldRef}
                  className="we-runtime-directory-picker__path-field"
                >
                  <Input
                    size="large"
                    value={directoryPickerPathInput}
                    placeholder="输入绝对路径"
                    title={directoryPickerPathInput || undefined}
                    role="combobox"
                    aria-label="AI 工作目录绝对路径"
                    aria-autocomplete="list"
                    aria-expanded={directoryPickerRecentOpen}
                    aria-controls="we-runtime-directory-picker-recent-list"
                    aria-activedescendant={
                      directoryPickerRecentOpen &&
                      filteredDirectoryPickerRecentWorkspaces.length > 0
                        ? `we-runtime-directory-picker-recent-${directoryPickerRecentActiveIndex}`
                        : undefined
                    }
                    autoComplete="off"
                    spellCheck={false}
                    disabled={directoryPickerBusy}
                    onChange={(event) => {
                      setDirectoryPickerPathInput(event.target.value);
                      setDirectoryPickerRecentQuery(event.target.value);
                      setDirectoryPickerRecentActiveIndex(0);
                      if (directoryPickerRecentWorkspaces.length > 0) {
                        setDirectoryPickerRecentOpen(true);
                      }
                    }}
                    onClick={handleDirectoryPickerPathClick}
                    onBlur={handleDirectoryPickerPathBlur}
                    onKeyDown={handleDirectoryPickerPathKeyDown}
                  />
                  {directoryPickerRecentOpen ? (
                    <div
                      id="we-runtime-directory-picker-recent-list"
                      role="listbox"
                      aria-label="最近项目"
                      className="we-runtime-directory-picker__recent-list"
                    >
                      <div className="we-runtime-directory-picker__recent-heading">最近项目</div>
                      {filteredDirectoryPickerRecentWorkspaces.length > 0 ? (
                        filteredDirectoryPickerRecentWorkspaces.map((workspace, index) => {
                          const workspaceName = getAiExecutionRecentWorkspaceName(workspace.path);
                          return (
                            <div
                              key={workspace.path}
                              id={`we-runtime-directory-picker-recent-${index}`}
                              role="option"
                              aria-selected={index === directoryPickerRecentActiveIndex}
                              className={`we-runtime-directory-picker__recent-item${
                                index === directoryPickerRecentActiveIndex
                                  ? ' we-runtime-directory-picker__recent-item--active'
                                  : ''
                              }`}
                              onPointerMove={() => setDirectoryPickerRecentActiveIndex(index)}
                            >
                              <button
                                type="button"
                                className="we-runtime-directory-picker__recent-main"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleDirectoryPickerRecentBrowse(workspace.path)}
                              >
                                <HistoryOutlined aria-hidden="true" />
                                <span className="we-runtime-directory-picker__recent-copy">
                                  <span className="we-runtime-directory-picker__recent-name">
                                    {workspaceName}
                                  </span>
                                  <span
                                    className="we-runtime-directory-picker__recent-path"
                                    title={workspace.path}
                                  >
                                    {workspace.path}
                                  </span>
                                </span>
                              </button>
                              <Tooltip
                                title="从最近项目中移除"
                                placement="left"
                                getPopupContainer={resolveRuntimePopupContainer}
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  className="we-runtime-directory-picker__recent-remove"
                                  aria-label={`从最近项目中移除：${workspaceName}`}
                                  icon={<DeleteOutlined />}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDirectoryPickerRecentRemove(workspace.path);
                                  }}
                                />
                              </Tooltip>
                            </div>
                          );
                        })
                      ) : (
                        <div className="we-runtime-directory-picker__recent-empty">
                          没有匹配的最近项目
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                <Button
                  size="large"
                  htmlType="submit"
                  loading={directoryPickerBusy}
                  disabled={!directoryPickerPathInput.trim()}
                >
                  前往
                </Button>
              </form>

              <div className="we-runtime-directory-picker__location">
                <span className="we-runtime-directory-picker__location-label">位置</span>
                <span className="we-runtime-directory-picker__divider" />
                <div
                  ref={directoryPickerBreadcrumbRef}
                  role="navigation"
                  aria-label="目录路径"
                  className="we-runtime-directory-picker__breadcrumbs"
                >
                  {directoryPickerBreadcrumbs.map((breadcrumb, index) => (
                    <React.Fragment key={breadcrumb.path}>
                      {index > 0 ? (
                        <RightOutlined
                          className="we-runtime-directory-picker__breadcrumb-separator"
                          aria-hidden="true"
                        />
                      ) : null}
                      <Button
                        type="text"
                        size="small"
                        className="we-runtime-directory-picker__breadcrumb"
                        title={breadcrumb.path}
                        disabled={directoryPickerBusy}
                        onClick={() => {
                          void browseAiExecutionDirectories(breadcrumb.path);
                        }}
                      >
                        {breadcrumb.label}
                      </Button>
                    </React.Fragment>
                  ))}
                </div>
                <span className="we-runtime-directory-picker__divider" />
                <div className="we-runtime-directory-picker__location-actions">
                  <Tooltip
                    title="返回主目录"
                    placement="bottomRight"
                    getPopupContainer={resolveRuntimePopupContainer}
                  >
                    <Button
                      type="text"
                      size="small"
                      aria-label="返回主目录"
                      icon={<HomeOutlined />}
                      disabled={directoryPickerBusy || !directoryPickerState?.home}
                      onClick={() => {
                        void browseAiExecutionDirectories(directoryPickerState?.home);
                      }}
                    />
                  </Tooltip>
                  <Tooltip
                    title="返回上一级"
                    placement="bottomRight"
                    getPopupContainer={resolveRuntimePopupContainer}
                  >
                    <Button
                      type="text"
                      size="small"
                      aria-label="返回上一级"
                      icon={<ArrowUpOutlined />}
                      disabled={directoryPickerBusy || !directoryPickerState?.parent}
                      onClick={() => {
                        void browseAiExecutionDirectories(
                          directoryPickerState?.parent ?? undefined,
                        );
                      }}
                    />
                  </Tooltip>
                </div>
              </div>

              {directoryPickerRecentError ? (
                <div className="we-runtime-directory-picker__recent-error" role="status">
                  最近项目暂不可用：{directoryPickerRecentError}
                </div>
              ) : null}
              {directoryPickerError ? (
                <div className="we-runtime-directory-picker__error" role="alert">
                  {directoryPickerError}
                </div>
              ) : null}
              <div className="we-runtime-directory-picker__list">
                {directoryPickerBusy ? (
                  <div className="we-runtime-directory-picker__empty">
                    <ReloadOutlined spin />
                    <span>正在读取目录...</span>
                  </div>
                ) : directoryPickerState?.directories.length ? (
                  directoryPickerState.directories.map((directory) => (
                    <button
                      key={directory.path}
                      type="button"
                      className="we-runtime-directory-picker__row"
                      title={directory.path}
                      onClick={() => {
                        void browseAiExecutionDirectories(directory.path);
                      }}
                    >
                      <FolderOpenOutlined aria-hidden="true" />
                      <span className="we-runtime-directory-picker__row-name">
                        {directory.name}
                      </span>
                      <RightOutlined
                        className="we-runtime-directory-picker__row-arrow"
                        aria-hidden="true"
                      />
                    </button>
                  ))
                ) : (
                  <div className="we-runtime-directory-picker__empty">
                    当前目录没有可进入的子目录，你仍可以选择它作为 AI 工作目录。
                  </div>
                )}
              </div>
            </div>
          </Modal>
          <Modal
            title="快捷键"
            open={keyboardShortcutsDialogOpen}
            className="we-runtime-keyboard-shortcuts-modal"
            centered
            getContainer={false}
            maskClosable
            onCancel={() => setKeyboardShortcutsDialogOpen(false)}
            footer={[
              <Button
                key="close"
                type="primary"
                onClick={() => setKeyboardShortcutsDialogOpen(false)}
              >
                知道了
              </Button>,
            ]}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                {
                  keys: [`${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'} + Enter`, 'Esc'],
                  label: '保存并关闭气泡卡片',
                  desc: '保存当前批注内容并关闭卡片',
                },
                {
                  keys: [`${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'} + V`],
                  label: '粘贴图片或文案',
                  desc: 'AI 开启时，在气泡卡片或待选框中可直接粘贴图片和文案',
                },
                ...(selectionModeAvailable
                  ? [
                      {
                        keys: [SELECTION_MODE_TOGGLE_SHORTCUT_LABEL],
                        label: '开启 / 关闭选择元素',
                        desc: '关闭后页面点击恢复原生交互，再按一次重新开启元素选择',
                      },
                    ]
                  : []),
                {
                  keys: [PARENT_SELECT_SHORTCUT_LABEL, PARENT_RETURN_SHORTCUT_LABEL],
                  label: '选择上 / 下级元素',
                  desc: '↑ 切换到当前元素的上一级，↓ 返回刚才选中的下一级',
                },
                ...(selectionModeAvailable
                  ? [
                      {
                        keys: [DELETE_ELEMENT_SHORTCUT_LABEL],
                        label: '删除当前元素',
                        desc: '焦点不在输入框或文本编辑区时，删除已选元素并在父级创建可恢复批注',
                      },
                    ]
                  : []),
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '14px 0',
                    borderBottom: `1px solid ${EDITOR_CHROME.border}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: EDITOR_CHROME.textPrimary,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: EDITOR_CHROME.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {item.desc}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 4,
                      flexShrink: 0,
                      alignItems: 'center',
                      paddingTop: 2,
                    }}
                  >
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          fontSize: 12,
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          fontWeight: 500,
                          lineHeight: '20px',
                          color: EDITOR_CHROME.textPrimary,
                          background: EDITOR_CHROME.surfaceMuted,
                          border: `1px solid ${EDITOR_CHROME.border}`,
                          borderRadius: 6,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Modal>
        </div>
        {pageConfigPanel}
      </>
    );
  },
);
