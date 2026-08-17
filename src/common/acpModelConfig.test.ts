import { describe, expect, it } from 'vitest';

import {
  getAcpProviderOption,
  normalizeAcpProviderKey,
} from './acpModelConfig';
import {
  normalizePromptClientPreference,
  toAcpProvider,
} from './promptExecution';

describe('Grok Build ACP provider configuration', () => {
  it('normalizes the provider and prompt-client identifiers', () => {
    expect(normalizeAcpProviderKey('grok-build')).toBe('grok-build');
    expect(normalizeAcpProviderKey('acp:grok-build')).toBe('grok-build');
    expect(normalizePromptClientPreference('grok-build')).toBe('acp:grok-build');
    expect(normalizePromptClientPreference('acp:grok-build')).toBe('acp:grok-build');
    expect(toAcpProvider('acp:grok-build')).toBe('grok-build');
  });

  it('exposes provider launch metadata without owning a default model', () => {
    const option = getAcpProviderOption('grok-build');

    expect(option).toEqual({
      provider: 'grok-build',
      client: 'acp:grok-build',
      label: 'Grok Build',
      supportsNpxFallback: true,
    });
    expect(option).not.toHaveProperty('defaultAnnotationModel');
  });
});
