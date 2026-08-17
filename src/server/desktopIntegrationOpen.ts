import type { DesktopIntegrationInspection } from './desktopClientLifecycle.ts';

export const DESKTOP_INTEGRATION_PROVIDERS = ['chatgpt', 'cursor', 'workbuddy', 'traework', 'qoderwork'] as const;
export const DESKTOP_INTEGRATION_OPEN_ACTIONS = ['prepare', 'restart', 'normal'] as const;

export type DesktopIntegrationProvider = typeof DESKTOP_INTEGRATION_PROVIDERS[number];
export type DesktopIntegrationOpenAction = typeof DESKTOP_INTEGRATION_OPEN_ACTIONS[number];

export interface DesktopIntegrationOperationResult {
  url?: string;
  openInBrowser?: boolean;
  noticeCode?: 'project-selection-required';
  notice?: string;
}

export interface DesktopIntegrationOpenAdapters {
  inspect(): Promise<DesktopIntegrationInspection>;
  launch(): Promise<{ launched: boolean; reused: boolean }>;
  close(): Promise<void>;
  open(mode: 'integrated' | 'normal'): Promise<DesktopIntegrationOperationResult>;
}

export interface DesktopIntegrationOpenResult extends DesktopIntegrationOperationResult {
  provider: DesktopIntegrationProvider;
  status: 'opened' | 'restart-required';
  mode?: 'integrated' | 'normal';
  launched?: boolean;
  reused?: boolean;
}

export function normalizeDesktopIntegrationProvider(value: unknown): DesktopIntegrationProvider | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return DESKTOP_INTEGRATION_PROVIDERS.includes(normalized as DesktopIntegrationProvider)
    ? normalized as DesktopIntegrationProvider
    : null;
}

export function normalizeDesktopIntegrationOpenAction(value: unknown): DesktopIntegrationOpenAction | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return DESKTOP_INTEGRATION_OPEN_ACTIONS.includes(normalized as DesktopIntegrationOpenAction)
    ? normalized as DesktopIntegrationOpenAction
    : null;
}

function missingClientMessage(provider: DesktopIntegrationProvider): string {
  const labels: Record<DesktopIntegrationProvider, string> = {
    chatgpt: 'ChatGPT',
    cursor: 'Cursor',
    workbuddy: 'WorkBuddy',
    traework: 'TRAEWORK',
    qoderwork: 'QoderWork',
  };
  return `${labels[provider]} was not found in a supported installation location.`;
}

function missingIntegrationMessage(provider: DesktopIntegrationProvider): string {
  if (provider !== 'chatgpt') {
    return `${provider} integration is not available.`;
  }
  return 'The Axhub ChatGPT integration is unavailable in this Make build. Update @axhub/make and try again.';
}

export async function coordinateDesktopIntegrationOpen(
  input: {
    provider: DesktopIntegrationProvider;
    action: DesktopIntegrationOpenAction;
  },
  adapters: DesktopIntegrationOpenAdapters,
): Promise<DesktopIntegrationOpenResult> {
  if (input.action === 'normal') {
    const operation = await adapters.open('normal');
    return {
      provider: input.provider,
      status: 'opened',
      mode: 'normal',
      ...operation,
    };
  }

  const state = await adapters.inspect();
  if (!state.installed && !state.ready) {
    throw new Error(missingClientMessage(input.provider));
  }
  if (input.provider !== 'cursor' && !state.integrationInstalled && !state.ready) {
    throw new Error(missingIntegrationMessage(input.provider));
  }
  const requiresRestart = state.running && !state.ready && !state.recoverable;
  if (requiresRestart && input.action === 'prepare') {
    return {
      provider: input.provider,
      status: 'restart-required',
    };
  }

  if (requiresRestart) {
    await adapters.close();
  }

  const launch = state.ready
    ? { launched: false, reused: true }
    : await adapters.launch();
  const operation = await adapters.open('integrated');
  return {
    provider: input.provider,
    status: 'opened',
    mode: 'integrated',
    ...launch,
    ...operation,
  };
}
