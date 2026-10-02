import { createElementLocator, locateElement } from '../locator';
import { generateFullElementLabel, generateStableElementKey } from '../element-key';
import type {
  EditorChangesService,
  EditorFeedbackService,
  EditorAgentBridgeService,
  EditorPersistenceService,
  EditorSummariesService,
  ExternalEditingElementTarget,
  AgentProviderAvailability,
  SessionActivityItem,
  SessionActivityListener,
  SessionActivityTarget,
} from './contracts';
import type {
  EditorRuntimeState,
  ElementAgentTaskRecovery,
  ElementAgentTaskState,
  ElementAgentTaskStatus,
  ExternalEditingTaskRef,
  PageAgentConversationState,
  PersistedElementAgentTaskState,
  PromptImageAttachment,
  ResolvedWebEditorOptions,
} from './state';
import type { WebEditorElementKey } from '../../web-editor-types';
import { resolveTextCommentElementMeta } from './text-comment-target';
import { resolveAnnotationElementIdentity } from './annotation-target';
import {
  AGENT_RUN_TIMEOUT_MS,
  AGENT_BRIDGE_CONFIG_ERROR,
  AGENT_BRIDGE_LOG_PREFIX,
  AGENT_BRIDGE_NOT_CONNECTED_ERROR,
  AGENT_COMPLETED_TASK_AUTO_DISMISS_MS,
  AGENT_CONTEXT_REQUEST_TIMEOUT_MS,
  AGENT_CONVERSATION_MAX_SENDS,
  AGENT_CONVERSATION_TTL_MS,
  AGENT_DISCOVERY_TIMEOUT_MS,
  AGENT_EXECUTION_CONFIG_ERROR,
  AGENT_EXTERNAL_EDITING_TIMEOUT_MS,
  AGENT_HEALTH_PATH,
  AGENT_LOCAL_API_BASE_URL,
  AGENT_LOCAL_HEALTH_URL,
  AGENT_MAX_PROBE_ATTEMPTS,
  AGENT_MAX_RECONNECT_ATTEMPTS,
  AGENT_PAGE_OFFLINE_MESSAGE,
  AGENT_PROBE_RETRY_DELAY_MS,
  AGENT_PROVIDER_CHECK_TIMEOUT_MS,
  AGENT_RECONNECT_DELAY_MS,
  AGENT_SESSION_NOT_FOUND_CODES,
  AGENT_STATE_QUERY_TIMEOUT_MS,
  AGENT_SUPPORTED_UI_PROVIDERS,
  AGENT_WAKE_WAIT_TIMEOUT_MS,
} from './agent-bridge-internals/constants';
import {
  collectUniqueStrings,
  createRequestId,
  getTimeoutMs,
  isMessageRecord,
  normalizeBaseUrl,
  normalizeString,
  parseTimestamp,
} from './agent-bridge-internals/common';
import {
  buildDiscoveryChannelCandidates,
  buildDiscoveryTargetCandidates,
  buildAgentWsUrl,
  hasAgentServiceIdentity,
  parseEditorClientDescriptors,
  pickPreferredEditorClient,
  type EditorClientDescriptor,
} from './agent-bridge-internals/discovery';
import {
  buildCurrentFileDisplayName,
  createBridgeError,
  isSilentBridgeError,
  mapAgentErrorMessage,
  mapIntegrationErrorMessage,
  readAgentErrorCode,
  type AgentBridgeError,
} from './agent-bridge-internals/errors';
import {
  buildSessionActivityTargetKey,
  matchesSessionActivityTarget,
  normalizeSessionActivityTarget,
  parseAgentStateSyncPayload,
  parseSessionActivityItem,
  parseSessionActivityItemFromAgentEvent,
} from './agent-bridge-internals/session-activity';
import type {
  AgentStateSyncPayload,
  AgentWsMessage,
  PendingAssistantActivity,
} from './agent-bridge-internals/types';

export { buildAgentWsUrl } from './agent-bridge-internals/discovery';

type PendingRequest = {
  kind: 'integration' | 'agent-run' | 'agent-abort';
  acceptedNotified?: boolean;
  sessionCreatedNotified?: boolean;
  linkedRunRequestId?: string;
  reject: (reason?: unknown) => void;
  resolve: () => void;
  timeoutMessage: string;
  timeoutId: number;
};

type ActivePromptRun = {
  requestId: string;
  scopeKey: string;
  provider: string | null;
  sessionId: string | null;
  sessionPath: string | null;
  sessionUrl: string | null;
  abortRequestId: string | null;
  interruptRequested: boolean;
  elementKey: WebEditorElementKey;
  locator: ReturnType<typeof createElementLocator>;
  label: string;
};

type ActivitySubscriber = {
  key: string;
  target: Required<SessionActivityTarget>;
  listener: SessionActivityListener;
};

type AgentContextComment = {
  id: string;
  body: string;
  origin: 'web-editor-v2';
  target?: Record<string, string>;
  preview?: string;
  updatedAt: string;
};

type AgentCommentRecord = {
  id: string;
  type: 'file';
  path: string;
  comment: string;
  commentID: string;
  commentOrigin: 'file';
  preview?: string;
};

type IntegrationFrontendClient = {
  clientId: string;
  pageUrl: string | null;
  sessionId: string | null;
  lastSeenAt: number;
  connectedAt: number;
};

function readContextCurrentFilePath(context: unknown): string {
  if (!isMessageRecord(context)) return '';
  const currentFile = context.currentFile;
  if (typeof currentFile === 'string') {
    return normalizeString(currentFile);
  }
  if (isMessageRecord(currentFile)) {
    return normalizeString(currentFile.path);
  }
  if (isMessageRecord(context.extensions)) {
    return normalizeString(context.extensions.targetPath);
  }
  return '';
}

