import { describe, expect, it } from 'vitest';

import { getPrototypeLocalBasePath } from './localPath';

describe('prototype local base paths', () => {
  it('prefers executable entry paths and strips cross-platform index filenames', () => {
    expect(getPrototypeLocalBasePath({ filePath: 'src/prototypes/home/index.tsx' }))
      .toBe('src/prototypes/home');
    expect(getPrototypeLocalBasePath({ absoluteFilePath: 'C:\\workspace\\src\\prototypes\\home\\index.jsx' }))
      .toBe('C:/workspace/src/prototypes/home');
  });

  it('derives spec-only prototype directories without assuming a resource root', () => {
    expect(getPrototypeLocalBasePath({ specFilePath: 'src/prototypes/home/.spec/spec.html' }))
      .toBe('src/prototypes/home');
    expect(getPrototypeLocalBasePath({ specFilePath: 'content\\prototypes\\home\\.spec\\spec.md' }))
      .toBe('content/prototypes/home');
  });

  it('rejects spec paths that do not identify a prototype directory', () => {
    expect(getPrototypeLocalBasePath({ specFilePath: 'docs/home.md' })).toBe('');
    expect(getPrototypeLocalBasePath({})).toBe('');
  });
});
