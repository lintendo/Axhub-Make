import { describe, expect, it } from 'vitest';

import { isTrustedPrototypeEditorParentEvent } from './prototypeEditorBridgeTrust.ts';

describe('prototype editor parent bridge trust', () => {
  it('accepts only messages from the established parent window and origin', () => {
    const parentWindow = {} as Window;
    const otherWindow = {} as Window;

    expect(isTrustedPrototypeEditorParentEvent({
      source: parentWindow,
      origin: 'http://localhost:5174',
      parentWindow,
      trustedOrigin: 'http://localhost:5174',
    })).toBe(true);
    expect(isTrustedPrototypeEditorParentEvent({
      source: otherWindow,
      origin: 'http://localhost:5174',
      parentWindow,
      trustedOrigin: 'http://localhost:5174',
    })).toBe(false);
    expect(isTrustedPrototypeEditorParentEvent({
      source: parentWindow,
      origin: 'http://evil.example',
      parentWindow,
      trustedOrigin: 'http://localhost:5174',
    })).toBe(false);
    expect(isTrustedPrototypeEditorParentEvent({
      source: parentWindow,
      origin: 'http://localhost:5174',
      parentWindow,
      trustedOrigin: '',
    })).toBe(false);
  });
});