function normalizePathValue(value: unknown): string {
  return normalizeString(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//u, '');
}

function pathsReferToSameFile(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizePathValue(left);
  const normalizedRight = normalizePathValue(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  return (
    normalizedLeft.endsWith(`/${normalizedRight}`)
    || normalizedRight.endsWith(`/${normalizedLeft}`)
  );
}

function readContextCurrentFilePathFromPageUrl(pageUrl: unknown): string {
  const normalizedPageUrl = normalizeString(pageUrl);
  if (!normalizedPageUrl) return '';
  try {
    const url = new URL(normalizedPageUrl, 'http://localhost');
    const targetPath = normalizePathValue(url.searchParams.get('targetPath'));
    if (targetPath) {
      return targetPath;
    }

    const rawContext = normalizeString(url.searchParams.get('context'));
    if (!rawContext) {
      return '';
    }

    const parsedContext = JSON.parse(rawContext);
    return readContextCurrentFilePath(parsedContext);
  } catch {
    return '';
  }
}

function clientMatchesContext(client: IntegrationFrontendClient | EditorClientDescriptor, context: unknown): boolean {
  const currentFilePath = readContextCurrentFilePath(context);
  if (!currentFilePath) return false;
  return pathsReferToSameFile(readContextCurrentFilePathFromPageUrl(client.pageUrl), currentFilePath);
}

function pickMostRecentFrontendClient<T extends { lastSeenAt: number; connectedAt: number }>(
  clients: readonly T[],
): T | null {
  return clients.slice().sort((left, right) => {
    const leftTimestamp = Math.max(left.lastSeenAt, left.connectedAt);
    const rightTimestamp = Math.max(right.lastSeenAt, right.connectedAt);
    return rightTimestamp - leftTimestamp;
  })[0] ?? null;
}

function readFrontendClients(message: AgentWsMessage): IntegrationFrontendClient[] {
  const payload = message.payload;
  if (!payload || typeof payload !== 'object') return [];

  const frontend = payload.frontend;
  if (!isMessageRecord(frontend)) return [];

  const clients = frontend.clients;
  if (!Array.isArray(clients)) return [];

  return clients.flatMap((item) => {
    if (!isMessageRecord(item)) return [];
    const clientId = normalizeString(item.clientId);
    return clientId
      ? [{
          clientId,
          pageUrl: normalizeString(item.pageUrl) || null,
          sessionId: normalizeString(item.sessionId) || null,
          lastSeenAt: parseTimestamp(item.lastSeenAt, 0),
          connectedAt: parseTimestamp(item.connectedAt, 0),
        }]
      : [];
  });
}

function readFrontendConnected(message: AgentWsMessage, targetClientId: string): boolean {
  const payload = message.payload;
  if (!payload || typeof payload !== 'object') return false;

  const frontend = payload.frontend;
  if (!isMessageRecord(frontend)) return false;

  const connected = frontend.connected;
  if (typeof connected === 'boolean') {
    return connected;
  }

  const clients = readFrontendClients(message);
  const normalizedTargetClientId = normalizeString(targetClientId);
  if (!normalizedTargetClientId) {
    return clients.length > 0;
  }

  return clients.some((item) => item.clientId === normalizedTargetClientId);
}

function pickFrontendClientForContext(
  clients: readonly IntegrationFrontendClient[],
  context: unknown,
): IntegrationFrontendClient | null {
  const contextMatches = clients.filter((client) => clientMatchesContext(client, context));
  if (contextMatches.length > 0) {
    return pickMostRecentFrontendClient(contextMatches);
  }

  return pickMostRecentFrontendClient(clients);
}

function pickPreferredEditorClientForContext(
  items: readonly EditorClientDescriptor[],
  targetCandidates: readonly string[],
  context?: unknown,
): EditorClientDescriptor | null {
  for (const targetCandidate of targetCandidates) {
    const matched = items.find((item) => item.clientId === targetCandidate);
    if (matched) {
      return matched;
    }
  }

  if (context) {
    const contextMatches = items.filter((item) => clientMatchesContext(item, context));
    if (contextMatches.length > 0) {
      return pickMostRecentFrontendClient(contextMatches);
    }
  }

  return pickPreferredEditorClient(items, []);
}

function readProjectPathFromAgentMessage(message: AgentWsMessage): string {
  return normalizeString(
    (message as { projectPath?: unknown }).projectPath
      ?? message.result?.projectPath
      ?? message.payload?.projectPath,
  );
}

export function createAgentBridgeService(options: {
  state: EditorRuntimeState;
  changes: EditorChangesService;
  feedback: EditorFeedbackService;
  persistence: EditorPersistenceService;
  summaries: EditorSummariesService;
  bridgeOptions: ResolvedWebEditorOptions['agentBridge'];
  onAvailabilityChange?: (available: boolean) => void;
}): EditorAgentBridgeService {
  let active = false;
  let connected = false;
  let frontendAvailable = false;
  let available = false;
  let socket: WebSocket | null = null;
  let connectRequestId: string | null = null;
  let probeRequestId: string | null = null;
  let probeTimeoutId: number | null = null;
  let probeRetryTimerId: number | null = null;
  let reconnectTimerId: number | null = null;
  let visibilityCleanup: (() => void) | null = null;
  let reconnectAttemptCount = 0;
  let probeAttemptCount = 0;
  let bridgeDiscoveryPromise: Promise<boolean> | null = null;
  const stateQueryByRequestId = new Map<string, {
    sessionId: string;
    provider: string;
    taskRequestIds: string[];
    timeoutId: number;
  }>();
  const stateSubscribeByRequestId = new Map<string, {
    sessionId: string;
    provider: string;
  }>();
  const activitySubscribeByRequestId = new Map<string, string>();
  const activityUnsubscribeByRequestId = new Map<string, string>();
  const activitySubscribers = new Map<number, ActivitySubscriber>();
  const activitySubscriptionCounts = new Map<string, {
    count: number;
    target: Required<SessionActivityTarget>;
  }>();
  const pendingAssistantActivities = new Map<string, PendingAssistantActivity>();
  const pendingRequests = new Map<string, PendingRequest>();
  const activePromptRuns = new Map<string, ActivePromptRun>();
  const completedTaskDismissTimerByRequestId = new Map<string, number>();
  const externalEditingTimeoutTimerByElementKey = new Map<WebEditorElementKey, number>();
  const providerAvailabilityCache = new Map<string, { installed: boolean; installHint?: string; checkedAt: number }>();
  const providerAvailabilityInFlight = new Set<string>();
  const providerAvailabilityPromises = new Map<string, Promise<void>>();

  const { state } = options;
  let apiBaseUrl = normalizeBaseUrl(options.bridgeOptions.apiBaseUrl);
  const apiKey = normalizeString(options.bridgeOptions.apiKey);
  let enabled = Boolean(options.bridgeOptions.enabled);
  const externalClientId = normalizeString(options.bridgeOptions.externalClientId);
  let integrationChannel = normalizeString(options.bridgeOptions.integrationChannel);
  let projectPath = normalizeString(options.bridgeOptions.projectPath);
  const provider = options.bridgeOptions.provider;
  const probeOnStart = options.bridgeOptions.probeOnStart;
  const probeTimeoutMs = options.bridgeOptions.probeTimeoutMs;
  let targetClientId = normalizeString(options.bridgeOptions.targetClientId);
  enabled = enabled || Boolean(apiBaseUrl && integrationChannel);
  let nextActivitySubscriberId = 0;

  function syncAvailability(): void {
    const nextValue = frontendAvailable;
    if (available === nextValue) return;
    logInfo('Availability changed', {
      available: nextValue,
      frontendAvailable,
      integrationChannel,
      targetClientId,
    });
    available = nextValue;
    notifyStatusChange();
  }

  function applyResolvedBridgeConfig(nextConfig: Partial<{
    apiBaseUrl: string;
    integrationChannel: string;
    targetClientId: string;
  }>): void {
    const nextApiBaseUrl = normalizeBaseUrl(nextConfig.apiBaseUrl ?? apiBaseUrl);
    const nextIntegrationChannel = normalizeString(nextConfig.integrationChannel ?? integrationChannel);
    const nextTargetClientId = normalizeString(nextConfig.targetClientId ?? targetClientId);

    apiBaseUrl = nextApiBaseUrl;
    integrationChannel = nextIntegrationChannel;
    targetClientId = nextTargetClientId;
    enabled = enabled || Boolean(apiBaseUrl && integrationChannel);
  }

  async function probeApiBaseUrl(
    healthUrl: string,
    apiBaseUrlCandidate: string,
  ): Promise<string> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return '';
    }

    try {
      const response = await fetch(healthUrl, { method: 'GET' });
      if (!response.ok) {
        return '';
      }
      const payload = await response.json().catch(() => null);
      if (!payload || !hasAgentServiceIdentity(payload, response.headers) || payload.status !== 'ok') {
        return '';
      }
      return normalizeBaseUrl(apiBaseUrlCandidate);
    } catch {
      return '';
    }
  }

  async function discoverApiBaseUrl(): Promise<string> {
    const localApiBaseUrl = await probeApiBaseUrl(AGENT_LOCAL_HEALTH_URL, AGENT_LOCAL_API_BASE_URL);
    if (localApiBaseUrl) {
      return localApiBaseUrl;
    }

    if (typeof window === 'undefined') {
      return '';
    }

    return await probeApiBaseUrl(
      AGENT_HEALTH_PATH,
      new URL('/api', window.location.href).toString(),
    );
  }

  async function requestEditorClientsForChannel(
    nextApiBaseUrl: string,
    channel: string,
  ): Promise<EditorClientDescriptor[]> {
    const normalizedApiBaseUrl = normalizeBaseUrl(nextApiBaseUrl);
    const normalizedChannel = normalizeString(channel);
    if (!normalizedApiBaseUrl || !normalizedChannel || typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return [];
    }

    const requestTimeoutMs = getTimeoutMs(probeTimeoutMs, AGENT_DISCOVERY_TIMEOUT_MS);

    return new Promise<EditorClientDescriptor[]>((resolve) => {
      let discoverySocket: WebSocket | null = null;
      let settled = false;
      let connectMessageRequestId: string | null = null;
      let listMessageRequestId: string | null = null;

      const finalize = (items: EditorClientDescriptor[] = []): void => {
        if (settled) return;
        settled = true;
        if (discoverySocket) {
          discoverySocket.onopen = null;
          discoverySocket.onmessage = null;
          discoverySocket.onerror = null;
          discoverySocket.onclose = null;
          try {
            discoverySocket.close();
          } catch {
            // Ignore close failures for the one-shot discovery socket.
          }
        }
        resolve(items);
      };

      const timeoutId = window.setTimeout(() => {
        finalize([]);
      }, requestTimeoutMs);

      try {
        discoverySocket = new WebSocket(buildAgentWsUrl(normalizedApiBaseUrl, apiKey));
      } catch {
        window.clearTimeout(timeoutId);
        finalize([]);
        return;
      }

      discoverySocket.onopen = () => {
        connectMessageRequestId = createRequestId('agent_discover_connect');
        try {
          discoverySocket?.send(JSON.stringify({
            type: 'integration.connect',
            requestId: connectMessageRequestId,
            payload: {
              role: 'external-client',
              channel: normalizedChannel,
              clientId: externalClientId,
              capabilities: ['presence.query', 'editor.query'],
            },
          }));
        } catch {
          window.clearTimeout(timeoutId);
          finalize([]);
        }
      };

      discoverySocket.onmessage = (event: MessageEvent<string>) => {
        let parsed: AgentWsMessage | null = null;
        try {
          parsed = JSON.parse(event.data) as AgentWsMessage;
        } catch {
          return;
        }

        if (!parsed?.type) return;

        if (parsed.type === 'integration.connected' && parsed.requestId === connectMessageRequestId) {
          listMessageRequestId = createRequestId('agent_discover_clients');
          try {
            discoverySocket?.send(JSON.stringify({
              type: 'integration.editor.clients.list',
              requestId: listMessageRequestId,
              payload: {
                channel: normalizedChannel,
              },
            }));
          } catch {
            window.clearTimeout(timeoutId);
            finalize([]);
          }
          return;
        }

        if (parsed.type === 'integration.editor.clients.result' && parsed.requestId === listMessageRequestId) {
          window.clearTimeout(timeoutId);
          finalize(parseEditorClientDescriptors(parsed.payload));
          return;
        }

        if (parsed.type === 'integration.error' && parsed.requestId === listMessageRequestId) {
          window.clearTimeout(timeoutId);
          finalize([]);
        }
      };

      discoverySocket.onerror = () => {
        window.clearTimeout(timeoutId);
        finalize([]);
      };
      discoverySocket.onclose = () => {
        window.clearTimeout(timeoutId);
        finalize([]);
      };
    });
  }

  async function discoverPreferredEditorClient(
    nextApiBaseUrl: string,
    context?: unknown,
  ): Promise<EditorClientDescriptor | null> {
    const channelCandidates = buildDiscoveryChannelCandidates(integrationChannel);
    const targetCandidates = buildDiscoveryTargetCandidates(targetClientId);

    for (const channelCandidate of channelCandidates) {
      const discoveredClients = await requestEditorClientsForChannel(
        nextApiBaseUrl,
        channelCandidate,
      );
      if (discoveredClients.length === 0) {
        continue;
      }

      const preferredClient = pickPreferredEditorClientForContext(
        discoveredClients,
        targetCandidates,
        context,
      );
      if (preferredClient) {
        return preferredClient;
      }
    }

    return null;
  }

  async function refreshOnlineFrontendTarget(reason: string, context?: unknown): Promise<boolean> {
    const nextApiBaseUrl = normalizeBaseUrl(apiBaseUrl);
    if (!nextApiBaseUrl) {
      return false;
    }

    const preferredClient = await discoverPreferredEditorClient(nextApiBaseUrl, context);
    if (!preferredClient) {
      return false;
    }

    const nextIntegrationChannel = normalizeString(preferredClient.channel);
    const nextTargetClientId = normalizeString(preferredClient.clientId);
    if (!nextIntegrationChannel || !nextTargetClientId) {
      return false;
    }

    const configChanged =
      nextIntegrationChannel !== integrationChannel || nextTargetClientId !== targetClientId;
    if (!configChanged) {
      return false;
    }

    logInfo('Rediscovered Agent frontend target', {
      reason,
      previous: {
        integrationChannel,
        targetClientId,
      },
      next: {
        integrationChannel: nextIntegrationChannel,
        targetClientId: nextTargetClientId,
      },
    });

    applyResolvedBridgeConfig({
      apiBaseUrl: nextApiBaseUrl,
      integrationChannel: nextIntegrationChannel,
      targetClientId: nextTargetClientId,
    });
    return true;
  }

  async function resolveOnlineFrontendTargetForContext(
    context: unknown,
    reason: string,
  ): Promise<void> {
    if (normalizeString(targetClientId)) {
      return;
    }

    await refreshOnlineFrontendTarget(reason, context);
  }

  async function ensureBridgeConfig(): Promise<boolean> {
    if (bridgeDiscoveryPromise) {
      return bridgeDiscoveryPromise;
    }

    bridgeDiscoveryPromise = (async () => {
      const discoveredApiBaseUrl = normalizeBaseUrl(apiBaseUrl)
        || await discoverApiBaseUrl();
      if (!discoveredApiBaseUrl) {
        return false;
      }

      const preferredClient = await discoverPreferredEditorClient(discoveredApiBaseUrl);

      if (enabled && apiBaseUrl && integrationChannel) {
        if (preferredClient) {
          applyResolvedBridgeConfig({
            apiBaseUrl: discoveredApiBaseUrl,
            integrationChannel: normalizeString(preferredClient.channel),
            targetClientId: normalizeString(preferredClient.clientId),
          });
        }
        return true;
      }

      const resolvedChannel = normalizeString(preferredClient?.channel)
        || buildDiscoveryChannelCandidates(integrationChannel)[0]
        || '';
      const resolvedTargetClientId = normalizeString(preferredClient?.clientId)
        || buildDiscoveryTargetCandidates(targetClientId)[0]
        || '';

      applyResolvedBridgeConfig({
        apiBaseUrl: discoveredApiBaseUrl,
        integrationChannel: resolvedChannel,
        targetClientId: resolvedTargetClientId,
      });

      return enabled && Boolean(apiBaseUrl && integrationChannel);
    })();

    try {
      return await bridgeDiscoveryPromise;
    } finally {
      bridgeDiscoveryPromise = null;
    }
  }

  async function ensureAgentRunConfig(): Promise<void> {
    if (!apiBaseUrl) {
      const discoveredApiBaseUrl = await discoverApiBaseUrl();
      if (discoveredApiBaseUrl) {
        applyResolvedBridgeConfig({
          apiBaseUrl: discoveredApiBaseUrl,
        });
      }
    }

    const currentProvider = resolveConfiguredProvider();
    if (currentProvider && !providerAvailabilityCache.has(currentProvider)) {
      await refreshProviderAvailability(currentProvider);
    }
  }

  function resolveConfiguredProvider(): string {
    return String(state.uiSettings.agentProvider ?? provider ?? 'codex').trim();
  }

  async function refreshProviderAvailability(effectiveProvider: string): Promise<void> {
    if (!effectiveProvider || !apiBaseUrl) {
      return;
    }
    const pending = providerAvailabilityPromises.get(effectiveProvider);
    if (pending) {
      await pending;
      return;
    }

    const baseUrl = String(apiBaseUrl).replace(/\/+$/u, '');
    const checkUrl = `${baseUrl}/session-core/providers/${encodeURIComponent(effectiveProvider)}`;
    const promise = (async () => {
      providerAvailabilityInFlight.add(effectiveProvider);
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller
          ? (typeof window !== 'undefined'
            ? window.setTimeout(() => controller.abort(), AGENT_PROVIDER_CHECK_TIMEOUT_MS)
            : undefined)
          : undefined;

        const response = await fetch(checkUrl, {
          method: 'GET',
          ...(controller ? { signal: controller.signal } : {}),
        });

        if (timeoutId !== undefined) {
          (typeof window !== 'undefined' ? window : globalThis).clearTimeout(timeoutId);
        }

        if (!response.ok) {
          logWarn('Provider availability check returned non-OK', {
            provider: effectiveProvider,
            status: response.status,
          });
          return;
        }

        let payload: Record<string, unknown> | null = null;
        try {
          payload = await response.json() as Record<string, unknown>;
        } catch {
          return;
        }

        if (payload) {
          providerAvailabilityCache.set(effectiveProvider, {
            installed: payload.installed !== false,
            installHint: typeof payload.installHint === 'string' ? payload.installHint.trim() : undefined,
            checkedAt: Date.now(),
          });
        }
      } catch (error) {
        logWarn('Provider availability check failed (graceful degradation)', {
          provider: effectiveProvider,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        providerAvailabilityInFlight.delete(effectiveProvider);
        providerAvailabilityPromises.delete(effectiveProvider);
      }
    })();
    providerAvailabilityPromises.set(effectiveProvider, promise);
    await promise;
  }

  function getProviderAvailability(providerName: string): AgentProviderAvailability | null {
    const normalizedProvider = normalizeString(providerName);
    if (!normalizedProvider) return null;
    const cached = providerAvailabilityCache.get(normalizedProvider);
    if (!cached) return null;
    return {
      provider: normalizedProvider,
      installed: cached.installed,
      ...(cached.installHint ? { installHint: cached.installHint } : {}),
      checkedAt: cached.checkedAt ?? null,
      checking: providerAvailabilityInFlight.has(normalizedProvider),
    };
  }

  function getProviderAvailabilities(): AgentProviderAvailability[] {
    return AGENT_SUPPORTED_UI_PROVIDERS.map((providerName) => {
      const cached = providerAvailabilityCache.get(providerName);
      return {
        provider: providerName,
        installed: cached?.installed ?? true,
        ...(cached?.installHint ? { installHint: cached.installHint } : {}),
        checkedAt: cached?.checkedAt ?? null,
        checking: providerAvailabilityInFlight.has(providerName),
      } satisfies AgentProviderAvailability;
    }).filter((item) => item.checkedAt !== null);
  }

  async function refreshProviderAvailabilities(providers?: readonly string[]): Promise<void> {
    const targets = (providers?.length ? providers : AGENT_SUPPORTED_UI_PROVIDERS)
      .map((providerName) => normalizeString(providerName))
      .filter(Boolean);
    await Promise.all(targets.map((providerName) => refreshProviderAvailability(providerName)));
  }

  function assertProviderAvailable(effectiveProvider: string): void {
    const cached = providerAvailabilityCache.get(effectiveProvider);
    if (!cached || cached.installed) {
      return;
    }

    const installHint = cached.installHint
      ? `\n安装命令：${cached.installHint}`
      : '';
    throw createBridgeError(
      `当前选择的 AI 工具（${effectiveProvider}）不可用，请确认已安装或切换其他工具。${installHint}`,
      { code: 'PROVIDER_NOT_AVAILABLE' },
    );
  }

  function resolveTargetScopePath(): string {
    const targetPath = String(options.summaries.resolveTargetPath() ?? '').trim()
      || (typeof window !== 'undefined' ? String(window.location.pathname ?? '').trim() : '')
      || 'unknown';
    return targetPath;
  }

  function resolveScopePageUrl(): string {
    if (typeof window === 'undefined') return '';
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('editor');
      const nextSearch = url.searchParams.toString();
      url.search = nextSearch ? `?${nextSearch}` : '';
      return url.toString();
    } catch {
      return String(window.location.href ?? '')
        .replace(/([?&])editor=webEditorV2(&)?/, (_match, prefix, suffix) => {
          if (prefix === '?' && suffix) return '?';
          return '';
        })
        .replace(/\?$/, '');
    }
  }

  function resolveScopeIdentity(): { kind: 'file' | 'url'; value: string } {
    const currentFilePath = String(options.summaries.resolveCurrentFilePath() ?? '').trim();
    if (currentFilePath) {
      return {
        kind: 'file',
        value: currentFilePath,
      };
    }

    const pageUrl = resolveScopePageUrl();
    if (pageUrl) {
      return {
        kind: 'url',
        value: pageUrl,
      };
    }

    return {
      kind: 'url',
      value: 'unknown',
    };
  }

  function resolveScopeKey(): string {
    const scopeIdentity = resolveScopeIdentity();
    return [
      'web-editor-v2',
      String(projectPath ?? '').trim() || 'unknown-project',
      scopeIdentity.kind,
      scopeIdentity.value,
    ].join('::');
  }

  function resolvePreviousScopeKey(): string {
    const targetPath = resolveTargetScopePath();
    return [
      'web-editor-v2',
      String(projectPath ?? '').trim() || 'unknown-project',
      targetPath,
    ].join('::');
  }

  function resolveExternalEditingScopeKey(): string {
    return resolvePreviousScopeKey();
  }

  function resolveLegacyScopeKey(
    providerOverride?: string | null,
    baseScopeKey = resolveScopeKey(),
  ): string {
    const resolvedProvider = String(providerOverride ?? resolveConfiguredProvider() ?? '').trim() || 'unknown';
    return [
      baseScopeKey,
      resolvedProvider,
      String(integrationChannel ?? '').trim() || 'unknown-channel',
      String(targetClientId ?? '').trim() || 'unknown-client',
    ].join('::');
  }

  function resolveConversationLookupKeys(providerOverride?: string | null): string[] {
    const currentScopeKey = resolveScopeKey();
    const previousScopeKey = resolvePreviousScopeKey();
    return collectUniqueStrings(
      currentScopeKey,
      resolveLegacyScopeKey(providerOverride, currentScopeKey),
      previousScopeKey,
      resolveLegacyScopeKey(providerOverride, previousScopeKey),
    );
  }

  function getConversationState(scopeKey: string): PageAgentConversationState | null {
    return state.agentConversationByScopeKey.get(scopeKey) ?? null;
  }

  function getConversationStateForCurrentPage(
    providerOverride?: string | null,
  ): PageAgentConversationState | null {
    const scopeKey = resolveScopeKey();
    const conversation = resolveConversationLookupKeys(providerOverride)
      .map((candidate) => getConversationState(candidate))
      .find((candidate): candidate is PageAgentConversationState => candidate !== null);
    if (!conversation) {
      return null;
    }
    if (conversation.scopeKey === scopeKey) {
      return conversation;
    }
    return {
      ...conversation,
      scopeKey,
    };
  }

  function getCurrentConversationState(): PageAgentConversationState | null {
    return getConversationStateForCurrentPage();
  }

  function hasReusableConversation(): boolean {
    return isConversationReusable(getCurrentConversationState());
  }

  function resolveElementReusableConversation(
    element: Element | null,
    scopeKey = resolveScopeKey(),
  ): PageAgentConversationState | null {
    if (element?.isConnected) {
      const currentTask = getElementTaskState(element);
      if (
        currentTask
        && !currentTask.dismissed
        && isTaskRunning(currentTask)
        && currentTask.scopeKey === scopeKey
        && typeof currentTask.sessionId === 'string'
        && currentTask.sessionId.trim()
      ) {
        return {
          scopeKey,
          sessionId: currentTask.sessionId.trim(),
          provider: currentTask.provider,
          projectPath,
          createdAt: currentTask.startedAt,
          lastUsedAt: currentTask.updatedAt,
          sentCount: 0,
          expiresAt: Date.now() + AGENT_CONVERSATION_TTL_MS,
          invalidated: false,
          sessionPath: currentTask.sessionPath,
          sessionUrl: currentTask.sessionUrl,
        };
      }
    }

    const pageHasRunningTask = getVisibleTaskStates().some((task) =>
      task.scopeKey === scopeKey && isTaskRunning(task),
    );
    if (pageHasRunningTask) {
      return null;
    }

    const activeConversation = getConversationStateForCurrentPage();
    return isConversationReusable(activeConversation) ? activeConversation : null;
  }

  function canReuseConversationForElement(element: Element | null): boolean {
    return Boolean(resolveElementReusableConversation(element));
  }

  function invalidateCurrentConversation(): void {
    invalidateConversationScope(resolveScopeKey());
  }

  function persistConversationState(scopeKey: string): void {
    const conversation = getConversationState(scopeKey);
    if (!conversation) {
      options.persistence.clearAgentConversationState(scopeKey);
      return;
    }
    options.persistence.writeAgentConversationState(scopeKey, conversation);
  }

  function setConversationState(
    scopeKey: string,
    conversation: PageAgentConversationState | null,
  ): PageAgentConversationState | null {
    if (!conversation) {
      state.agentConversationByScopeKey.delete(scopeKey);
      options.persistence.clearAgentConversationState(scopeKey);
      notifyTaskStateChange();
      return null;
    }
    state.agentConversationByScopeKey.set(scopeKey, conversation);
    persistConversationState(scopeKey);
    notifyTaskStateChange();
    return conversation;
  }

  function isConversationReusable(conversation: PageAgentConversationState | null): boolean {
    if (!conversation?.sessionId || conversation.invalidated) {
      return false;
    }
    if (conversation.sentCount >= AGENT_CONVERSATION_MAX_SENDS) {
      return false;
    }
    return Number.isFinite(conversation.expiresAt) && conversation.expiresAt > Date.now();
  }

  function upsertConversationState(
    scopeKey: string,
    patch: Partial<PageAgentConversationState> & Pick<PageAgentConversationState, 'sessionId'>,
  ): PageAgentConversationState {
    const currentConversation = getConversationState(scopeKey);
    const now = Date.now();
    const createdAt = Number.isFinite(Number(patch.createdAt))
      ? Number(patch.createdAt)
      : currentConversation?.createdAt ?? now;
    const lastUsedAt = Number.isFinite(Number(patch.lastUsedAt))
      ? Number(patch.lastUsedAt)
      : currentConversation?.lastUsedAt ?? createdAt;
    const nextConversation: PageAgentConversationState = {
      scopeKey,
      sessionId: String(patch.sessionId ?? currentConversation?.sessionId ?? '').trim(),
      provider: typeof patch.provider === 'string' && patch.provider.trim()
        ? patch.provider.trim()
        : currentConversation?.provider ?? null,
      projectPath: typeof patch.projectPath === 'string' && patch.projectPath.trim()
        ? patch.projectPath.trim()
        : currentConversation?.projectPath ?? (String(projectPath ?? '').trim() || null),
      createdAt,
      lastUsedAt,
      sentCount: Math.max(
        0,
        Math.floor(
          Number(
            patch.sentCount
            ?? currentConversation?.sentCount
            ?? 0,
          ),
        ),
      ),
      expiresAt: Number.isFinite(Number(patch.expiresAt))
        ? Number(patch.expiresAt)
        : createdAt + AGENT_CONVERSATION_TTL_MS,
      invalidated: typeof patch.invalidated === 'boolean'
        ? patch.invalidated
        : currentConversation?.invalidated ?? false,
      sessionPath: typeof patch.sessionPath === 'string' && patch.sessionPath.trim()
        ? patch.sessionPath.trim()
        : patch.sessionPath === null
          ? null
          : currentConversation?.sessionPath ?? null,
      sessionUrl: typeof patch.sessionUrl === 'string' && patch.sessionUrl.trim()
        ? patch.sessionUrl.trim()
        : patch.sessionUrl === null
          ? null
          : currentConversation?.sessionUrl ?? null,
    };
    return setConversationState(scopeKey, nextConversation) as PageAgentConversationState;
  }

  function logInfo(message: string, detail?: unknown): void {
    void message;
    void detail;
  }

  function logDebug(message: string, detail?: unknown): void {
    void message;
    void detail;
  }

  function logWarn(message: string, detail?: unknown): void {
    if (detail === undefined) {
      console.warn(`${AGENT_BRIDGE_LOG_PREFIX} ${message}`);
      return;
    }
    console.warn(`${AGENT_BRIDGE_LOG_PREFIX} ${message}`, detail);
  }

  function notifyStatusChange(): void {
    options.onAvailabilityChange?.(available);
  }

  function notifyConnected(nextValue: boolean): void {
    if (connected === nextValue) return;
    logInfo('Connection changed', {
      connected: nextValue,
      integrationChannel,
      targetClientId,
    });
    connected = nextValue;
    notifyStatusChange();
  }

  function notifyAvailability(nextValue: boolean): void {
    if (frontendAvailable === nextValue) return;
    frontendAvailable = nextValue;
    syncAvailability();
  }

  function notifyTaskStateChange(): void {
    state.breadcrumbs?.refresh();
    state.propertyPanel?.refresh();
    options.changes.renderChangeMarkers();
    state.positionTracker?.forceUpdate(true);
  }

  function clearCompletedTaskDismissTimer(requestId: string | null | undefined): void {
    const normalizedRequestId = String(requestId ?? '').trim();
    if (!normalizedRequestId) return;
    const timerId = completedTaskDismissTimerByRequestId.get(normalizedRequestId);
    if (timerId === undefined) return;
    window.clearTimeout(timerId);
    completedTaskDismissTimerByRequestId.delete(normalizedRequestId);
  }

  function dismissCompletedTaskStates(requestId: string): void {
    clearCompletedTaskDismissTimer(requestId);
    const tasks = getTaskStatesByRequestId(requestId).filter(
      (task) => task.status === 'completed' && !task.dismissed,
    );
    if (tasks.length === 0) return;
    const now = Date.now();
    for (const task of tasks) {
      upsertTaskState({
        ...task,
        dismissed: true,
        updatedAt: now,
        lastEventAt: task.lastEventAt,
      });
    }
  }

  function clearExternalEditingTimeoutTimer(
    elementKey: WebEditorElementKey | null | undefined,
  ): void {
    if (!elementKey) return;
    const timerId = externalEditingTimeoutTimerByElementKey.get(elementKey);
    if (timerId === undefined) return;
    window.clearTimeout(timerId);
    externalEditingTimeoutTimerByElementKey.delete(elementKey);
  }

  function expireExternalEditingTask(elementKey: WebEditorElementKey): void {
    clearExternalEditingTimeoutTimer(elementKey);
    const currentTask = state.externalEditingTaskByElementKey.get(elementKey)
      ?? state.agentTaskByElementKey.get(elementKey)
      ?? null;
    if (
      !currentTask
      || currentTask.origin !== 'external-editing'
      || !isTaskRunning(currentTask)
      || currentTask.dismissed
    ) {
      return;
    }

    logInfo('Releasing stale external editing task after local watchdog elapsed', {
      requestId: currentTask.requestId,
      sessionId: currentTask.sessionId,
      provider: currentTask.provider,
      scopeKey: currentTask.scopeKey,
      elementKey,
    });
    removeTaskStateByRequestId(currentTask.requestId);
  }

  function syncExternalEditingTimeout(task: ElementAgentTaskState): void {
    if (task.origin !== 'external-editing') return;
    if (!isTaskRunning(task) || task.dismissed) {
      clearExternalEditingTimeoutTimer(task.elementKey);
      return;
    }

    clearExternalEditingTimeoutTimer(task.elementKey);
    const elapsedMs = Math.max(0, Date.now() - task.updatedAt);
    const remainingMs = Math.max(0, AGENT_EXTERNAL_EDITING_TIMEOUT_MS - elapsedMs);
    const expectedRequestId = task.requestId;
    const expectedUpdatedAt = task.updatedAt;
    const timerId = window.setTimeout(() => {
      const currentTask = state.externalEditingTaskByElementKey.get(task.elementKey)
        ?? state.agentTaskByElementKey.get(task.elementKey)
        ?? null;
      if (
        !currentTask
        || currentTask.origin !== 'external-editing'
        || currentTask.requestId !== expectedRequestId
        || !isTaskRunning(currentTask)
        || currentTask.dismissed
      ) {
        return;
      }
      if (currentTask.updatedAt !== expectedUpdatedAt) {
        syncExternalEditingTimeout(currentTask);
        return;
      }
      expireExternalEditingTask(task.elementKey);
    }, remainingMs);
    externalEditingTimeoutTimerByElementKey.set(task.elementKey, timerId);
  }

  function syncCompletedTaskDismissTimer(requestId: string | null | undefined): void {
    const normalizedRequestId = String(requestId ?? '').trim();
    if (!normalizedRequestId) return;
    const tasks = getTaskStatesByRequestId(normalizedRequestId);
    if (
      tasks.length === 0
      || tasks.some((task) => task.dismissed || task.status !== 'completed')
    ) {
      clearCompletedTaskDismissTimer(normalizedRequestId);
      return;
    }
    if (completedTaskDismissTimerByRequestId.has(normalizedRequestId)) {
      return;
    }
    const timerId = window.setTimeout(() => {
      dismissCompletedTaskStates(normalizedRequestId);
    }, AGENT_COMPLETED_TASK_AUTO_DISMISS_MS);
    completedTaskDismissTimerByRequestId.set(normalizedRequestId, timerId);
  }

  function persistTaskStates(scopeKey: string): void {
    const tasks = Array.from(state.agentTaskByElementKey.values())
      .filter(
        (task) => {
          if (task.scopeKey !== scopeKey || task.dismissed) return false;
          if (task.origin === 'external-editing') return false;
          // Always persist running tasks with valid session info
          if (isTaskRunning(task)
            && typeof task.sessionId === 'string'
            && task.sessionId.trim().length > 0
            && typeof task.provider === 'string'
            && task.provider.trim().length > 0
          ) {
            return true;
          }
          return false;
        },
      )
      .map<PersistedElementAgentTaskState>((task) => ({
        scopeKey: task.scopeKey,
        elementKey: task.elementKey,
        locator: task.locator,
        label: task.label,
        requestId: task.requestId,
        sessionId: task.sessionId,
        sessionPath: task.sessionPath,
        sessionUrl: task.sessionUrl,
        provider: task.provider,
        status: task.status,
        message: task.message,
        startedAt: task.startedAt,
        updatedAt: task.updatedAt,
        dismissed: task.dismissed,
        recoveryPending: task.recoveryPending,
        lastEventAt: task.lastEventAt,
        errorCode: task.errorCode,
        origin: task.origin,
      }));
    options.persistence.writeAgentTaskStates(scopeKey, tasks);
  }

  function setActivePromptRun(nextRun: ActivePromptRun | null): void {
    if (!nextRun) {
      activePromptRuns.clear();
      notifyStatusChange();
      return;
    }

    activePromptRuns.set(nextRun.requestId, nextRun);
    notifyStatusChange();
  }

  function updateActivePromptRun(
    requestId: string,
    patch: Partial<ActivePromptRun>,
  ): ActivePromptRun | null {
    const currentRun = activePromptRuns.get(requestId);
    if (!currentRun) return null;
    const nextRun = {
      ...currentRun,
      ...patch,
    };
    activePromptRuns.set(requestId, nextRun);
    notifyStatusChange();
    return nextRun;
  }

  function clearActivePromptRun(requestId: string): ActivePromptRun | null {
    const currentRun = activePromptRuns.get(requestId) ?? null;
    if (!currentRun) return null;
    activePromptRuns.delete(requestId);
    notifyStatusChange();
    return currentRun;
  }

  function isVisibleTask(task: ElementAgentTaskState | null | undefined): task is ElementAgentTaskState {
    return Boolean(task && !task.dismissed && (!task.recoveryPending || isTaskRunning(task)));
  }

  function getExternalEditingTaskStateByKey(
    elementKey: WebEditorElementKey | null | undefined,
  ): ElementAgentTaskState | null {
    if (!elementKey) return null;
    const task = state.externalEditingTaskByElementKey.get(elementKey) ?? null;
    return isVisibleTask(task) ? task : null;
  }

  function getDisplayTaskStateByKey(
    elementKey: WebEditorElementKey | null | undefined,
  ): ElementAgentTaskState | null {
    return getElementTaskStateByKey(elementKey) ?? getExternalEditingTaskStateByKey(elementKey);
  }

  function getElementTaskState(element: Element | null): ElementAgentTaskState | null {
    if (!element || !element.isConnected) return null;
    const textCommentMeta = resolveTextCommentElementMeta(state, element);
    if (textCommentMeta) {
      return getDisplayTaskStateByKey(textCommentMeta.elementKey);
    }
    const annotationIdentity = resolveAnnotationElementIdentity(element);
    if (annotationIdentity) {
      return getDisplayTaskStateByKey(annotationIdentity.elementKey);
    }
    const locator = createElementLocator(element);
    const elementKey = generateStableElementKey(element, locator.shadowHostChain);
    return getDisplayTaskStateByKey(elementKey);
  }

  function getElementTaskStateByKey(
    elementKey: WebEditorElementKey | null | undefined,
  ): ElementAgentTaskState | null {
    if (!elementKey) return null;
    const task = state.agentTaskByElementKey.get(elementKey) ?? null;
    return task?.dismissed ? null : task;
  }

  function getTaskStateByRequestId(requestId: string | null | undefined): ElementAgentTaskState | null {
    if (!requestId) return null;
    return state.agentTaskByRequestId.get(requestId)
      ?? Array.from(state.agentTaskByElementKey.values()).find((task) => task.requestId === requestId)
      ?? null;
  }

  function getTaskStatesByRequestId(requestId: string | null | undefined): ElementAgentTaskState[] {
    if (!requestId) return [];
    return Array.from(state.agentTaskByElementKey.values())
      .filter((task) => task.requestId === requestId)
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  function reindexTaskStateByRequestId(requestId: string | null | undefined): void {
    if (!requestId) return;
    const nextTask = Array.from(state.agentTaskByElementKey.values())
      .find((task) => task.requestId === requestId);
    if (nextTask) {
      state.agentTaskByRequestId.set(requestId, nextTask);
      return;
    }
    state.agentTaskByRequestId.delete(requestId);
  }

  function resolveElementTaskMeta(element: Element): {
    elementKey: WebEditorElementKey;
    locator: ReturnType<typeof createElementLocator>;
    label: string;
  } {
    const textCommentMeta = resolveTextCommentElementMeta(state, element);
    if (textCommentMeta) {
      return {
        elementKey: textCommentMeta.elementKey,
        locator: textCommentMeta.locator,
        label: textCommentMeta.label,
      };
    }
    const annotationIdentity = resolveAnnotationElementIdentity(element);
    if (annotationIdentity) {
      return {
        elementKey: annotationIdentity.elementKey,
        locator: annotationIdentity.locator,
        label: annotationIdentity.label,
      };
    }
    const existingMeta = options.changes.getMetaForElement?.(element);
    if (existingMeta) {
      return {
        elementKey: existingMeta.elementKey,
        locator: existingMeta.locator,
        label: existingMeta.label,
      };
    }
    const locator = createElementLocator(element);
    const elementKey = generateStableElementKey(element, locator.shadowHostChain);
    const label = generateFullElementLabel(element, locator.shadowHostChain);
    return {
      elementKey,
      locator,
      label,
    };
  }

  function normalizeExternalEditingElementTarget(
    target: ExternalEditingElementTarget,
  ): ExternalEditingElementTarget | null {
    const elementKey = String(target?.elementKey ?? '').trim();
    if (!elementKey || !target?.locator) {
      return null;
    }
    const label = String(target.label ?? '').trim() || elementKey;
    return {
      elementKey,
      locator: target.locator,
      label,
    };
  }

  function scheduleExternalEditingCompletedRemoval(
    elementKey: WebEditorElementKey,
    requestId: string,
  ): void {
    window.setTimeout(() => {
      const currentTask = state.externalEditingTaskByElementKey.get(elementKey);
      if (currentTask && currentTask.requestId === requestId && currentTask.status === 'completed') {
        state.externalEditingTaskByElementKey.delete(elementKey);
        removeTaskStateByRequestId(requestId);
      }
    }, AGENT_COMPLETED_TASK_AUTO_DISMISS_MS);
  }

  function upsertExternalEditingTaskState(
    target: ExternalEditingElementTarget,
    status: 'created' | 'completed' | 'error',
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null {
    const normalizedTarget = normalizeExternalEditingElementTarget(target);
    if (!normalizedTarget) return null;

    const normalizedTaskRef = normalizeExternalTaskRef(taskRef);
    const existingTask = state.externalEditingTaskByElementKey.get(normalizedTarget.elementKey)
      ?? state.agentTaskByElementKey.get(normalizedTarget.elementKey)
      ?? null;
    const now = Date.now();
    const fallbackProvider = String(resolveConfiguredProvider() || '').trim() || null;
    const scopeKey = existingTask?.origin === 'external-editing'
      ? existingTask.scopeKey
      : resolveExternalEditingScopeKey();
    const isCompleted = status === 'completed';
    const isError = status === 'error';
    const nextTask: ElementAgentTaskState = {
      scopeKey,
      elementKey: normalizedTarget.elementKey,
      locator: normalizedTarget.locator,
      label: normalizedTarget.label,
      requestId:
        normalizedTaskRef?.requestId
        ?? existingTask?.requestId
        ?? `external_editing_${normalizedTarget.elementKey}`,
      sessionId: normalizedTaskRef?.sessionId ?? existingTask?.sessionId ?? null,
      sessionPath: null,
      sessionUrl: null,
      provider: normalizedTaskRef?.provider ?? existingTask?.provider ?? fallbackProvider,
      status,
      message: isCompleted ? '修改完成' : isError ? 'AI 修改失败' : 'AI 编辑中',
      startedAt: existingTask?.startedAt ?? now,
      updatedAt: now,
      dismissed: false,
      recovery: 'live',
      recoveryPending: false,
      lastEventAt: now,
      errorCode: isError ? 'EXTERNAL_EDITING_ERROR' : null,
      origin: 'external-editing',
      taskRef: normalizedTaskRef,
    };

    upsertTaskState(nextTask);
    if (isCompleted) {
      scheduleExternalEditingCompletedRemoval(nextTask.elementKey, nextTask.requestId);
    }
    return nextTask;
  }

  function inferPromptImageExtension(mimeType: unknown, fileName: unknown): string {
    const fileNameExt = normalizeString(fileName).match(/\.([a-z0-9+.-]+)$/iu)?.[1];
    if (fileNameExt) {
      const ext = fileNameExt.toLowerCase();
      return ext === 'jpeg' ? 'jpg' : ext;
    }

    const normalizedMimeType = normalizeString(mimeType).toLowerCase();
    if (normalizedMimeType === 'image/jpeg') return 'jpg';
    if (normalizedMimeType === 'image/svg+xml') return 'svg';
    if (normalizedMimeType.startsWith('image/')) {
      return normalizedMimeType.slice('image/'.length).replace(/[^a-z0-9+.-]/gu, '') || 'png';
    }
    return 'png';
  }

  function sanitizePromptImageAssetBaseName(value: unknown, fallback: string): string {
    const normalized = normalizeString(value).replace(/\.[a-z0-9+.-]+$/iu, '');
    const safe = normalized
      .replace(/[^a-z0-9_-]+/giu, '-')
      .replace(/^-+|-+$/gu, '')
      .toLowerCase();
    return safe || fallback;
  }

  function inferPromptImageAssetPath(
    image: Pick<PromptImageAttachment, 'id' | 'name' | 'mimeType'> & { assetPath?: string },
    index: number,
  ): string {
    const assetPath = normalizeString(image.assetPath).replace(/\\/g, '/').replace(/^\/+/u, '');
    if (assetPath) return assetPath;

    const id = sanitizePromptImageAssetBaseName(image.id, `image-${index + 1}`);
    return `prototype-comment-assets/${id}.${inferPromptImageExtension(image.mimeType, image.name)}`;
  }

  function appendPromptImageAssetPathsToMessage(
    message: string,
    images: readonly { assetPath?: string; source?: PromptImageAttachment['source'] }[],
  ): string {
    const userPaths = collectUniqueStrings(
      ...images
        .filter((image) => image.source !== 'target-screenshot')
        .map((image) => normalizeString(image.assetPath)),
    ).filter((assetPath) => !message.includes(assetPath));
    const targetPath = [...images]
      .reverse()
      .find((image) => image.source === 'target-screenshot')?.assetPath;
    const missingTargetPath = targetPath && !message.includes(targetPath) ? targetPath : '';
    if (userPaths.length === 0 && !missingTargetPath) return message;

    return [
      message,
      '',
      ...(userPaths.length > 0
        ? ['本地图片素材:', ...userPaths.map((assetPath) => `- ${assetPath}`)]
        : []),
      ...(missingTargetPath
        ? [`目标截图（用于精确定位当前批注元素）：${missingTargetPath}`]
        : []),
    ].join('\n');
  }

  function collectPromptImagesForElements(elements: readonly Element[]) {
    return elements.flatMap((element) =>
      (() => {
        const images = options.changes.getImagesForElement(element);
        const userImages = images
          .filter((image) => image.source !== 'target-screenshot')
          .slice(0, 3);
        const targetScreenshot = [...images]
          .reverse()
          .find((image) => image.source === 'target-screenshot');
        return [...userImages, ...(targetScreenshot ? [targetScreenshot] : [])]
          .map((image, index) => ({
            name: image.name,
            data: image.data,
            mimeType: image.mimeType,
            size: image.size,
            ...(image.source === 'target-screenshot' ? { source: image.source } : {}),
            assetPath: inferPromptImageAssetPath(image, index),
          }));
      })(),
    );
  }

  function isTaskRunning(
    task: Pick<ElementAgentTaskState, 'status'> | Pick<PersistedElementAgentTaskState, 'status'> | null | undefined,
  ): boolean {
    return task?.status === 'pending' || task?.status === 'created';
  }

  function shouldTrapDescendantSelection(task: ElementAgentTaskState | null | undefined): boolean {
    if (!task || task.dismissed) {
      return false;
    }
    return isTaskRunning(task) || task.status === 'error';
  }

  function isWithinTaskSubtree(target: Element | null, root: Element): boolean {
    if (!target || !target.isConnected) return false;
    const hasShadowRoot = typeof ShadowRoot !== 'undefined';
    let current: Element | null = target;
    while (current) {
      if (current === root) return true;
      const rootNode = current.getRootNode?.();
      if (
        hasShadowRoot
        && rootNode instanceof ShadowRoot
        && rootNode.host instanceof Element
        && rootNode.host !== current
      ) {
        current = rootNode.host;
      } else {
        current = current.parentElement;
      }
    }
    return false;
  }

  function syncTrackedTargetsForTask(task: ElementAgentTaskState): void {
    if (!shouldTrapDescendantSelection(task)) return;
    let taskRoot: Element | null = null;
    try {
      taskRoot = locateElement(task.locator);
    } catch {
      taskRoot = null;
    }
    if (!taskRoot?.isConnected) return;

    const selected = state.selectedElement;
    if (selected && selected !== taskRoot && isWithinTaskSubtree(selected, taskRoot)) {
      state.selectedElement = taskRoot;
      state.initialSelectionElement = taskRoot;
      state.positionTracker?.setSelectionElement(taskRoot);
      state.breadcrumbs?.setTarget(taskRoot);
      state.propertyPanel?.setTarget(taskRoot);
      state.handlesController?.setTarget(taskRoot);
      state.parentSelectController?.setTarget(taskRoot);
    }

    const hovered = state.hoveredElement;
    if (hovered && hovered !== taskRoot && isWithinTaskSubtree(hovered, taskRoot)) {
      state.hoveredElement = null;
      state.positionTracker?.setHoverElement(null);
    }
  }

  function resolveSelectableElement(element: Element | null): Element | null {
    if (!element || !element.isConnected) return null;

    const hasShadowRoot = typeof ShadowRoot !== 'undefined';
    let current: Element | null = element;
    while (current) {
      const task = getElementTaskState(current);
      if (shouldTrapDescendantSelection(task)) {
        return current;
      }
      const rootNode = current.getRootNode?.();
      if (
        hasShadowRoot
        && rootNode instanceof ShadowRoot
        && rootNode.host instanceof Element
        && rootNode.host !== current
      ) {
        current = rootNode.host;
      } else {
        current = current.parentElement;
      }
    }

    return element;
  }

  function isElementInteractionLocked(element: Element | null): boolean {
    const hasShadowRoot = typeof ShadowRoot !== 'undefined';
    let current: Element | null = element;
    while (current) {
      const task = getElementTaskState(current);
      if (isTaskRunning(task) && !task?.dismissed) {
        return true;
      }
      const rootNode = current.getRootNode?.();
      if (
        hasShadowRoot
        && rootNode instanceof ShadowRoot
        && rootNode.host instanceof Element
        && rootNode.host !== current
      ) {
        current = rootNode.host;
      } else {
        current = current.parentElement;
      }
    }
    return false;
  }

  function upsertTaskState(
    task: ElementAgentTaskState,
    options: {
      clearPreviousRequestId?: string | null;
    } = {},
  ): ElementAgentTaskState {
    const previousByElementKey = state.agentTaskByElementKey.get(task.elementKey);
    state.agentTaskByElementKey.set(task.elementKey, task);
    state.agentTaskByRequestId.set(task.requestId, task);
    if (task.origin === 'external-editing') {
      state.externalEditingTaskByElementKey.set(task.elementKey, task);
    }
    if (previousByElementKey && previousByElementKey.requestId !== task.requestId) {
      reindexTaskStateByRequestId(previousByElementKey.requestId);
    }
    if (options.clearPreviousRequestId && options.clearPreviousRequestId !== task.requestId) {
      reindexTaskStateByRequestId(options.clearPreviousRequestId);
    }
    syncTrackedTargetsForTask(task);
    persistTaskStates(task.scopeKey);
    notifyTaskStateChange();
    syncCompletedTaskDismissTimer(task.requestId);
    syncExternalEditingTimeout(task);
    return task;
  }

  function removeTaskStateByRequestId(requestId: string): ElementAgentTaskState | null {
    const currentTasks = getTaskStatesByRequestId(requestId);
    if (currentTasks.length === 0) return null;
    for (const currentTask of currentTasks) {
      if (currentTask.origin === 'external-editing') {
        clearExternalEditingTimeoutTimer(currentTask.elementKey);
        if (state.externalEditingTaskByElementKey.get(currentTask.elementKey)?.requestId === requestId) {
          state.externalEditingTaskByElementKey.delete(currentTask.elementKey);
        }
      }
      if (state.agentTaskByElementKey.get(currentTask.elementKey)?.requestId === requestId) {
        state.agentTaskByElementKey.delete(currentTask.elementKey);
      }
    }
    const scopeKeys = Array.from(new Set(currentTasks.map((task) => task.scopeKey)));
    reindexTaskStateByRequestId(requestId);
    for (const scopeKey of scopeKeys) {
      persistTaskStates(scopeKey);
    }
    notifyTaskStateChange();
    clearCompletedTaskDismissTimer(requestId);
    return currentTasks[0] ?? null;
  }

  function updateTaskStateByRequestId(
    requestId: string,
    patch: Partial<ElementAgentTaskState> & {
      status?: ElementAgentTaskStatus;
      message?: string;
    },
    options: {
      reviveDismissed?: boolean;
    } = {},
  ): ElementAgentTaskState | null {
    const currentTasks = getTaskStatesByRequestId(requestId);
    if (currentTasks.length === 0) return null;

    let firstUpdatedTask: ElementAgentTaskState | null = null;
    for (const currentTask of currentTasks) {
      const nextRequestId = patch.requestId ?? currentTask.requestId;
      const nextTask: ElementAgentTaskState = {
        ...currentTask,
        ...patch,
        requestId: nextRequestId,
        dismissed:
          patch.dismissed ?? (options.reviveDismissed ? false : currentTask.dismissed),
        updatedAt:
          Number.isFinite(Number(patch.updatedAt))
            ? Number(patch.updatedAt)
            : Date.now(),
        lastEventAt:
          Number.isFinite(Number(patch.lastEventAt))
            ? Number(patch.lastEventAt)
            : currentTask.lastEventAt,
      };
      const updatedTask = upsertTaskState(nextTask, {
        clearPreviousRequestId:
          nextRequestId !== currentTask.requestId ? currentTask.requestId : null,
      });
      if (!firstUpdatedTask) {
        firstUpdatedTask = updatedTask;
      }
    }
    return firstUpdatedTask;
  }

  function dismissElementTaskState(
    element: Element,
    options: {
      includeRunning?: boolean;
    } = {},
  ): void {
    const currentTask = getElementTaskState(element);
    if (!currentTask || currentTask.dismissed) return;
    if (isTaskRunning(currentTask) && !options.includeRunning) return;
    const dismissedTask = {
      ...currentTask,
      dismissed: true,
      updatedAt: Date.now(),
      lastEventAt: currentTask.lastEventAt,
    };
    if (dismissedTask.origin === 'external-editing') {
      state.externalEditingTaskByElementKey.set(dismissedTask.elementKey, dismissedTask);
    }
    upsertTaskState(dismissedTask);
  }

  function getVisibleTaskStates(): ElementAgentTaskState[] {
    const tasksByElementKey = new Map<WebEditorElementKey, ElementAgentTaskState>();
    for (const task of Array.from(state.agentTaskByElementKey.values()).filter(isVisibleTask)) {
      tasksByElementKey.set(task.elementKey, task);
    }
    for (const task of Array.from(state.externalEditingTaskByElementKey.values()).filter(isVisibleTask)) {
      if (!tasksByElementKey.has(task.elementKey)) {
        tasksByElementKey.set(task.elementKey, task);
      }
    }
    return Array.from(tasksByElementKey.values()).sort((a, b) => a.startedAt - b.startedAt);
  }

  function updateTerminalTaskState(
    requestId: string,
    currentRun: ActivePromptRun | null,
    patch: {
      status: 'completed' | 'error';
      provider?: unknown;
      sessionId?: unknown;
      sessionPath?: unknown;
      sessionUrl?: unknown;
      message: string;
      errorCode: string | null;
    },
  ): ElementAgentTaskState | null {
    const task = updateTaskStateByRequestId(requestId, {
      status: patch.status,
      provider:
        typeof patch.provider === 'string' && patch.provider.trim()
          ? patch.provider.trim()
          : currentRun?.provider ?? resolveConfiguredProvider(),
      sessionId:
        typeof patch.sessionId === 'string' && patch.sessionId.trim()
          ? patch.sessionId.trim()
          : currentRun?.sessionId ?? null,
      sessionPath:
        typeof patch.sessionPath === 'string' && patch.sessionPath.trim()
          ? patch.sessionPath.trim()
          : currentRun?.sessionPath ?? null,
      sessionUrl:
        typeof patch.sessionUrl === 'string' && patch.sessionUrl.trim()
          ? patch.sessionUrl.trim()
          : currentRun?.sessionUrl ?? null,
      message: patch.message,
      recovery: 'live',
      recoveryPending: false,
      lastEventAt: Date.now(),
      errorCode: patch.errorCode,
    }, {
      reviveDismissed: true,
    });
    if (task) {
      options.persistence.flushPendingWrite('state');
    }
    return task;
  }

  function normalizeExternalTaskRef(
    taskRef: Partial<ExternalEditingTaskRef> | null | undefined,
  ): ExternalEditingTaskRef | null {
    if (!taskRef) return null;
    return {
      provider:
        typeof taskRef.provider === 'string' && taskRef.provider.trim()
          ? taskRef.provider.trim()
          : null,
      sessionId:
        typeof taskRef.sessionId === 'string' && taskRef.sessionId.trim()
          ? taskRef.sessionId.trim()
          : null,
      requestId:
        typeof taskRef.requestId === 'string' && taskRef.requestId.trim()
          ? taskRef.requestId.trim()
          : null,
      error:
        typeof taskRef.error === 'string' && taskRef.error.trim()
          ? taskRef.error.trim()
          : null,
      code:
        typeof taskRef.code === 'string' && taskRef.code.trim()
          ? taskRef.code.trim()
          : null,
      output:
        typeof taskRef.output === 'string' && taskRef.output.trim()
          ? taskRef.output.trim()
          : null,
      ...(taskRef.chunk !== undefined ? { chunk: taskRef.chunk } : {}),
      ...(taskRef.details !== undefined ? { details: taskRef.details } : {}),
    };
  }

  function setExternalEditingState(
    element: Element,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null {
    if (!element?.isConnected) return null;
    const meta = resolveElementTaskMeta(element);
    return upsertExternalEditingTaskState(meta, 'created', taskRef);
  }

  function setExternalEditingStateByElementKey(
    target: ExternalEditingElementTarget,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null {
    return upsertExternalEditingTaskState(target, 'created', taskRef);
  }

  function getExternalEditingTaskForElementKey(
    elementKey: WebEditorElementKey,
  ): ElementAgentTaskState | null {
    const task =
      state.externalEditingTaskByElementKey.get(elementKey)
      ?? state.agentTaskByElementKey.get(elementKey)
      ?? null;
    return task?.origin === 'external-editing' ? task : null;
  }

  function matchesExternalTaskRef(
    task: ElementAgentTaskState | null,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): boolean {
    const normalizedTaskRef = normalizeExternalTaskRef(taskRef);
    if (!normalizedTaskRef?.requestId) return true;
    if (!task?.requestId) return false;
    return task.requestId === normalizedTaskRef.requestId;
  }

  function clearExternalEditingState(
    element: Element,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): boolean {
    if (!element?.isConnected) return false;
    const meta = resolveElementTaskMeta(element);
    const persistedTask = getExternalEditingTaskForElementKey(meta.elementKey);
    if (!persistedTask || !matchesExternalTaskRef(persistedTask, taskRef)) {
      return false;
    }
    const deleted = state.externalEditingTaskByElementKey.delete(meta.elementKey);
    removeTaskStateByRequestId(persistedTask.requestId);
    if (deleted) {
      notifyTaskStateChange();
    }
    return deleted;
  }

  function clearExternalEditingStateByElementKey(
    elementKey: WebEditorElementKey,
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): boolean {
    const normalizedElementKey = String(elementKey || '').trim();
    if (!normalizedElementKey) return false;

    const existingTask = getExternalEditingTaskForElementKey(normalizedElementKey as WebEditorElementKey);
    if (!existingTask || !matchesExternalTaskRef(existingTask, taskRef)) {
      return false;
    }

    return Boolean(removeTaskStateByRequestId(existingTask.requestId));
  }

  function finalizeExternalEditingCompletedTask(
    task: ElementAgentTaskState,
    _element?: Element | null,
  ): void {
    if (task.origin !== 'external-editing') return;
    options.persistence.recordCommentTaskState?.(
      task.elementKey,
      'completed',
      task.taskRef ?? {
        provider: task.provider,
        sessionId: task.sessionId,
        requestId: task.requestId,
      },
    );
  }

  function setExternalEditingTerminalState(
    element: Element,
    terminalState: 'completed' | 'error',
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null {
    if (!element?.isConnected) return null;
    const meta = resolveElementTaskMeta(element);
    const existingTask = getExternalEditingTaskForElementKey(meta.elementKey);
    if (!matchesExternalTaskRef(existingTask, taskRef)) return null;
    const nextTask = upsertExternalEditingTaskState(meta, terminalState, taskRef);
    if (!nextTask) return null;

    if (terminalState === 'completed') {
      finalizeExternalEditingCompletedTask(nextTask, element);
    }

    return nextTask;
  }

  function setExternalEditingTerminalStateByElementKey(
    target: ExternalEditingElementTarget,
    terminalState: 'completed' | 'error',
    taskRef?: Partial<ExternalEditingTaskRef> | null,
  ): ElementAgentTaskState | null {
    const normalizedTarget = normalizeExternalEditingElementTarget(target);
    if (!normalizedTarget) return null;
    const existingTask = getExternalEditingTaskForElementKey(normalizedTarget.elementKey);
    if (!matchesExternalTaskRef(existingTask, taskRef)) return null;
    const nextTask = upsertExternalEditingTaskState(normalizedTarget, terminalState, taskRef);
    if (nextTask && terminalState === 'completed') {
      finalizeExternalEditingCompletedTask(nextTask);
    }
    return nextTask;
  }

  function hasRequiredConfig(): boolean {
    return (
      enabled
      && String(apiBaseUrl).trim().length > 0
      && String(integrationChannel).trim().length > 0
    );
  }

  function buildIntegrationTargetPayload(): { channel: string; targetClientId?: string } {
    const normalizedTargetClientId = normalizeString(targetClientId);
    return {
      channel: integrationChannel,
      ...(normalizedTargetClientId ? { targetClientId: normalizedTargetClientId } : {}),
    };
  }

  function hasAgentRunConfig(): boolean {
    return resolveConfiguredProvider().length > 0;
  }

  function assertBridgeConnected(): void {
    if (!hasRequiredConfig()) {
      throw new Error(AGENT_BRIDGE_CONFIG_ERROR);
    }

    if (!connected || !socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(AGENT_BRIDGE_NOT_CONNECTED_ERROR);
    }
  }

  function assertFrontendAvailable(): void {
    assertBridgeConnected();
    if (!available) {
      throw new Error(AGENT_PAGE_OFFLINE_MESSAGE);
    }
  }

  function assertAgentRunReady(): void {
    assertBridgeConnected();
    if (!hasAgentRunConfig()) {
      throw new Error(AGENT_EXECUTION_CONFIG_ERROR);
    }
  }

  function mapAgentStatePayloadToTask(payload: AgentStateSyncPayload): {
    taskStatus: ElementAgentTaskStatus;
    recovery: ElementAgentTaskRecovery;
    message: string;
  } {
    if (payload.isLoading) {
      const phaseMessages: Record<string, string> = {
        thinking: 'AI 正在分析',
        coding: '正在修改代码',
        reviewing: '正在检查修改',
        running: 'AI 正在执行',
        waiting: '等待 AI 响应',
      };
      return {
        taskStatus: 'created',
        recovery: 'snapshot',
        message: (payload.phase && phaseMessages[payload.phase]) || 'AI 正在修改',
      };
    }
    if (payload.phase === 'completed') {
      return {
        taskStatus: 'completed',
        recovery: 'snapshot',
        message: 'AI 修改完成',
      };
    }
    return {
      taskStatus: 'error',
      recovery: 'snapshot',
      message: payload.phase === 'aborted' ? '已中断' : 'AI 修改失败',
    };
  }

  function restoreActivePromptRunFromTask(task: ElementAgentTaskState): void {
    if (!isTaskRunning(task) || !task.requestId) return;
    activePromptRuns.set(task.requestId, {
      requestId: task.requestId,
      scopeKey: task.scopeKey,
      provider: task.provider,
      sessionId: task.sessionId,
      sessionPath: task.sessionPath,
      sessionUrl: task.sessionUrl,
      abortRequestId: null,
      interruptRequested: false,
      elementKey: task.elementKey,
      locator: task.locator,
      label: task.label,
    });
  }

  function buildStateSyncTargets(): Array<{
    sessionId: string;
    provider: string;
    taskRequestIds: string[];
  }> {
    const grouped = new Map<string, {
      sessionId: string;
      provider: string;
      taskRequestIds: string[];
    }>();
    for (const task of state.agentTaskByRequestId.values()) {
      if (
        task.dismissed
        || !isTaskRunning(task)
        || !task.recoveryPending
        || typeof task.sessionId !== 'string'
        || !task.sessionId.trim()
        || typeof task.provider !== 'string'
        || !task.provider.trim()
      ) {
        continue;
      }
      const sessionId = task.sessionId.trim();
      const provider = task.provider.trim();
      const key = `${provider}::${sessionId}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.taskRequestIds.push(task.requestId);
        continue;
      }
      grouped.set(key, {
        sessionId,
        provider,
        taskRequestIds: [task.requestId],
      });
    }
    return Array.from(grouped.values());
  }

  function sendStateQueries(): void {
    const targets = buildStateSyncTargets();
    if (targets.length === 0 || !socket || socket.readyState !== WebSocket.OPEN) {
      logInfo('Skipping Agent state sync query', {
        reason: targets.length === 0 ? 'no-running-tasks' : 'socket-not-open',
        runningTaskCount: targets.length,
      });
      return;
    }
    for (const target of targets) {
      const requestId = createRequestId('agent_state_query');
      logInfo('Sending Agent state sync query', {
        requestId,
        sessionId: target.sessionId,
        provider: target.provider,
        taskRequestIds: target.taskRequestIds,
      });
      sendSocketMessage({
        type: 'agent.state.query',
        requestId,
        payload: {
          sessionId: target.sessionId,
          provider: target.provider,
        },
      });
      const timeoutId = window.setTimeout(() => {
        const pendingTarget = stateQueryByRequestId.get(requestId);
        if (!pendingTarget) return;
        stateQueryByRequestId.delete(requestId);
        for (const taskRequestId of pendingTarget.taskRequestIds) {
          const removedTask = removeTaskStateByRequestId(taskRequestId);
          if (removedTask) {
            logWarn('Dropped restored Agent task after state sync timeout', {
              requestId: taskRequestId,
              sessionId: removedTask.sessionId,
              scopeKey: removedTask.scopeKey,
            });
            clearActivePromptRun(taskRequestId);
          }
        }
      }, AGENT_STATE_QUERY_TIMEOUT_MS);
      stateQueryByRequestId.set(requestId, {
        ...target,
        timeoutId,
      });
    }
  }

  function sendStateSubscribe(sessionId: string, provider: string): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      logWarn('Skipping Agent state subscribe because socket is not open', {
        sessionId,
        provider,
      });
      return;
    }
    const requestId = createRequestId('agent_state_subscribe');
    stateSubscribeByRequestId.set(requestId, {
      sessionId,
      provider,
    });
    sendSocketMessage({
      type: 'agent.state.subscribe',
      requestId,
      payload: {
        sessionId,
        provider,
      },
    });
    logInfo('Sending Agent state subscribe', {
      requestId,
      sessionId,
      provider,
    });
  }

  function updateTasksFromStateSyncPayload(
    payload: AgentStateSyncPayload,
    taskRequestIds?: string[],
  ): ElementAgentTaskState[] {
    const mapped = mapAgentStatePayloadToTask(payload);
    const canUpdateFromStateSync = (task: ElementAgentTaskState): boolean => {
      if (task.dismissed || task.sessionId !== payload.sessionId || task.provider !== payload.provider) {
        return false;
      }
      if (isTaskRunning(task)) {
        return true;
      }
      // Agent state is authoritative for a live session; a local timeout/error can arrive
      // before the Agent finishes and reports completion.
      return task.status === 'error' && mapped.taskStatus === 'completed';
    };
    const requestIds = taskRequestIds?.length
      ? taskRequestIds
      : Array.from(state.agentTaskByRequestId.values())
          .filter(canUpdateFromStateSync)
          .map((task) => task.requestId);
    const updatedTasks: ElementAgentTaskState[] = [];

    for (const requestId of requestIds) {
      const nextTask = updateTaskStateByRequestId(requestId, {
        provider: payload.provider,
        status: mapped.taskStatus,
        message: mapped.message,
        updatedAt: payload.updatedAt,
        recovery: mapped.recovery,
        recoveryPending: false,
        lastEventAt: payload.updatedAt,
        errorCode: payload.phase === 'aborted' ? 'GENIE_ABORTED' : null,
      }, {
        reviveDismissed: true,
      });
      if (!nextTask) continue;
      updatedTasks.push(nextTask);
      if (nextTask.origin === 'external-editing' && mapped.taskStatus === 'completed') {
        finalizeExternalEditingCompletedTask(nextTask);
      }
      if (mapped.taskStatus === 'pending' || mapped.taskStatus === 'created') {
        restoreActivePromptRunFromTask(nextTask);
      } else {
        clearActivePromptRun(nextTask.requestId);
      }
    }

    if (
      updatedTasks.some((task) => task.origin !== 'external-editing') &&
      (mapped.taskStatus === 'completed' || mapped.taskStatus === 'error')
    ) {
      options.persistence.flushPendingWrite('state');
    }

    logInfo('Applied Agent state sync payload', {
      sessionId: payload.sessionId,
      provider: payload.provider,
      phase: payload.phase,
      updatedAt: payload.updatedAt,
      matchedTaskCount: updatedTasks.length,
      matchedRequestIds: updatedTasks.map((task) => task.requestId),
    });

    return updatedTasks;
  }

  function invalidateConversationForTask(task: ElementAgentTaskState | null, errorCode: string | null): void {
    if (!task) return;
    if (!errorCode || !AGENT_SESSION_NOT_FOUND_CODES.has(errorCode)) {
      return;
    }
    const conversation = getConversationState(task.scopeKey);
    if (!conversation?.sessionId) {
      return;
    }
    setConversationState(task.scopeKey, {
      ...conversation,
      invalidated: true,
    });
  }

  function invalidateConversationScope(scopeKey: string | null | undefined): void {
    const normalizedScopeKey = String(scopeKey ?? '').trim();
    if (!normalizedScopeKey) return;
    const conversation = getConversationState(normalizedScopeKey);
    if (!conversation?.sessionId) {
      return;
    }
    setConversationState(normalizedScopeKey, {
      ...conversation,
      invalidated: true,
    });
  }

  function persistTaskElementStates(
    requestId: string,
    source: 'accepted_reused_session' | 'session_created',
  ): void {
    const tasks = getTaskStatesByRequestId(requestId);
    if (tasks.length === 0) return;
    options.persistence.flushPendingWrite('state');
    logInfo('Persisted element task states after Agent handoff', { source, requestId });
  }

  function rehydratePersistedAgentState(): void {
    const scopeKey = resolveScopeKey();
    const lookupKeys = resolveConversationLookupKeys();
    let persistedConversation: PageAgentConversationState | null = null;
    let restoredConversationScopeKey: string | null = null;
    for (const candidateScopeKey of lookupKeys) {
      const candidateConversation = options.persistence.readAgentConversationState(candidateScopeKey);
      if (!candidateConversation) continue;
      persistedConversation = candidateConversation;
      restoredConversationScopeKey = candidateScopeKey;
      break;
    }
    if (persistedConversation) {
      setConversationState(scopeKey, {
        ...persistedConversation,
        scopeKey,
      });
      for (const candidateScopeKey of lookupKeys) {
        if (candidateScopeKey !== scopeKey && candidateScopeKey === restoredConversationScopeKey) {
          options.persistence.clearAgentConversationState(candidateScopeKey);
        }
      }
      logInfo('Restored persisted Agent conversation', {
        scopeKey,
        sessionId: persistedConversation.sessionId,
        provider: persistedConversation.provider,
        sentCount: persistedConversation.sentCount,
        expiresAt: persistedConversation.expiresAt,
        invalidated: persistedConversation.invalidated,
      });
    } else {
      logInfo('No persisted Agent conversation found', { scopeKey });
    }

    for (const candidateScopeKey of lookupKeys) {
      options.persistence.pruneExpiredAgentTaskStates(candidateScopeKey);
    }
    let persistedTasks: PersistedElementAgentTaskState[] = [];
    for (const candidateScopeKey of lookupKeys) {
      const candidateTasks = options.persistence.readAgentTaskStates(candidateScopeKey);
      if (candidateTasks.length === 0) continue;
      persistedTasks = candidateTasks;
      break;
    }
    logInfo('Read persisted Agent task states', {
      scopeKey,
      count: persistedTasks.length,
      items: persistedTasks.map((task) => ({
        requestId: task.requestId,
        sessionId: task.sessionId,
        provider: task.provider,
        status: task.status,
      })),
    });
    for (const persistedTask of persistedTasks) {
      const isExternalEditing = persistedTask.origin === 'external-editing';

      if (isExternalEditing) {
        logInfo('Skipping legacy external-editing task restore', {
          requestId: persistedTask.requestId,
          elementKey: persistedTask.elementKey,
        });
        continue;
      }

      // For non-external tasks, require running + sessionId + provider
      if (!isExternalEditing) {
        if (
          !isTaskRunning(persistedTask)
          || typeof persistedTask.sessionId !== 'string'
          || persistedTask.sessionId.trim().length === 0
          || typeof persistedTask.provider !== 'string'
          || persistedTask.provider.trim().length === 0
        ) {
          logWarn('Skipping persisted Agent task restore', {
            requestId: persistedTask.requestId,
            sessionId: persistedTask.sessionId,
            provider: persistedTask.provider,
            status: persistedTask.status,
            reason: 'task-not-running-or-missing-session',
          });
          continue;
        }
      }

      let elementKey = persistedTask.elementKey;
      let locator = persistedTask.locator;
      let label = persistedTask.label;
      try {
        const restoredElement = locateElement(persistedTask.locator);
        if (restoredElement?.isConnected) {
          const restoredMeta = resolveElementTaskMeta(restoredElement);
          elementKey = restoredMeta.elementKey;
          locator = restoredMeta.locator;
          label = restoredMeta.label;
        }
      } catch {
        // Ignore stale locators and keep the persisted locator as a fallback.
      }
      const shouldVerifyExternalEditingTask = Boolean(
        isExternalEditing
        && isTaskRunning(persistedTask)
        && typeof persistedTask.sessionId === 'string'
        && persistedTask.sessionId.trim().length > 0
        && typeof persistedTask.provider === 'string'
        && persistedTask.provider.trim().length > 0,
      );
      const task: ElementAgentTaskState = {
        ...persistedTask,
        scopeKey: isExternalEditing ? resolveExternalEditingScopeKey() : scopeKey,
        elementKey,
        locator,
        label,
        recovery: 'storage',
        recoveryPending: isExternalEditing
          ? shouldVerifyExternalEditingTask
          : isTaskRunning(persistedTask),
      };
      upsertTaskState(task);

      // Populate the external editing secondary index
      if (isExternalEditing) {
        state.externalEditingTaskByElementKey.set(elementKey, task);
      }

      if (isTaskRunning(task) && !isExternalEditing) {
        restoreActivePromptRunFromTask(task);
      }
      logInfo('Restored persisted Agent task', {
        requestId: task.requestId,
        sessionId: task.sessionId,
        provider: task.provider,
        status: task.status,
        recoveryPending: task.recoveryPending,
        elementKey: task.elementKey,
        origin: task.origin,
      });
    }

    // Schedule cleanup of unverified recovery-pending tasks after 30s.
    // If Agent Bridge socket is never connected, these would otherwise persist forever.
    const RECOVERY_PENDING_STALENESS_MS = 30_000;
    const recoveryPendingRequestIds = Array.from(state.agentTaskByElementKey.values())
      .filter((task) => task.recoveryPending)
      .map((task) => task.requestId);
    if (recoveryPendingRequestIds.length > 0) {
      window.setTimeout(() => {
        for (const requestId of recoveryPendingRequestIds) {
          const current = getTaskStateByRequestId(requestId);
          if (current?.recoveryPending) {
            removeTaskStateByRequestId(requestId);
            clearActivePromptRun(requestId);
            logWarn('Purged stale recovery-pending task', {
              requestId,
              elementKey: current.elementKey,
            });
          }
        }
      }, RECOVERY_PENDING_STALENESS_MS);
    }
  }

  function discardDeletedElementStates(elementKeys: readonly WebEditorElementKey[]): void {
    const deletedKeys = new Set(elementKeys.map((key) => String(key ?? '').trim()).filter(Boolean));
    if (deletedKeys.size === 0) return;

    for (const key of deletedKeys) {
      state.agentTaskByElementKey.delete(key);
      state.externalEditingTaskByElementKey.delete(key);
    }
    for (const [requestId, task] of state.agentTaskByRequestId) {
      if (deletedKeys.has(String(task.elementKey ?? '').trim())) {
        state.agentTaskByRequestId.delete(requestId);
      }
    }
    options.persistence.discardAgentTaskStates(
      resolveConversationLookupKeys(),
      [...deletedKeys] as WebEditorElementKey[],
    );
  }

  function clearProbeTimeout(): void {
    if (probeTimeoutId === null) return;
    window.clearTimeout(probeTimeoutId);
    probeTimeoutId = null;
  }

  function clearProbeRetryTimer(): void {
    if (probeRetryTimerId === null) return;
    window.clearTimeout(probeRetryTimerId);
    probeRetryTimerId = null;
  }

  function clearReconnectTimer(): void {
    if (reconnectTimerId === null) return;
    window.clearTimeout(reconnectTimerId);
    reconnectTimerId = null;
  }

  function handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible' || !active || !hasRequiredConfig()) return;

    clearReconnectTimer();
    reconnectAttemptCount = 0;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      if (socket) {
        const staleSocket = socket;
        socket = null;
        staleSocket.onopen = null;
        staleSocket.onmessage = null;
        staleSocket.onerror = null;
        staleSocket.onclose = null;
        try {
          staleSocket.close();
        } catch {
          // Ignore close failures while recovering from a backgrounded tab.
        }
      }
      connectSocket();
      return;
    }

    if (!available && probeOnStart && !probeRequestId) {
      void probeFrontendPresence();
    }
    sendStateQueries();
  }

  function installVisibilityListener(): void {
    if (typeof document === 'undefined' || visibilityCleanup) return;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityCleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      visibilityCleanup = null;
    };
  }

  function removeVisibilityListener(): void {
    visibilityCleanup?.();
  }

  function clearPendingRequest(requestId: string): void {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingRequests.delete(requestId);
  }

  function resetLinkedAbortRequest(requestId: string, pending: PendingRequest): void {
    if (pending.kind !== 'agent-abort' || !pending.linkedRunRequestId) return;
    const currentRun = activePromptRuns.get(pending.linkedRunRequestId) ?? null;
    if (currentRun?.abortRequestId !== requestId) return;
    updateActivePromptRun(pending.linkedRunRequestId, {
      abortRequestId: null,
      interruptRequested: false,
    });
  }

  function rejectPendingRequest(requestId: string, error: string | AgentBridgeError, code?: unknown): void {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingRequests.delete(requestId);
    resetLinkedAbortRequest(requestId, pending);
    if (code === 'FRONTEND_NOT_ONLINE') {
      notifyAvailability(false);
    }
    pending.reject(typeof error === 'string' ? createBridgeError(error) : error);
  }

  function resolvePendingRequest(requestId: string): void {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingRequests.delete(requestId);
    pending.resolve();
  }

  function rejectAllPendingRequests(message: string): void {
    for (const [requestId, pending] of pendingRequests.entries()) {
      window.clearTimeout(pending.timeoutId);
      resetLinkedAbortRequest(requestId, pending);
      pending.reject(createBridgeError(message));
      pendingRequests.delete(requestId);
    }
  }

  function createPendingRequest(
    requestId: string,
    timeoutMs: number,
    kind: PendingRequest['kind'],
    timeoutMessage = '等待 AI 响应超时，请稍后重试。',
    metadata: Pick<PendingRequest, 'linkedRunRequestId'> = {},
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const pending = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        if (pending) {
          resetLinkedAbortRequest(requestId, pending);
        }
        if (kind === 'agent-run') {
          const timedOutRun = clearActivePromptRun(requestId);
          updateTerminalTaskState(requestId, timedOutRun, {
            status: 'error',
            message: timeoutMessage,
            errorCode: 'GENIE_TIMEOUT',
          });
        }
        reject(createBridgeError(timeoutMessage));
      }, timeoutMs);
      pendingRequests.set(requestId, {
        kind,
        resolve,
        reject,
        timeoutId,
        timeoutMessage,
        ...metadata,
      });
    });
  }

  function sendSocketMessage(message: Record<string, unknown>): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(AGENT_BRIDGE_NOT_CONNECTED_ERROR);
    }
    logDebug('Sending WS message', message);
    socket.send(JSON.stringify(message));
  }

  function scheduleReconnect(): void {
    if (!active || !hasRequiredConfig() || reconnectTimerId !== null) return;
    if (reconnectAttemptCount >= AGENT_MAX_RECONNECT_ATTEMPTS) {
      logWarn('Reconnect aborted: retry limit reached', {
        attempts: reconnectAttemptCount,
        maxAttempts: AGENT_MAX_RECONNECT_ATTEMPTS,
        integrationChannel,
        targetClientId,
      });
      return;
    }
    reconnectAttemptCount += 1;
    logInfo('Scheduling reconnect', {
      attempt: reconnectAttemptCount,
      maxAttempts: AGENT_MAX_RECONNECT_ATTEMPTS,
      delayMs: AGENT_RECONNECT_DELAY_MS,
      integrationChannel,
      targetClientId,
    });
    reconnectTimerId = window.setTimeout(() => {
      reconnectTimerId = null;
      connectSocket();
    }, AGENT_RECONNECT_DELAY_MS);
  }

  function resetProbeRetries(): void {
    probeAttemptCount = 0;
    clearProbeRetryTimer();
  }

  function scheduleProbeRetry(reason: string): void {
    if (!active || !hasRequiredConfig() || probeRetryTimerId !== null) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (probeAttemptCount >= AGENT_MAX_PROBE_ATTEMPTS) {
      logWarn('Probe retry aborted: retry limit reached', {
        reason,
        attempts: probeAttemptCount,
        maxAttempts: AGENT_MAX_PROBE_ATTEMPTS,
        integrationChannel,
        targetClientId,
      });
      return;
    }

    probeAttemptCount += 1;
    logInfo('Scheduling availability probe retry', {
      reason,
      attempt: probeAttemptCount,
      maxAttempts: AGENT_MAX_PROBE_ATTEMPTS,
      delayMs: AGENT_PROBE_RETRY_DELAY_MS,
      integrationChannel,
      targetClientId,
    });
    probeRetryTimerId = window.setTimeout(() => {
      probeRetryTimerId = null;
      void refreshOnlineFrontendTarget(reason)
        .catch(() => false)
        .then(() => {
          void probeFrontendPresence();
        });
    }, AGENT_PROBE_RETRY_DELAY_MS);
  }

  function handleSocketClose(currentSocket: WebSocket): void {
    if (socket !== currentSocket) return;
    logWarn('Socket closed', {
      integrationChannel,
      targetClientId,
    });
    socket = null;
    connectRequestId = null;
    probeRequestId = null;
    for (const { timeoutId } of stateQueryByRequestId.values()) {
      window.clearTimeout(timeoutId);
    }
    stateQueryByRequestId.clear();
    stateSubscribeByRequestId.clear();
    activitySubscribeByRequestId.clear();
    activityUnsubscribeByRequestId.clear();
    pendingAssistantActivities.clear();
    clearProbeTimeout();
    clearProbeRetryTimer();
    notifyConnected(false);
    notifyAvailability(false);
    for (const requestId of Array.from(activePromptRuns.keys())) {
      const currentTask = getTaskStateByRequestId(requestId);
      if (!currentTask || !isTaskRunning(currentTask)) {
        continue;
      }
      updateTaskStateByRequestId(requestId, {
        recoveryPending: true,
        recovery: 'storage',
        updatedAt: Date.now(),
      });
    }
    setActivePromptRun(null);
    rejectAllPendingRequests('AI 连接已断开，请稍后重试。');
    scheduleReconnect();
  }

  function sendSessionActivitySubscribe(target: Required<SessionActivityTarget>): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const requestId = createRequestId('session_activity_subscribe');
    activitySubscribeByRequestId.set(requestId, buildSessionActivityTargetKey(target));
    sendSocketMessage({
      type: 'session.activity.subscribe',
      requestId,
      payload: {
        ...(target.sessionId ? { sessionId: target.sessionId } : {}),
        ...(target.provider ? { provider: target.provider } : {}),
        ...(target.requestId ? { requestId: target.requestId } : {}),
      },
    });
  }

  function sendSessionActivityUnsubscribe(target: Required<SessionActivityTarget>): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const requestId = createRequestId('session_activity_unsubscribe');
    activityUnsubscribeByRequestId.set(requestId, buildSessionActivityTargetKey(target));
    sendSocketMessage({
      type: 'session.activity.unsubscribe',
      requestId,
      payload: {
        ...(target.sessionId ? { sessionId: target.sessionId } : {}),
        ...(target.provider ? { provider: target.provider } : {}),
        ...(target.requestId ? { requestId: target.requestId } : {}),
      },
    });
  }

  function syncSessionActivitySubscriptions(): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    for (const { target } of activitySubscriptionCounts.values()) {
      sendSessionActivitySubscribe(target);
    }
  }

  function resolveSubscribedSessionActivityTarget(
    target: Required<SessionActivityTarget>,
  ): Required<SessionActivityTarget> {
    if (target.sessionId && target.provider) {
      return target;
    }
    if (!target.requestId) {
      return target;
    }

    const activeRun = activePromptRuns.get(target.requestId) ?? null;
    const task = getTaskStateByRequestId(target.requestId);
    const sessionId = activeRun?.sessionId ?? task?.sessionId ?? null;
    const provider = activeRun?.provider ?? task?.provider ?? null;
    if (!sessionId || !provider) {
      return target;
    }

    return {
      sessionId,
      provider,
      requestId: target.requestId,
    };
  }

  function dispatchSessionActivity(item: SessionActivityItem): void {
    for (const subscriber of activitySubscribers.values()) {
      const resolvedTarget = resolveSubscribedSessionActivityTarget(subscriber.target);
      if (!matchesSessionActivityTarget(resolvedTarget, item)) {
        continue;
      }
      subscriber.listener(item);
    }
  }

  function handleSocketMessage(event: MessageEvent<string>): void {
    let parsed: AgentWsMessage | null = null;
    try {
      parsed = JSON.parse(event.data) as AgentWsMessage;
    } catch {
      logWarn('Received non-JSON WS message', event.data);
      return;
    }

    if (!parsed?.type) return;
    logDebug('Received WS message', parsed);

    if (parsed.type === 'integration.connected') {
      reconnectAttemptCount = 0;
      resetProbeRetries();
      notifyConnected(true);
      logInfo('Integration handshake completed', {
        requestId: parsed.requestId,
        integrationChannel,
        targetClientId,
      });
      if (parsed.requestId === connectRequestId && probeOnStart) {
        void probeFrontendPresence();
      }
      sendStateQueries();
      syncSessionActivitySubscriptions();
      return;
    }

    if (parsed.type === 'integration.pong') {
      if (parsed.requestId !== probeRequestId) return;
      probeRequestId = null;
      clearProbeTimeout();
      const frontendClients = readFrontendClients(parsed);
      if (!targetClientId) {
        const matchedClient = pickFrontendClientForContext(frontendClients, buildAgentContext(null));
        if (matchedClient?.clientId) {
          applyResolvedBridgeConfig({ targetClientId: matchedClient.clientId });
        }
      }
      const frontendConnected = readFrontendConnected(parsed, targetClientId);
      logInfo('Probe completed', {
        requestId: parsed.requestId,
        frontendConnected,
        integrationChannel,
        targetClientId,
      });
      notifyAvailability(frontendConnected);
      if (frontendConnected) {
        resetProbeRetries();
      } else {
        scheduleProbeRetry('frontend_offline');
      }
      return;
    }

    if (parsed.type === 'integration.presence') {
      const payload = parsed.payload;
      const normalizedTargetClientId = normalizeString(targetClientId);
      const payloadClientId = normalizeString(payload?.clientId);
      if (
        !payload
        || payload.channel !== integrationChannel
        || (normalizedTargetClientId && payloadClientId !== normalizedTargetClientId)
      ) {
        return;
      }
      if (payload.event === 'frontend-online') {
        logInfo('Presence update: frontend online', payload);
        probeRequestId = null;
        clearProbeTimeout();
        resetProbeRetries();
        notifyAvailability(true);
      } else if (payload.event === 'frontend-offline') {
        logInfo('Presence update: frontend offline', payload);
        if (normalizedTargetClientId) {
          notifyAvailability(false);
        } else {
          void probeFrontendPresence();
        }
      }
      return;
    }

    if (parsed.type === 'integration.ack' && parsed.requestId) {
      logInfo('Context update acknowledged', {
        requestId: parsed.requestId,
        payload: parsed.payload,
      });
      resolvePendingRequest(parsed.requestId);
      return;
    }

    if (parsed.type === 'session.activity.subscribed' && parsed.requestId) {
      activitySubscribeByRequestId.delete(parsed.requestId);
      return;
    }

    if (parsed.type === 'session.activity.unsubscribed' && parsed.requestId) {
      activityUnsubscribeByRequestId.delete(parsed.requestId);
      return;
    }

    if (parsed.type === 'session.activity.event') {
      const activity = parseSessionActivityItem(parsed.payload);
      if (!activity) return;
      dispatchSessionActivity(activity);
      return;
    }

    if (parsed.type === 'agent.event') {
      const activity = parseSessionActivityItemFromAgentEvent({
        requestId: parsed.requestId,
        provider: parsed.provider,
        sessionId: parsed.sessionId,
        event: parsed.event,
        assistantBuffers: pendingAssistantActivities,
      });
      if (activity) {
        dispatchSessionActivity(activity);
      }
    }

    if (parsed.type === 'agent.state.snapshot' && parsed.requestId) {
      const queryTarget = stateQueryByRequestId.get(parsed.requestId);
      if (!queryTarget) return;
      window.clearTimeout(queryTarget.timeoutId);
      stateQueryByRequestId.delete(parsed.requestId);
      const snapshot = parseAgentStateSyncPayload(parsed.payload);
      if (!snapshot) return;
      logInfo('Received Agent state snapshot', {
        requestId: parsed.requestId,
        querySessionId: queryTarget.sessionId,
        queryProvider: queryTarget.provider,
        taskRequestIds: queryTarget.taskRequestIds,
        snapshot,
      });
      updateTasksFromStateSyncPayload(snapshot, queryTarget.taskRequestIds);
      if (snapshot.isLoading) {
        sendStateSubscribe(queryTarget.sessionId, queryTarget.provider);
      }
      return;
    }

    if (parsed.type === 'agent.state.subscribed' && parsed.requestId) {
      if (!stateSubscribeByRequestId.has(parsed.requestId)) return;
      logInfo('Agent state subscribe acknowledged', {
        requestId: parsed.requestId,
      });
      stateSubscribeByRequestId.delete(parsed.requestId);
      return;
    }

    if (parsed.type === 'agent.state.changed') {
      const snapshot = parseAgentStateSyncPayload(parsed.payload);
      if (!snapshot) return;
      logInfo('Received Agent state change', snapshot);
      updateTasksFromStateSyncPayload(snapshot);
      return;
    }

    if (parsed.type === 'agent.error' && parsed.requestId) {
      if (activitySubscribeByRequestId.has(parsed.requestId)) {
        activitySubscribeByRequestId.delete(parsed.requestId);
        return;
      }

      if (activityUnsubscribeByRequestId.has(parsed.requestId)) {
        activityUnsubscribeByRequestId.delete(parsed.requestId);
        return;
      }

      const stateQueryTarget = stateQueryByRequestId.get(parsed.requestId);
      if (stateQueryTarget) {
        window.clearTimeout(stateQueryTarget.timeoutId);
        stateQueryByRequestId.delete(parsed.requestId);
        logWarn('State sync query rejected by Agent', {
          requestId: parsed.requestId,
          sessionId: stateQueryTarget.sessionId,
          provider: stateQueryTarget.provider,
          error: parsed.error,
          errorCode: readAgentErrorCode(parsed),
        });
        for (const taskRequestId of stateQueryTarget.taskRequestIds) {
          const removedTask = removeTaskStateByRequestId(taskRequestId);
          if (!removedTask) continue;
          clearActivePromptRun(taskRequestId);
        }
        return;
      }

      const stateSubscribeTarget = stateSubscribeByRequestId.get(parsed.requestId);
      if (stateSubscribeTarget) {
        stateSubscribeByRequestId.delete(parsed.requestId);
        logWarn('State sync subscribe rejected by Agent', {
          requestId: parsed.requestId,
          sessionId: stateSubscribeTarget.sessionId,
          provider: stateSubscribeTarget.provider,
          error: parsed.error,
          errorCode: readAgentErrorCode(parsed),
        });
        return;
      }
    }

    const pending = parsed.requestId ? pendingRequests.get(parsed.requestId) : undefined;
    if (parsed.type === 'agent.accepted' && pending?.kind === 'agent-run') {
      const currentRun = updateActivePromptRun(parsed.requestId ?? '', {
        provider:
          typeof parsed.provider === 'string' && parsed.provider.trim()
            ? parsed.provider
            : activePromptRuns.get(parsed.requestId ?? '')?.provider ?? resolveConfiguredProvider(),
      });
      updateTaskStateByRequestId(parsed.requestId ?? '', {
        status: 'pending',
        provider: currentRun?.provider ?? resolveConfiguredProvider(),
        message: 'AI 准备中',
        recovery: 'live',
        recoveryPending: false,
        lastEventAt: Date.now(),
        errorCode: null,
      }, {
        reviveDismissed: true,
      });
      if (currentRun?.sessionId) {
        persistTaskElementStates(parsed.requestId ?? '', 'accepted_reused_session');
      }
      if (!pending.acceptedNotified) {
        pending.acceptedNotified = true;
      }
      return;
    }

    if (parsed.type === 'agent.session.created' && pending?.kind === 'agent-run') {
      if (!projectPath) {
        projectPath = readProjectPathFromAgentMessage(parsed);
      }
      const currentRun = updateActivePromptRun(parsed.requestId ?? '', {
        provider:
          typeof parsed.provider === 'string' && parsed.provider.trim()
            ? parsed.provider
            : activePromptRuns.get(parsed.requestId ?? '')?.provider ?? resolveConfiguredProvider(),
        sessionId:
          typeof parsed.sessionId === 'string' && parsed.sessionId.trim() ? parsed.sessionId : null,
        sessionPath:
          typeof parsed.sessionPath === 'string' && parsed.sessionPath.trim()
            ? parsed.sessionPath
            : null,
        sessionUrl:
          typeof parsed.sessionUrl === 'string' && parsed.sessionUrl.trim()
            ? parsed.sessionUrl
            : null,
      });
      updateTaskStateByRequestId(parsed.requestId ?? '', {
        status: 'created',
        provider: currentRun?.provider ?? resolveConfiguredProvider(),
        sessionId: currentRun?.sessionId ?? null,
        sessionPath: currentRun?.sessionPath ?? null,
        sessionUrl: currentRun?.sessionUrl ?? null,
        message: 'AI 正在修改',
        recovery: 'live',
        recoveryPending: false,
        lastEventAt: Date.now(),
        errorCode: null,
      }, {
        reviveDismissed: true,
      });
      if (currentRun?.scopeKey && currentRun.sessionId) {
        upsertConversationState(currentRun.scopeKey, {
          sessionId: currentRun.sessionId,
          provider: currentRun.provider,
          projectPath,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          sentCount: Math.max(1, getConversationState(currentRun.scopeKey)?.sentCount ?? 0),
          sessionPath: currentRun.sessionPath,
          sessionUrl: currentRun.sessionUrl,
          invalidated: false,
        });
      }
      persistTaskElementStates(parsed.requestId ?? '', 'session_created');
      if (!pending.sessionCreatedNotified) {
        pending.sessionCreatedNotified = true;
      }
      return;
    }

    if (parsed.type === 'agent.completed' && pending?.kind === 'agent-run' && parsed.requestId) {
      if (!projectPath) {
        projectPath = readProjectPathFromAgentMessage(parsed);
      }
      const currentRun = clearActivePromptRun(parsed.requestId);
      const completedTask = updateTerminalTaskState(parsed.requestId, currentRun, {
        status: 'completed',
        sessionId:
          typeof parsed.sessionId === 'string' && parsed.sessionId.trim()
            ? parsed.sessionId
            : typeof parsed.result?.sessionId === 'string' && parsed.result.sessionId.trim()
              ? parsed.result.sessionId
              : currentRun?.sessionId ?? null,
        sessionPath:
          typeof parsed.sessionPath === 'string' && parsed.sessionPath.trim()
            ? parsed.sessionPath
            : typeof parsed.result?.sessionPath === 'string' && parsed.result.sessionPath.trim()
              ? parsed.result.sessionPath
              : currentRun?.sessionPath ?? null,
        sessionUrl:
          typeof parsed.sessionUrl === 'string' && parsed.sessionUrl.trim()
            ? parsed.sessionUrl
            : typeof parsed.result?.sessionUrl === 'string' && parsed.result.sessionUrl.trim()
              ? parsed.result.sessionUrl
              : currentRun?.sessionUrl ?? null,
        provider: parsed.provider,
        message: 'AI 修改完成',
        errorCode: null,
      });
      if (currentRun?.scopeKey && completedTask?.sessionId) {
        upsertConversationState(currentRun.scopeKey, {
          sessionId: completedTask.sessionId,
          provider: completedTask.provider,
          projectPath,
          createdAt: getConversationState(currentRun.scopeKey)?.createdAt ?? completedTask.startedAt,
          lastUsedAt: Date.now(),
          sentCount: Math.max(1, getConversationState(currentRun.scopeKey)?.sentCount ?? 0),
          sessionPath: completedTask.sessionPath,
          sessionUrl: completedTask.sessionUrl,
          invalidated: false,
        });
      }
      options.feedback.toast('success', 'AI 已完成执行');
      resolvePendingRequest(parsed.requestId);
      return;
    }

    if (parsed.type === 'agent.aborted' && pending?.kind === 'agent-run' && parsed.requestId) {
      const currentRun = clearActivePromptRun(parsed.requestId);
      const interruptedByUser = Boolean(currentRun?.interruptRequested);
      const abortRequestId = currentRun?.abortRequestId;
      const abortedTask = updateTerminalTaskState(parsed.requestId, currentRun, {
        status: 'error',
        sessionId: parsed.sessionId,
        message: '已中断',
        errorCode: 'GENIE_ABORTED',
      });
      invalidateConversationForTask(abortedTask, null);
      invalidateConversationScope(currentRun?.scopeKey ?? abortedTask?.scopeKey ?? null);
      if (abortRequestId) {
        resolvePendingRequest(abortRequestId);
      }
      rejectPendingRequest(
        parsed.requestId,
        interruptedByUser
          ? createBridgeError('AI 任务已中断。', {
              code: 'GENIE_ABORTED',
              silentToast: true,
            })
          : 'AI 任务已中断。',
      );
      return;
    }

    if (parsed.type === 'agent.error' && pending?.kind === 'agent-run' && parsed.requestId) {
      const currentRun = clearActivePromptRun(parsed.requestId);
      const errorCode = readAgentErrorCode(parsed);
      const erroredTask = updateTerminalTaskState(parsed.requestId, currentRun, {
        status: 'error',
        provider: parsed.provider,
        sessionId: parsed.sessionId,
        message: mapAgentErrorMessage(parsed.error),
        errorCode,
      });
      invalidateConversationForTask(erroredTask, errorCode);
      rejectPendingRequest(parsed.requestId, mapAgentErrorMessage(parsed.error));
      return;
    }

    if (parsed.type === 'agent.aborted' && pending?.kind === 'agent-abort' && parsed.requestId) {
      const linkedRunRequestId = pending.linkedRunRequestId;
      const linkedRun = linkedRunRequestId ? clearActivePromptRun(linkedRunRequestId) : null;
      resolvePendingRequest(parsed.requestId);
      if (linkedRun) {
        options.feedback.toast('info', '已中断 AI 执行');
      }
      if (linkedRunRequestId) {
        const abortedTask = updateTerminalTaskState(linkedRunRequestId, linkedRun, {
          status: 'error',
          sessionId: parsed.sessionId,
          message: '已中断',
          errorCode: 'GENIE_ABORTED',
        });
        invalidateConversationScope(linkedRun?.scopeKey ?? abortedTask?.scopeKey ?? null);
        rejectPendingRequest(
          linkedRunRequestId,
          createBridgeError('AI 任务已中断。', {
            code: 'GENIE_ABORTED',
            silentToast: true,
          }),
        );
      }
      return;
    }

    if (parsed.type === 'agent.error' && pending?.kind === 'agent-abort' && parsed.requestId) {
      const linkedRunRequestId = pending.linkedRunRequestId;
      if (linkedRunRequestId) {
        updateActivePromptRun(linkedRunRequestId, {
          abortRequestId: null,
          interruptRequested: false,
        });
      }
      rejectPendingRequest(parsed.requestId, mapAgentErrorMessage(parsed.error));
      return;
    }

    if (parsed.type === 'integration.error') {
      const payload = parsed.payload;
      const message = mapIntegrationErrorMessage(payload?.code, payload?.message);
      logWarn('Received integration error', {
        requestId: parsed.requestId,
        code: payload?.code,
        message,
        payload,
      });

      if (parsed.requestId === probeRequestId) {
        probeRequestId = null;
        clearProbeTimeout();
        notifyAvailability(false);
        scheduleProbeRetry(String(payload?.code ?? 'integration_error'));
      }

      if (parsed.requestId) {
        rejectPendingRequest(parsed.requestId, message, payload?.code);
      }
    }
  }

  function connectSocket(): void {
    if (!active || !hasRequiredConfig() || socket) return;

    let nextSocket: WebSocket;
    try {
      const wsUrl = buildAgentWsUrl(apiBaseUrl, apiKey);
      logInfo('Opening Agent bridge socket', {
        wsUrl,
        integrationChannel,
        targetClientId,
        externalClientId,
      });
      nextSocket = new WebSocket(wsUrl);
    } catch (error) {
      notifyAvailability(false);
      scheduleReconnect();
      logWarn('Failed to create Agent bridge socket', error);
      return;
    }

    socket = nextSocket;
    nextSocket.onopen = () => {
      if (socket !== nextSocket) return;
      logInfo('Socket opened', {
        integrationChannel,
        targetClientId,
      });
      clearReconnectTimer();
      reconnectAttemptCount = 0;
      connectRequestId = createRequestId('agent_connect');
      try {
        sendSocketMessage({
          type: 'integration.connect',
          requestId: connectRequestId,
          payload: {
            role: 'external-client',
            channel: integrationChannel,
            clientId: externalClientId,
            capabilities: ['presence.query', 'context.push', 'prompt.push'],
          },
        });
      } catch (error) {
        logWarn('Failed to send integration.connect', error);
        nextSocket.close();
      }
    };
    nextSocket.onmessage = handleSocketMessage;
    nextSocket.onerror = () => {
      logWarn('Socket error', {
        integrationChannel,
        targetClientId,
      });
      notifyConnected(false);
      notifyAvailability(false);
    };
    nextSocket.onclose = () => {
      handleSocketClose(nextSocket);
    };
  }

  async function probeFrontendPresence(): Promise<void> {
    if (!active || !hasRequiredConfig()) return;

    const requestId = createRequestId('agent_probe');
    const timeoutMs = getTimeoutMs(probeTimeoutMs, AGENT_CONTEXT_REQUEST_TIMEOUT_MS);

    probeRequestId = requestId;
    clearProbeTimeout();

    try {
      logInfo('Sending availability probe', {
        requestId,
        timeoutMs,
        integrationChannel,
        targetClientId,
      });
      sendSocketMessage({
        type: 'integration.ping',
        requestId,
        payload: buildIntegrationTargetPayload(),
      });
    } catch (error) {
      logWarn('Failed to send availability probe', error);
      probeRequestId = null;
      notifyAvailability(false);
      scheduleProbeRetry('send_failed');
      return;
    }

    probeTimeoutId = window.setTimeout(() => {
      if (probeRequestId !== requestId) return;
      logWarn('Availability probe timed out', {
        requestId,
        timeoutMs,
        integrationChannel,
        targetClientId,
      });
      probeRequestId = null;
      notifyAvailability(false);
      scheduleProbeRetry('timeout');
    }, timeoutMs);
  }

  function stop(): void {
    logInfo('Stopping Agent bridge service');
    active = false;
    bridgeDiscoveryPromise = null;
    removeVisibilityListener();
    clearReconnectTimer();
    clearProbeTimeout();
    clearProbeRetryTimer();
    probeRequestId = null;
    connectRequestId = null;
    for (const timeoutId of completedTaskDismissTimerByRequestId.values()) {
      window.clearTimeout(timeoutId);
    }
    completedTaskDismissTimerByRequestId.clear();
    for (const timeoutId of externalEditingTimeoutTimerByElementKey.values()) {
      window.clearTimeout(timeoutId);
    }
    externalEditingTimeoutTimerByElementKey.clear();
    for (const { timeoutId } of stateQueryByRequestId.values()) {
      window.clearTimeout(timeoutId);
    }
    stateQueryByRequestId.clear();
    stateSubscribeByRequestId.clear();
    activitySubscribeByRequestId.clear();
    activityUnsubscribeByRequestId.clear();
    pendingAssistantActivities.clear();
    reconnectAttemptCount = 0;
    probeAttemptCount = 0;
    rejectAllPendingRequests('AI 连接已停止。');
    setActivePromptRun(null);

    const currentSocket = socket;
    socket = null;
    if (currentSocket) {
      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      currentSocket.close();
    }

    notifyConnected(false);
    notifyAvailability(false);
  }

  function prepareBridgeStart(): void {
    notifyConnected(false);
    notifyAvailability(false);
    stateQueryByRequestId.clear();
    stateSubscribeByRequestId.clear();
    reconnectAttemptCount = 0;
    probeAttemptCount = 0;
    clearProbeRetryTimer();
  }

  async function requestWake(): Promise<boolean> {
    await options.bridgeOptions.onRequestWake?.();
    const ready = await ensureBridgeConfig();
    if (!ready) {
      return false;
    }

    stop();
    active = true;
    prepareBridgeStart();

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return false;
    }

    installVisibilityListener();
    connectSocket();
    const wakeSucceeded = await waitForBridgeConnection(AGENT_WAKE_WAIT_TIMEOUT_MS);
    if (!wakeSucceeded) {
      stop();
      return false;
    }
    return true;
  }

  async function waitForBridgeConnection(timeoutMs: number): Promise<boolean> {
    if (connected && socket && socket.readyState === WebSocket.OPEN) {
      return true;
    }
    if (typeof window === 'undefined') {
      return false;
    }

    const deadline = Date.now() + getTimeoutMs(timeoutMs, AGENT_WAKE_WAIT_TIMEOUT_MS);

    return await new Promise((resolve) => {
      const check = () => {
        if (connected && socket && socket.readyState === WebSocket.OPEN) {
          resolve(true);
          return;
        }
        if (!active || Date.now() >= deadline) {
          resolve(false);
          return;
        }
        window.setTimeout(check, 120);
      };

      check();
    });
  }

  function start(): void {
    logInfo('Starting Agent bridge service', {
      enabled,
      apiBaseUrl,
      integrationChannel,
      targetClientId,
      externalClientId,
      probeOnStart,
      probeTimeoutMs,
    });
    if (active) {
      if (probeOnStart && socket?.readyState === WebSocket.OPEN) {
        logDebug('Bridge already active, re-running probe');
        void probeFrontendPresence();
      }
      return;
    }

    active = true;
    prepareBridgeStart();

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      logWarn('Bridge start skipped', {
        hasWindow: typeof window !== 'undefined',
        hasWebSocket: typeof WebSocket !== 'undefined',
      });
      return;
    }

    installVisibilityListener();

    if (hasRequiredConfig()) {
      connectSocket();
      return;
    }

    void ensureBridgeConfig().then((ready) => {
      if (!active) return;
      if (!ready) {
        logWarn('Bridge start skipped', {
          hasRequiredConfig: hasRequiredConfig(),
          enabled,
          apiBaseUrl,
          integrationChannel,
          targetClientId,
        });
        return;
      }
      connectSocket();
    });
  }

  function readPageUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : '';
  }

  function buildAgentContextComments(
    element: Element | null,
    mode: 'append' | 'replace' = 'append',
  ): AgentContextComment[] {
    const currentFilePath = options.summaries.resolveCurrentFilePath();
    const pageUrl = readPageUrl();
    const updatedAt = new Date().toISOString();
    const comments = mode === 'replace'
      ? options.changes.buildCommentCommentsContext()
      : element
        ? options.changes.buildCommentCommentsContext(element)
        : [];

    return comments.map((comment) => {
      const target: Record<string, string> = {
        ...(currentFilePath ? { filePath: currentFilePath } : {}),
        elementId: String(comment.elementKey),
        ...(comment.elementType ? { elementType: comment.elementType } : {}),
        ...(comment.selector ? { selector: comment.selector } : {}),
        ...(pageUrl ? { link: pageUrl } : {}),
      };

      return {
        id: `web-editor-v2:${String(comment.elementKey)}`,
        body: comment.note,
        origin: 'web-editor-v2',
        ...(Object.keys(target).length > 0 ? { target } : {}),
        ...(comment.label ? { preview: comment.label } : {}),
        updatedAt,
      };
    });
  }

  function buildAgentCommentRecords(comments: AgentContextComment[]): AgentCommentRecord[] {
    return comments.flatMap((comment) => {
      const filePath = typeof comment.target?.filePath === 'string' ? comment.target.filePath.trim() : '';
      const body = String(comment.body || '').trim();
      if (!filePath || !body) return [];

      return [{
        id: comment.id,
        type: 'file' as const,
        path: filePath,
        comment: body,
        commentID: comment.id,
        commentOrigin: 'file' as const,
        ...(comment.preview ? { preview: comment.preview } : {}),
      }];
    });
  }

  function buildCommentCommentsOnlyContext(
    element: Element | null,
    mode: 'append' | 'replace',
  ) {
    const comments = buildAgentContextComments(element, mode);
    const commentRecords = buildAgentCommentRecords(comments);
    const currentFilePath = comments.length > 0 ? options.summaries.resolveCurrentFilePath() : '';
    const targetPath = comments.length > 0 ? options.summaries.resolveTargetPath() : '';
    return {
      version: '1' as const,
      systemContext: '',
      ...(currentFilePath
        ? {
            currentFile: {
              path: currentFilePath,
              displayName: buildCurrentFileDisplayName(targetPath, currentFilePath),
            },
          }
        : {}),
      selectedElements: [],
      extensions: {
        source: 'web-editor-v2',
        pageUrl: readPageUrl(),
        targetPath,
        comments,
        commentRecords,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  function buildAgentContext(selectedElement: Element | null) {
    const currentFilePath = options.summaries.resolveCurrentFilePath();
    const targetPath = options.summaries.resolveTargetPath();
    const comments = buildAgentContextComments(selectedElement);
    const selectedElements = (() => {
      if (!selectedElement) return [];
      const textCommentMeta = resolveTextCommentElementMeta(state, selectedElement);
      if (textCommentMeta) {
        return [
          {
            tag: textCommentMeta.sourceElement?.tagName.toLowerCase() ?? 'text-selection',
            selector: options.summaries.formatSelectorPath(textCommentMeta.locator),
            label: textCommentMeta.label,
          },
        ];
      }
      const locator = createElementLocator(selectedElement);
      return [
        {
          tag: selectedElement.tagName.toLowerCase(),
          selector: options.summaries.formatSelectorPath(locator),
          label: options.summaries.formatElementLabelFromLocator(locator),
        },
      ];
    })();

    return {
      version: '1' as const,
      systemContext: '',
      ...(currentFilePath
        ? {
            currentFile: {
              path: currentFilePath,
              displayName: buildCurrentFileDisplayName(targetPath, currentFilePath),
            },
          }
        : {}),
      selectedElements,
      extensions: {
        source: 'web-editor-v2',
        pageUrl: readPageUrl(),
        targetPath,
        ...(comments.length > 0 ? { comments } : {}),
        webEditorV2: {
          selectedElementNote: options.changes.getSelectedElementNote(),
          modifiedElements: options.changes.buildModifiedElementsContext(),
          markersVisible: options.state.changeMarkersVisible,
        },
        updatedAt: new Date().toISOString(),
      },
    };
  }

  async function handleSyncCommentContextToAgent(
    element: Element | null,
    mode: 'append' | 'replace',
  ): Promise<void> {
    if (!enabled) return;

    try {
      const context = buildCommentCommentsOnlyContext(element, mode);
      logInfo('Syncing comment comments to Agent context', {
        integrationChannel,
        targetClientId,
        mode,
      });
      assertFrontendAvailable();
      if (!normalizeString(targetClientId)) {
        await resolveOnlineFrontendTargetForContext(context, 'comment_context');
      }

      const requestId = createRequestId('agent_comment_context');
      const request = createPendingRequest(
        requestId,
        getTimeoutMs(probeTimeoutMs, AGENT_CONTEXT_REQUEST_TIMEOUT_MS),
        'integration',
      );

      try {
        sendSocketMessage({
          type: 'integration.context.update',
          requestId,
          payload: {
            ...buildIntegrationTargetPayload(),
            mode,
            context,
          },
        });
      } catch (error) {
        clearPendingRequest(requestId);
        throw error;
      }

      await request;
      logInfo('Comment comments synced to Agent context', {
        requestId,
        integrationChannel,
        targetClientId,
        mode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('Failed to sync comment comments to Agent context', {
        message,
        integrationChannel,
        targetClientId,
        mode,
      });
      throw error;
    }
  }

  async function handleSendSelectionToAgent(element: Element): Promise<void> {
    if (!enabled) return;

    try {
      const context = buildAgentContext(element);
      logInfo('Sending selected element context to Agent', {
        tagName: element.tagName,
        integrationChannel,
        targetClientId,
      });
      assertFrontendAvailable();
      if (!normalizeString(targetClientId)) {
        await resolveOnlineFrontendTargetForContext(context, 'selected_element_context');
      }

      const requestId = createRequestId('agent_context');
      const request = createPendingRequest(
        requestId,
        getTimeoutMs(probeTimeoutMs, AGENT_CONTEXT_REQUEST_TIMEOUT_MS),
        'integration',
      );

      try {
        sendSocketMessage({
          type: 'integration.context.update',
          requestId,
          payload: {
            ...buildIntegrationTargetPayload(),
            mode: 'append',
            context,
          },
        });
      } catch (error) {
        clearPendingRequest(requestId);
        throw error;
      }

      await request;
      logInfo('Selected element context sent successfully', {
        requestId,
        integrationChannel,
        targetClientId,
      });
      options.feedback.toast('success', '已添加到 AI 对话。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('Failed to send selected element context', {
        message,
        integrationChannel,
        targetClientId,
      });
      options.feedback.toast('error', `添加到 AI 对话失败：${message}`);
    }
  }

  function resolveAgentRunConcurrency(): number {
    const numeric = Number(state.uiSettings.agentRunConcurrency);
    if (!Number.isFinite(numeric)) return 5;
    return Math.min(10, Math.max(1, Math.trunc(numeric)));
  }

  async function runAgentPromptForElement(params: {
    element: Element;
    prompt: string;
    scopeKey: string;
    reusableConversation: PageAgentConversationState | null;
    effectiveProvider: string;
    requestId?: string;
    startedAt?: number;
  }): Promise<void> {
    const { element, prompt, scopeKey, reusableConversation, effectiveProvider } = params;
    const meta = resolveElementTaskMeta(element);
    const promptImages = collectPromptImagesForElements([element]);
    const messageWithImageAssets = appendPromptImageAssetPathsToMessage(
      prompt,
      promptImages,
    );
    const sessionIdToReuse = reusableConversation?.sessionId ?? null;
    const startedAt = params.startedAt ?? Date.now();
    const requestId = params.requestId ?? createRequestId('agent_run');
    const request = createPendingRequest(
      requestId,
      AGENT_RUN_TIMEOUT_MS,
      'agent-run',
      '等待 AI 执行完成超时，请稍后查看 AI 会话。',
    );
    const currentTask = getElementTaskStateByKey(meta.elementKey);

    upsertTaskState({
      scopeKey,
      elementKey: meta.elementKey,
      locator: meta.locator,
      label: meta.label,
      requestId,
      sessionId: sessionIdToReuse,
      sessionPath: reusableConversation?.sessionPath ?? null,
      sessionUrl: reusableConversation?.sessionUrl ?? null,
      provider: effectiveProvider,
      status: 'pending',
      message: 'AI 准备中',
      startedAt,
      updatedAt: startedAt,
      dismissed: false,
      recovery: 'live',
      recoveryPending: false,
      lastEventAt: startedAt,
      errorCode: null,
    }, {
      clearPreviousRequestId: currentTask?.requestId ?? null,
    });
    setActivePromptRun({
      requestId,
      scopeKey,
      provider: effectiveProvider,
      sessionId: sessionIdToReuse,
      sessionPath: reusableConversation?.sessionPath ?? null,
      sessionUrl: reusableConversation?.sessionUrl ?? null,
      abortRequestId: null,
      interruptRequested: false,
      elementKey: meta.elementKey,
      locator: meta.locator,
      label: meta.label,
    });

    try {
      sendSocketMessage({
        type: 'agent.run',
        requestId,
        payload: {
          ...(projectPath ? { projectPath } : {}),
          provider: effectiveProvider,
          ...(sessionIdToReuse ? { sessionId: sessionIdToReuse } : {}),
          message: messageWithImageAssets,
          ...(promptImages.length > 0 ? { images: promptImages } : {}),
          stream: false,
        },
      });
      if (reusableConversation) {
        upsertConversationState(scopeKey, {
          sessionId: reusableConversation.sessionId,
          provider: effectiveProvider,
          projectPath,
          createdAt: reusableConversation.createdAt,
          lastUsedAt: startedAt,
          sentCount: reusableConversation.sentCount + 1,
          expiresAt: reusableConversation.expiresAt,
          sessionPath: reusableConversation.sessionPath,
          sessionUrl: reusableConversation.sessionUrl,
          invalidated: false,
        });
      }
    } catch (error) {
      clearPendingRequest(requestId);
      clearActivePromptRun(requestId);
      updateTaskStateByRequestId(requestId, {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        recovery: 'live',
        recoveryPending: false,
        lastEventAt: Date.now(),
      }, {
        reviveDismissed: true,
      });
      throw error;
    }

    await request;
  }

  async function runWithConcurrency<T>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let nextIndex = 0;
    const errors: unknown[] = [];
    const workerCount = Math.min(concurrency, items.length);
    const runners = Array.from({ length: workerCount }, async () => {
      for (;;) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) return;
        try {
          await worker(items[currentIndex]!);
        } catch (error) {
          errors.push(error);
        }
      }
    });
    await Promise.all(runners);
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  async function handleSendPromptToAgentForElements(
    elements: Element[],
    prompt: string | ((element: Element) => string),
  ): Promise<void> {
    if (!enabled) return;

    try {
      const targetElements = Array.from(new Set(elements.filter((element): element is Element => Boolean(element?.isConnected))));
      if (targetElements.length === 0) {
        throw createBridgeError('目标元素已失效，请重新选择后再试。');
      }
      const scopeKey = resolveScopeKey();
      const targetRuns = targetElements.map((element) => {
        const reusableConversation = resolveElementReusableConversation(element, scopeKey);
        const effectiveProvider = String(
          reusableConversation?.provider
          ?? resolveConfiguredProvider(),
        ).trim();
        const normalizedPrompt = typeof prompt === 'function'
          ? String(prompt(element) ?? '')
          : String(prompt ?? '');
        const startedAt = Date.now();
        return {
          element,
          meta: resolveElementTaskMeta(element),
          prompt: normalizedPrompt,
          reusableConversation,
          effectiveProvider,
          requestId: createRequestId('agent_run'),
          startedAt,
        };
      }).filter((item) => item.prompt.trim());
      if (targetRuns.length === 0) {
        throw createBridgeError('当前没有可发送给 AI 的编辑元素。');
      }
      const concurrency = resolveAgentRunConcurrency();

      logInfo('Sending prompt to Agent input', {
        elementCount: targetRuns.length,
        elementKeys: targetRuns.map((item) => item.meta.elementKey),
        scopeKey,
        integrationChannel,
        targetClientId,
        promptLength: targetRuns.reduce((total, item) => total + item.prompt.length, 0),
        connected,
        providers: Array.from(new Set(targetRuns.map((item) => item.effectiveProvider))),
        sessionIdsToReuse: targetRuns
          .map((item) => item.reusableConversation?.sessionId ?? null)
          .filter(Boolean),
        concurrency,
      });

      if (!hasAgentRunConfig()) {
        await ensureAgentRunConfig();
      }
      assertAgentRunReady();
      for (const provider of Array.from(new Set(targetRuns.map((item) => item.effectiveProvider)))) {
        assertProviderAvailable(provider);
      }

      for (const item of targetRuns) {
        const currentTask = getElementTaskStateByKey(item.meta.elementKey);
        upsertTaskState({
          scopeKey,
          elementKey: item.meta.elementKey,
          locator: item.meta.locator,
          label: item.meta.label,
          requestId: item.requestId,
          sessionId: item.reusableConversation?.sessionId ?? null,
          sessionPath: item.reusableConversation?.sessionPath ?? null,
          sessionUrl: item.reusableConversation?.sessionUrl ?? null,
          provider: item.effectiveProvider,
          status: 'pending',
          message: 'AI 准备中',
          startedAt: item.startedAt,
          updatedAt: item.startedAt,
          dismissed: false,
          recovery: 'live',
          recoveryPending: false,
          lastEventAt: item.startedAt,
          errorCode: null,
        }, {
          clearPreviousRequestId: currentTask?.requestId ?? null,
        });
      }

      await runWithConcurrency(
        targetRuns,
        concurrency,
        async ({
          element,
          prompt: elementPrompt,
          reusableConversation,
          effectiveProvider,
          requestId,
          startedAt,
        }) => {
          await runAgentPromptForElement({
            element,
            prompt: elementPrompt,
            scopeKey,
            reusableConversation,
            effectiveProvider,
            requestId,
            startedAt,
          });
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isSilentBridgeError(error)) {
        logInfo('Prompt send ended without toast', {
          message,
          integrationChannel,
          targetClientId,
        });
      } else {
        logWarn('Failed to send prompt to Agent', {
          message,
          integrationChannel,
          targetClientId,
        });
      }
      if (!isSilentBridgeError(error)) {
        options.feedback.toast('error', `发送给 AI 失败：${message}`);
      }
      throw error;
    }
  }

  async function handleSendPromptToAgentForElement(element: Element, prompt: string): Promise<void> {
    await handleSendPromptToAgentForElements([element], prompt);
  }

  function getInterruptibleVisibleRuns(): ActivePromptRun[] {
    const seenRequestIds = new Set<string>();
    const runs: ActivePromptRun[] = [];
    for (const task of getVisibleTaskStates()) {
      if (!isTaskRunning(task)) continue;
      const currentRun = activePromptRuns.get(task.requestId) ?? null;
      if (!currentRun || !currentRun.sessionId || currentRun.abortRequestId) continue;
      if (seenRequestIds.has(currentRun.requestId)) continue;
      seenRequestIds.add(currentRun.requestId);
      runs.push(currentRun);
    }
    return runs;
  }

  function getInterruptibleVisibleExternalEditingTasks(): ElementAgentTaskState[] {
    return getVisibleTaskStates().filter(
      (task) => task.origin === 'external-editing' && isTaskRunning(task),
    );
  }

  function interruptVisibleExternalEditingTasks(excludedRequestIds = new Set<string>()): number {
    const now = Date.now();
    let interruptedCount = 0;
    for (const task of getInterruptibleVisibleExternalEditingTasks()) {
      if (excludedRequestIds.has(task.requestId)) continue;
      const nextTask = updateTaskStateByRequestId(task.requestId, {
        status: 'error',
        message: '已中断',
        updatedAt: now,
        recovery: 'live',
        recoveryPending: false,
        lastEventAt: now,
        errorCode: 'GENIE_ABORTED',
      }, {
        reviveDismissed: true,
      });
      if (nextTask) {
        interruptedCount += 1;
      }
    }
    return interruptedCount;
  }

  async function interruptActivePromptRun(currentRun: ActivePromptRun): Promise<void> {
    if (!currentRun.sessionId) {
      throw createBridgeError('AI 对话尚未创建，暂时无法中断，请稍后再试。');
    }

    if (currentRun.abortRequestId) {
      return;
    }

    assertBridgeConnected();

    const abortRequestId = createRequestId('agent_abort');
    const request = createPendingRequest(
      abortRequestId,
      getTimeoutMs(probeTimeoutMs, AGENT_CONTEXT_REQUEST_TIMEOUT_MS),
      'agent-abort',
      '等待 AI 中断超时，请稍后查看 AI 会话。',
      { linkedRunRequestId: currentRun.requestId },
    );

    updateActivePromptRun(currentRun.requestId, {
      abortRequestId,
      interruptRequested: true,
    });

    try {
      sendSocketMessage({
        type: 'agent.abort',
        requestId: abortRequestId,
        payload: {
          sessionId: currentRun.sessionId,
          provider: currentRun.provider ?? resolveConfiguredProvider(),
        },
      });
    } catch (error) {
      clearPendingRequest(abortRequestId);
      updateActivePromptRun(currentRun.requestId, {
        abortRequestId: null,
        interruptRequested: false,
      });
      throw error;
    }

    try {
      await request;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('Failed to interrupt Agent prompt run', {
        message,
        integrationChannel,
        targetClientId,
      });
      options.feedback.toast('error', `中断 AI 执行失败：${message}`);
      throw error;
    }
  }

  async function interruptElementTask(element: Element): Promise<void> {
    if (!enabled) return;

    const currentTask = getElementTaskState(element);
    if (!currentTask) {
      throw createBridgeError('当前元素没有可中断的 AI 执行。');
    }

    const currentRun = activePromptRuns.get(currentTask.requestId) ?? null;
    if (!currentRun) {
      throw createBridgeError('当前没有可中断的 AI 执行。');
    }

    await interruptActivePromptRun(currentRun);
  }

  async function interruptVisibleTasks(): Promise<void> {
    const visibleRuns = getInterruptibleVisibleRuns();
    const runRequestIds = new Set(visibleRuns.map((run) => run.requestId));
    const interruptedExternalEditingCount = interruptVisibleExternalEditingTasks(runRequestIds);
    if (visibleRuns.length === 0 && interruptedExternalEditingCount === 0) {
      throw createBridgeError('当前没有可中断的 AI 执行。');
    }
    await Promise.all(visibleRuns.map((run) => interruptActivePromptRun(run)));
  }

  return {
    start,
    stop,
    requestWake,
    isConnected() {
      return connected;
    },
    isAvailable() {
      return available;
    },
    getDebugInfo() {
      return {
        apiBaseUrl,
        integrationChannel,
        targetClientId,
        provider: resolveConfiguredProvider(),
      };
    },
    getCurrentConversationState,
    subscribeSessionActivity(target, listener) {
      const normalizedTarget = normalizeSessionActivityTarget(target);
      if (!normalizedTarget) {
        return () => undefined;
      }

      const key = buildSessionActivityTargetKey(normalizedTarget);
      const subscriberId = ++nextActivitySubscriberId;
      activitySubscribers.set(subscriberId, {
        key,
        target: normalizedTarget,
        listener,
      });

      const existing = activitySubscriptionCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        activitySubscriptionCounts.set(key, {
          count: 1,
          target: normalizedTarget,
        });
        sendSessionActivitySubscribe(normalizedTarget);
      }

      return () => {
        const subscriber = activitySubscribers.get(subscriberId);
        if (!subscriber) return;
        activitySubscribers.delete(subscriberId);

        const tracked = activitySubscriptionCounts.get(subscriber.key);
        if (!tracked) return;
        if (tracked.count <= 1) {
          activitySubscriptionCounts.delete(subscriber.key);
          sendSessionActivityUnsubscribe(tracked.target);
          return;
        }
        tracked.count -= 1;
      };
    },
    hasReusableConversation,
    canReuseConversationForElement,
    invalidateCurrentConversation,
    getElementTaskState,
    getVisibleTaskStates,
    getProviderAvailability,
    getProviderAvailabilities,
    refreshProviderAvailabilities,
    getTaskStateByElementKey: getDisplayTaskStateByKey,
    resolveSelectableElement,
    isElementInteractionLocked,
    dismissElementTaskState,
    setExternalEditingState,
    setExternalEditingStateByElementKey,
    clearExternalEditingState,
    clearExternalEditingStateByElementKey,
    setExternalEditingTerminalState,
    setExternalEditingTerminalStateByElementKey,
    canInterruptElementTask(element: Element | null) {
      const currentTask = getElementTaskState(element);
      if (!currentTask) return false;
      const currentRun = activePromptRuns.get(currentTask.requestId) ?? null;
      return Boolean(currentRun && currentRun.sessionId && !currentRun.abortRequestId);
    },
    canInterruptVisibleTasks() {
      return (
        getInterruptibleVisibleRuns().length > 0
        || getInterruptibleVisibleExternalEditingTasks().length > 0
      );
    },
    interruptElementTask,
    interruptVisibleTasks,
    handleSendSelectionToAgent,
    handleSyncCommentContextToAgent,
    handleSendPromptToAgentForElements,
    handleSendPromptToAgentForElement,
    discardDeletedElementStates,
    rehydratePersistedAgentState,
  };
}
