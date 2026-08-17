import {
  LOCAL_APP_AGENT_OPTIONS,
  type LocalAppAgent,
} from '../../../common/agent';
import type { DesktopIntegrationProvider } from '../../services/api';

export const CURSOR_LOCAL_APP_OPTION = { value: 'cursor', label: 'Cursor' } as const;

export type LocalAppOpenOption =
  | { kind: 'local-app'; option: (typeof LOCAL_APP_AGENT_OPTIONS)[number] }
  | { kind: 'ide'; option: typeof CURSOR_LOCAL_APP_OPTION };

export const LOCAL_APP_OPEN_OPTIONS: readonly LocalAppOpenOption[] = [
  ...LOCAL_APP_AGENT_OPTIONS.slice(0, 4).map((option): LocalAppOpenOption => ({ kind: 'local-app', option })),
  { kind: 'ide', option: CURSOR_LOCAL_APP_OPTION },
  ...LOCAL_APP_AGENT_OPTIONS.slice(4).map((option): LocalAppOpenOption => ({ kind: 'local-app', option })),
];

export const INTEGRATED_LOCAL_APP_PROVIDERS: Partial<Record<LocalAppAgent, DesktopIntegrationProvider>> = {
  codex: 'chatgpt',
  workbuddy: 'workbuddy',
  traework: 'traework',
  qoderwork: 'qoderwork',
};
