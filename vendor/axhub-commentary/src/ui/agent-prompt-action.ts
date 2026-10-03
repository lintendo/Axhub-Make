import type { CommentEntryMode } from './selection-ui-mode';

export type AppendElementToAgentContextHandler = (element: Element) => void | Promise<void>;
export type SendPromptToAgentHandler = () => void | Promise<void>;
export type SendCurrentElementPromptToAgentHandler = (element: Element) => void | Promise<void>;
export type AgentToolbarVisualState = 'sleeping' | 'waking' | 'awake' | 'working';

function resolveRunningConversationTitle(sessionReady: boolean): string {
  return sessionReady ? 'AI 正在修改' : 'AI 正在启动';
}

export function isAgentPromptActionVisible(options: {
  currentTarget: Element | null;
  uiMode: CommentEntryMode;
  toolMinimized: boolean;
  onAppendElementToAgentContext?: AppendElementToAgentContextHandler | undefined;
  getAgentBridgeAvailable?: (() => boolean) | undefined;
  getAssistantPanelOpen?: (() => boolean) | undefined;
}): boolean {
  const assistantPanelOpen = options.getAssistantPanelOpen?.();
  const contextAppendAvailable = typeof assistantPanelOpen === 'boolean'
    ? assistantPanelOpen
    : Boolean(options.getAgentBridgeAvailable?.() ?? false);

  return (
    options.uiMode === 'bubble-card'
    && !options.toolMinimized
    && Boolean(options.currentTarget)
    && Boolean(options.onAppendElementToAgentContext)
    && contextAppendAvailable
  );
}

export function triggerAgentPromptAction(options: {
  currentTarget: Element | null;
  onAppendElementToAgentContext?: AppendElementToAgentContextHandler | undefined;
}): boolean {
  const { currentTarget, onAppendElementToAgentContext } = options;
  if (!currentTarget || !currentTarget.isConnected || !onAppendElementToAgentContext) {
    return false;
  }

  void onAppendElementToAgentContext(currentTarget);
  return true;
}

export function getAgentPromptToolbarActionState(options: {
  toolMinimized: boolean;
  visualState: 'sleeping' | 'awake';
  waking?: boolean | undefined;
  sending?: boolean | undefined;
  interrupting?: boolean | undefined;
  hasReusableConversation?: boolean | undefined;
  pageTaskRunning?: boolean | undefined;
  pageTaskSessionReady?: boolean | undefined;
  currentTaskRunning?: boolean | undefined;
  currentTaskSessionReady?: boolean | undefined;
  canInterrupt?: boolean | undefined;
  canWakeAgent?: boolean | undefined;
  onSendPromptToAgent?: SendPromptToAgentHandler | undefined;
  getAgentBridgeConnected?: (() => boolean) | undefined;
  getSendPromptToAgentBlockReason?: (() => string | undefined) | undefined;
}): {
  robotState: AgentToolbarVisualState;
  robotDisabled: boolean;
  robotLoading: boolean;
  robotTitle: string;
  sendVisible: boolean;
  sendDisabled: boolean;
  sendLoading: boolean;
  sendTitle: string;
  sendRequiresConfirm: boolean;
  interruptVisible: boolean;
  interruptDisabled: boolean;
  interruptLoading: boolean;
  interruptTitle: string;
} {
  const connected = Boolean(options.getAgentBridgeConnected?.() ?? false);
  const pageTaskRunning = Boolean(options.pageTaskRunning);
  const currentTaskRunning = Boolean(options.currentTaskRunning);
  const interruptTaskRunning = currentTaskRunning || pageTaskRunning;
  const currentTaskSessionReady = Boolean(options.currentTaskSessionReady);
  const canAppendToCurrentSession = currentTaskRunning
    ? currentTaskSessionReady
    : !pageTaskRunning && Boolean(options.hasReusableConversation);
  const waitingForCurrentSession = currentTaskRunning && !canAppendToCurrentSession;
  const canWakeAgent = Boolean(options.canWakeAgent);
  const visualState = options.visualState === 'awake' && (connected || pageTaskRunning)
    ? 'awake'
    : 'sleeping';
  const robotState: AgentToolbarVisualState = options.waking
    ? 'waking'
    : pageTaskRunning
      ? 'working'
      : visualState;
  const blockReason = options.getSendPromptToAgentBlockReason?.();
  const showSendAction = !options.toolMinimized && Boolean(options.onSendPromptToAgent);
  const showInterruptAction = !options.toolMinimized && interruptTaskRunning;
  const sendTitle = blockReason
    ?? (!connected && !canWakeAgent
      ? 'AI 连接未建立，请稍后重试。'
      : canAppendToCurrentSession
        ? '继续追加到当前 AI 对话'
        : waitingForCurrentSession
          ? resolveRunningConversationTitle(false)
          : '发送给 AI');
  const interruptTitle = interruptTaskRunning ? '终止全部修改' : '停止 AI 修改';
  const robotTitle = robotState === 'working'
    ? '正在为你修改'
    : robotState === 'waking'
      ? '正在打开 AI'
      : robotState === 'awake'
        ? 'AI 已打开'
        : '打开 AI';

  return {
    robotState,
    robotDisabled: robotState === 'waking',
    robotLoading: robotState === 'waking',
    robotTitle,
    sendVisible: showSendAction,
    sendDisabled:
      !options.onSendPromptToAgent
      || (!connected && !canWakeAgent)
      || waitingForCurrentSession
      || Boolean(blockReason),
    sendLoading: Boolean(options.sending),
    sendTitle,
    sendRequiresConfirm: false,
    interruptVisible: showInterruptAction,
    interruptDisabled:
      !interruptTaskRunning
      || Boolean(options.interrupting),
    interruptLoading: Boolean(options.interrupting),
    interruptTitle,
  };
}

