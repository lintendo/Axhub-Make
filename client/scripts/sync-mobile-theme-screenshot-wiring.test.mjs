import { describe, expect, it } from 'vitest';
import { rewriteMobileThemeEntry } from './sync-mobile-theme-screenshot-wiring.mjs';

describe('mobile theme screenshot wiring', () => {
  it('replaces only the cover import and previewImages initializer', () => {
    const source = `
import previewAsset0 from './assets/cover.svg?url';
const config = {
  brand: display.brand,
  previewImages: [
    { type: display.previewImages[0].type, url: previewAsset0 }
  ],
  mobilePreview,
};
`;
    const output = rewriteMobileThemeEntry(source, 'fixture.tsx');
    expect(output).toContain("import productScreenshot01 from './assets/product-screenshot-01.webp?url';");
    expect(output).toContain("import productScreenshot03 from './assets/product-screenshot-03.webp?url';");
    expect(output).not.toContain('cover.svg?url');
    expect(output).toContain("{ type: 'product-screenshot', url: productScreenshot01 }");
    expect(output).toContain("{ type: 'product-screenshot', url: productScreenshot03 }");
    expect(output).toContain('mobilePreview,');
  });
});
