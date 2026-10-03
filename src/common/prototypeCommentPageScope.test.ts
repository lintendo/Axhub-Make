import { describe, expect, it } from 'vitest';

import {
  buildInternalPrototypeCommentPageScope,
  buildSafeVoicePrototypeResourcePath,
} from './prototypeCommentPageScope';

describe('prototype comment page scope', () => {
  it('builds one canonical multipage scope from a safe prototype id', () => {
    expect(buildInternalPrototypeCommentPageScope('home', 'dashboard'))
      .toBe('prototypes/home::page::dashboard');
    expect(buildInternalPrototypeCommentPageScope('prototypes/home', 'dashboard'))
      .toBe('prototypes/home::page::dashboard');
  });

  it('uses only a logical prototype id for voice model resource context', () => {
    expect(buildSafeVoicePrototypeResourcePath({
      resourceId: 'home-page',
      absoluteFilePath: '/Users/person/private/client/src/prototypes/home-page/index.tsx',
    })).toBe('prototypes/home-page');
    expect(buildSafeVoicePrototypeResourcePath({
      name: 'checkout',
      absoluteFilePath: 'C:\\private\\client\\src\\prototypes\\checkout\\index.tsx',
    })).toBe('prototypes/checkout');
  });

  it('does not derive voice resource context from absolute or unsafe paths', () => {
    expect(buildSafeVoicePrototypeResourcePath({
      absoluteFilePath: '/Users/person/private/client/src/prototypes/home/index.tsx',
    })).toBe('');
    expect(buildSafeVoicePrototypeResourcePath({ resourceId: '../private' })).toBe('');
    expect(buildSafeVoicePrototypeResourcePath({ name: 'Home Page' })).toBe('');
  });
});