export function triggerAgentPromptToolbarAction(options: {
  onSendPromptToAgent?: SendPromptToAgentHandler | undefined;
}): Promise<boolean> {
  const { onSendPromptToAgent } = options;
  if (!onSendPromptToAgent) {
    return Promise.resolve(false);
  }

  return Promise.resolve(onSendPromptToAgent()).then(() => true);
}

export function getAgentPromptBubbleActionState(options: {
  visualState: 'sleeping' | 'awake';
  sending?: boolean | undefined;
  pageTaskRunning?: boolean | undefined;
  pageTaskSessionReady?: boolean | undefined;
  currentTaskRunning?: boolean | undefined;
  currentTaskSessionReady?: boolean | undefined;
  onSendCurrentElementPromptToAgent?: SendCurrentElementPromptToAgentHandler | undefined;
  getAgentBridgeConnected?: (() => boolean) | undefined;
  getSendCurrentElementPromptToAgentBlockReason?: (() => string | undefined) | undefined;
  hasReusableConversation?: boolean | undefined;
  canWakeAgent?: boolean | undefined;
}): {
  visible: boolean;
  disabled: boolean;
  loading: boolean;
  dismissBubble: boolean;
  title: string;
  requiresConfirm: boolean;
} {
  const connected = Boolean(options.getAgentBridgeConnected?.() ?? false);
  const pageTaskRunning = Boolean(options.pageTaskRunning);
  const currentTaskRunning = Boolean(options.currentTaskRunning);
  const currentTaskSessionReady = Boolean(options.currentTaskSessionReady);
  const canAppendToCurrentSession = currentTaskRunning
    ? currentTaskSessionReady
    : !pageTaskRunning && Boolean(options.hasReusableConversation);
  const waitingForCurrentSession = currentTaskRunning && !canAppendToCurrentSession;
  const canWakeAgent = Boolean(options.canWakeAgent);
  const visualState = options.visualState === 'awake' && (connected || pageTaskRunning)
    ? 'awake'
    : 'sleeping';
  const blockReason = options.getSendCurrentElementPromptToAgentBlockReason?.();
  const title = blockReason
    ?? (currentTaskRunning
      ? resolveRunningConversationTitle(currentTaskSessionReady)
      : !connected && !canWakeAgent
        ? 'AI 连接未建立，请稍后重试。'
        : canAppendToCurrentSession
          ? '继续追加到当前 AI 对话'
          : waitingForCurrentSession
            ? resolveRunningConversationTitle(false)
            : '发送给 AI');

  return {
    visible: Boolean(options.onSendCurrentElementPromptToAgent),
    disabled:
      !options.onSendCurrentElementPromptToAgent
      || (!connected && !canWakeAgent)
      || currentTaskRunning
      || waitingForCurrentSession
      || Boolean(blockReason),
    loading: Boolean(options.sending || currentTaskRunning),
    dismissBubble: currentTaskRunning,
    title,
    requiresConfirm: false,
  };
}
