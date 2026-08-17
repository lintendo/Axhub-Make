import { describe, expect, it } from 'vitest';

import {
  createPrototypePlaceholderSettingsStorageKey,
  readPrototypePlaceholderSettings,
  writePrototypePlaceholderSettings,
} from './prototypePlaceholderSettingsStorage';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('prototype placeholder settings storage', () => {
  it('builds a scoped key from project, prototype path, and scene', () => {
    const key = createPrototypePlaceholderSettingsStorageKey([
      '/tmp/axhub-project',
      'untitled',
      'src/prototypes/untitled/index.tsx',
      'placeholder-start',
      'design',
    ]);

    expect(key).toBe(
      'axhub:prototype-placeholder-settings:v1:%2Ftmp%2Faxhub-project:untitled:src%2Fprototypes%2Funtitled%2Findex.tsx:placeholder-start:design',
    );
  });

  it('round-trips page design and document settings without dropping scene-specific fields', () => {
    const storage = new MemoryStorage();
    const key = createPrototypePlaceholderSettingsStorageKey(['project', 'prototype', 'page']);

    writePrototypePlaceholderSettings(storage, key, {
      prototypeGenerationCount: 3,
      prototypeNeedsRequirementsAnalysis: true,
      selectedThemeName: 'mobile-theme',
      imageStartParams: {
        size: '1024x1536',
        quality: 'high',
        output_format: 'png',
        background: 'transparent',
        n: 4,
        disable_prompt_optimization: true,
      },
      documentFormat: 'html',
      documentHtmlVisualSpec: 'kami',
      documentUsePrdPlanning: true,
      selectedDocumentTemplateName: 'write-prd.md',
    });

    expect(readPrototypePlaceholderSettings(storage, key)).toEqual({
      prototypeGenerationCount: 3,
      prototypeNeedsRequirementsAnalysis: true,
      selectedThemeName: 'mobile-theme',
      imageStartParams: {
        size: '1024x1536',
        quality: 'high',
        output_format: 'png',
        background: 'transparent',
        n: 4,
        disable_prompt_optimization: true,
      },
      documentFormat: 'html',
      documentHtmlVisualSpec: 'kami',
      documentUsePrdPlanning: true,
      selectedDocumentTemplateName: 'write-prd.md',
    });
  });

  it('ignores invalid stored values instead of restoring broken settings', () => {
    const storage = new MemoryStorage();
    const key = createPrototypePlaceholderSettingsStorageKey(['project']);
    storage.setItem(key, JSON.stringify({
      prototypeGenerationCount: 20,
      prototypeNeedsRequirementsAnalysis: 'yes',
      selectedThemeName: 123,
      imageStartParams: {
        size: 'bad-size',
        quality: 'ultra',
        output_format: 'gif',
        background: 'blue',
        n: 100,
        disable_prompt_optimization: 'true',
      },
      documentFormat: 'pdf',
      documentHtmlVisualSpec: 1,
      documentUsePrdPlanning: null,
      selectedDocumentTemplateName: {},
    }));

    expect(readPrototypePlaceholderSettings(storage, key)).toEqual({});
  });
});
