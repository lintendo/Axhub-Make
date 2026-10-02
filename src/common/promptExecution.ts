import type { AcpProvider } from '@/common/assistant-context/types';
import { normalizeAcpProviderKey, toAcpPromptClient } from './acpModelConfig';
import type {
  AcpPromptClient,
  LocalPromptClient,
  PromptClient,
  PromptClientPreference,
} from '@/index/types';

const LEGACY_PROMPT_CLIENT_MAP: Record<string, AcpPromptClient> = {
  claude: 'acp:claude',
  claudecode: 'acp:claude',
  codex: 'acp:codex',
  openai: 'acp:codex',
  gemini: 'acp:codex',
  'acp:gemini': 'acp:codex',
  opencode: 'acp:opencode',
  cursor: 'acp:cursor',
  qoder: 'acp:qoder',
  codebuddy: 'acp:codebuddy',
  reasonix: 'acp:reasonix',
  'grok-build': 'acp:grok-build',
};

const ACP_PROMPT_CLIENT_SET: ReadonlySet<string> = new Set([
  'acp:claude',
  'acp:codex',
  'acp:opencode',
  'acp:cursor',
  'acp:qoder',
  'acp:codebuddy',
  'acp:reasonix',
  'acp:grok-build',
]);

const LOCAL_PROMPT_CLIENT_SET: ReadonlySet<string> = new Set([
  'local:cursor',
  'local:qoder',
]);

export type AiPurposePromptClientKey =
  | 'conversationPromptClient'
  | 'annotationPromptClient'
  | 'canvasPromptClient';

export interface AiPurposePromptClientPreferences {
  conversationPromptClient: PromptClientPreference;
  annotationPromptClient: PromptClientPreference;
  canvasPromptClient: PromptClientPreference;
}

export function fillUnsetAiPurposePromptClients<T extends AiPurposePromptClientPreferences>(
  previous: T,
  key: AiPurposePromptClientKey,
  value: PromptClientPreference,
): T {
  if (!value) {
    return { ...previous, [key]: null };
  }

  return {
    ...previous,
    conversationPromptClient: key === 'conversationPromptClient'
      ? value
      : previous.conversationPromptClient || value,
    annotationPromptClient: key === 'annotationPromptClient'
      ? value
      : previous.annotationPromptClient || value,
    canvasPromptClient: key === 'canvasPromptClient'
      ? value
      : previous.canvasPromptClient || value,
  };
}

export function normalizePromptClientPreference(value: unknown): PromptClientPreference {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (ACP_PROMPT_CLIENT_SET.has(normalized) || LOCAL_PROMPT_CLIENT_SET.has(normalized)) {
    return normalized as PromptClient;
  }

  return LEGACY_PROMPT_CLIENT_MAP[normalized] || null;
}

export function isAcpPromptClient(value: unknown): value is AcpPromptClient {
  return typeof value === 'string' && ACP_PROMPT_CLIENT_SET.has(value);
}

export function isLocalPromptClient(value: unknown): value is LocalPromptClient {
  return typeof value === 'string' && LOCAL_PROMPT_CLIENT_SET.has(value);
}

export function toAcpProvider(client: PromptClientPreference): AcpProvider | null {
  if (!isAcpPromptClient(client)) return null;

  return normalizeAcpProviderKey(client.split(':')[1]) as AcpProvider | null;
}

export function toAcpPromptClientPreference(provider: unknown): AcpPromptClient | null {
  const normalized = normalizeAcpProviderKey(provider);
  return normalized ? toAcpPromptClient(normalized) as AcpPromptClient : null;
}

function generateCursorPromptDeeplink(promptText: string): string {
  const url = new URL('cursor://anysphere.cursor-deeplink/prompt');
  url.searchParams.set('text', promptText);
  return url.toString();
}

function generateQoderPromptDeeplink(promptText: string): string {
  const url = new URL('qoder://aicoding.aicoding-deeplink/chat');
  url.searchParams.set('text', promptText);
  url.searchParams.set('mode', 'agent');
  return url.toString();
}

export function generateLocalPromptDeeplink(client: LocalPromptClient, promptText: string): string {
  if (!promptText) {
    throw new Error('Prompt 不能为空');
  }

  if (client === 'local:cursor') {
    return generateCursorPromptDeeplink(promptText);
  }

  if (client === 'local:qoder') {
    return generateQoderPromptDeeplink(promptText);
  }

  throw new Error('不支持的本地编辑器类型');
}
