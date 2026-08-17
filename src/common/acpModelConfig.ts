export type AcpProviderKey =
  | 'claude'
  | 'codex'
  | 'opencode'
  | 'cursor'
  | 'qoder'
  | 'codebuddy'
  | 'reasonix'
  | 'grok-build';

export interface AcpProviderOption {
  provider: AcpProviderKey;
  client: `acp:${AcpProviderKey}`;
  label: string;
  supportsNpxFallback?: boolean;
}

export interface AcpAnnotationModelPreference {
  promptClient: `acp:${AcpProviderKey}`;
  model: string | null;
}

export const ACP_PROVIDER_OPTIONS: readonly AcpProviderOption[] = [
  { provider: 'claude', client: 'acp:claude', label: 'Claude Code' },
  { provider: 'codex', client: 'acp:codex', label: 'Codex CLI' },
  { provider: 'opencode', client: 'acp:opencode', label: 'OpenCode' },
  { provider: 'cursor', client: 'acp:cursor', label: 'Cursor CLI' },
  { provider: 'qoder', client: 'acp:qoder', label: 'Qoder CLI' },
  { provider: 'codebuddy', client: 'acp:codebuddy', label: 'CodeBuddy CLI' },
  { provider: 'reasonix', client: 'acp:reasonix', label: 'Reasonix CLI' },
  { provider: 'grok-build', client: 'acp:grok-build', label: 'Grok Build', supportsNpxFallback: true },
] as const;

export const ACP_PROVIDER_KEYS = ACP_PROVIDER_OPTIONS.map((option) => option.provider) as AcpProviderKey[];

const ACP_PROVIDER_KEY_SET = new Set<string>(ACP_PROVIDER_KEYS);

const ACP_PROVIDER_ALIASES: Record<string, AcpProviderKey> = {
  openai: 'codex',
  claudecode: 'claude',
  gemini: 'codex',
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeAcpProviderKey(value: unknown): AcpProviderKey | null {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/^acp:/u, '');
  if (!normalized) return null;
  const aliased = ACP_PROVIDER_ALIASES[normalized] || normalized;
  return ACP_PROVIDER_KEY_SET.has(aliased) ? aliased as AcpProviderKey : null;
}

export function toAcpPromptClient(provider: AcpProviderKey): `acp:${AcpProviderKey}` {
  return `acp:${provider}`;
}

export function resolveAcpPromptClientProvider(value: unknown): AcpProviderKey | null {
  return normalizeAcpProviderKey(value);
}

export function getAcpProviderOption(provider: unknown): AcpProviderOption | null {
  const normalized = normalizeAcpProviderKey(provider);
  return normalized
    ? ACP_PROVIDER_OPTIONS.find((option) => option.provider === normalized) || null
    : null;
}

export function normalizeAcpAnnotationModelPreference(input: {
  promptClient?: unknown;
  model?: unknown;
}, fallbackClient: unknown = 'acp:codex'): AcpAnnotationModelPreference {
  const provider = normalizeAcpProviderKey(input.promptClient) || normalizeAcpProviderKey(fallbackClient) || 'codex';
  return {
    promptClient: toAcpPromptClient(provider),
    model: normalizeString(input.model) || null,
  };
}

export function resolveAnnotationModel(
  preference: AcpAnnotationModelPreference | null | undefined,
): string | null {
  const model = normalizeString(preference?.model);
  return model || null;
}
