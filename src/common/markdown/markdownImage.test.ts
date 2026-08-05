import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseAxhubImageWidth,
  resolveMarkdownImageSrc,
  resolvePrototypeSpecAssetUrl,
} from './markdownImage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseAxhubImageWidth', () => {
  it('removes the axw query while preserving other image URL parts', () => {
    expect(parseAxhubImageWidth('./assets/hero.png?axw=320&fit=cover#preview')).toEqual({
      cleanSrc: './assets/hero.png?fit=cover#preview',
      width: 320,
    });
  });
});

describe('resolveMarkdownImageSrc', () => {
  it('routes project document images through the document asset endpoint', () => {
    vi.stubGlobal('window', { location: { origin: 'http://axhub.local', pathname: '/' } });

    expect(resolveMarkdownImageSrc(
      './assets/hero.png',
      '/api/projects/make-project/document-content?path=src%2Fresources%2Fguide.md',
    )).toBe(
      '/api/projects/make-project/document-asset?path=src%2Fresources%2Fguide.md&asset=.%2Fassets%2Fhero.png',
    );
  });
});

describe('resolvePrototypeSpecAssetUrl', () => {
  it('routes relative prototype spec assets through the content endpoint', () => {
    expect(resolvePrototypeSpecAssetUrl(
      '../assets/hero.png',
      '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Foverview.md',
    )).toBe('/api/projects/make-project/prototypes/home/spec/content?path=assets%2Fhero.png');
  });
});
