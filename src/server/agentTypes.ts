export type AgentAvailabilityStatus = 'installed' | 'missing' | 'unknown';
export type AgentAvailabilityConfidence = 'high' | 'low';

export interface AgentAvailabilityInfo {
  status: AgentAvailabilityStatus;
  confidence: AgentAvailabilityConfidence;
  checkedAt: string;
  source?: string;
  path?: string;
  reason?: string;
}

export interface AgentVersionInfo {
  status: AgentAvailabilityStatus;
  checkedAt: string;
  command: string;
  version?: string;
  packageName?: string;
  reason?: string;
}

export const CLI_AGENT_OPTIONS = [
  { value: 'codex', label: 'Codex' },
  { value: 'claudecode', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
] as const;

export const WEB_AGENT_OPTIONS = [
  { value: 'opencode', label: 'OpenCode' },
  { value: 'acp', label: 'ACP UI' },
] as const;

export const LOCAL_APP_AGENT_OPTIONS = [
  { value: 'codex', label: 'ChatGPT' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'workbuddy', label: 'WorkBuddy' },
  { value: 'traework', label: 'TRAEWORK' },
  { value: 'qoderwork', label: 'QoderWork' },
  { value: 'trae', label: 'TRAE' },
] as const;

export type CLIAgent = typeof CLI_AGENT_OPTIONS[number]['value'];
export type WebAgent = typeof WEB_AGENT_OPTIONS[number]['value'];
export type LocalAppAgent = typeof LOCAL_APP_AGENT_OPTIONS[number]['value'];

export const CLI_AGENT_VALUES = CLI_AGENT_OPTIONS.map((option) => option.value) as CLIAgent[];
export const WEB_AGENT_VALUES = WEB_AGENT_OPTIONS.map((option) => option.value) as WebAgent[];
export const LOCAL_APP_AGENT_VALUES = LOCAL_APP_AGENT_OPTIONS.map((option) => option.value) as LocalAppAgent[];

export const CLI_AGENT_APP_NAMES: Record<CLIAgent, string> = {
  codex: 'Codex',
  claudecode: 'Claude Code',
  opencode: 'OpenCode',
};

export const WEB_AGENT_APP_NAMES: Record<WebAgent, string> = {
  opencode: 'OpenCode',
  acp: 'ACP UI',
};

export const LOCAL_APP_AGENT_APP_NAMES: Record<LocalAppAgent, string> = {
  codex: 'ChatGPT',
  opencode: 'OpenCode',
  workbuddy: 'WorkBuddy',
  traework: 'TRAEWORK',
  qoderwork: 'QoderWork',
  trae: 'TRAE',
};

export type AgentAvailabilityMap<T extends string> = Partial<Record<T, AgentAvailabilityInfo>>;

export interface RuntimeAgentAvailability {
  cli: AgentAvailabilityMap<CLIAgent>;
  localApp: AgentAvailabilityMap<LocalAppAgent>;
  web: AgentAvailabilityMap<WebAgent>;
}

export function isAgentMissing<T extends string>(
  agent: T,
  availability?: AgentAvailabilityMap<T> | null,
): boolean {
  return availability?.[agent]?.status === 'missing';
}

export function getVisibleAgentOptions<T extends string, TOption extends { value: T }>(
  options: readonly TOption[],
  availability?: AgentAvailabilityMap<T> | null,
) {
  return options.filter((option) => !isAgentMissing(option.value, availability));
}

export function normalizeCLIAgent(value: unknown): CLIAgent | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[-_\s]+/gu, '');
  if (normalized === 'claude' || normalized === 'claudecode') {
    return 'claudecode';
  }
  return CLI_AGENT_VALUES.includes(normalized as CLIAgent) ? normalized as CLIAgent : null;
}

export function normalizeWebAgent(value: unknown): WebAgent | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[-_\s]+/gu, '');
  return WEB_AGENT_VALUES.includes(normalized as WebAgent) ? normalized as WebAgent : null;
}

export function normalizeLocalAppAgent(value: unknown): LocalAppAgent | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[-_\s]+/gu, '');
  return LOCAL_APP_AGENT_VALUES.includes(normalized as LocalAppAgent) ? normalized as LocalAppAgent : null;
}
