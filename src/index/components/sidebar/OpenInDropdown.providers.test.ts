import { describe, expect, it } from 'vitest';

import {
  INTEGRATED_LOCAL_APP_PROVIDERS,
  LOCAL_APP_OPEN_OPTIONS,
} from './localAppOpenOptions';

describe('local app provider menu registry', () => {
  it('keeps retired QoderWork out of the visible provider order', () => {
    expect(LOCAL_APP_OPEN_OPTIONS.map((item) => item.option.value)).toEqual([
      'codex',
      'opencode',
      'workbuddy',
      'traework',
      'cursor',
      'trae',
    ]);
    expect(LOCAL_APP_OPEN_OPTIONS.map((item) => item.option.label)).toEqual([
      'ChatGPT',
      'OpenCode',
      'WorkBuddy',
      'TRAEWORK',
      'Cursor',
      'TRAE',
    ]);
  });

  it('marks only qualified iframe hosts as integrated menu providers', () => {
    expect(INTEGRATED_LOCAL_APP_PROVIDERS).toEqual({
      codex: 'chatgpt',
      workbuddy: 'workbuddy',
      traework: 'traework',
    });
    expect(INTEGRATED_LOCAL_APP_PROVIDERS).not.toHaveProperty('opencode');
    expect(INTEGRATED_LOCAL_APP_PROVIDERS).not.toHaveProperty('trae');
    expect(INTEGRATED_LOCAL_APP_PROVIDERS).not.toHaveProperty('qoderwork');
  });

  it('keeps TRAEWORK visible and routes it through desktop integration', () => {
    expect(LOCAL_APP_OPEN_OPTIONS.some((item) => item.option.value === 'traework')).toBe(true);
    expect(INTEGRATED_LOCAL_APP_PROVIDERS.traework).toBe('traework');
  });
});
