import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rewriteMobileThemeEntry, syncMobileThemeScreenshotWiring } from './sync-mobile-theme-screenshot-wiring.mjs';

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

  it('is idempotent for an already-wired entry', () => {
    const source = `
import productScreenshot01 from './assets/product-screenshot-01.webp?url';
import productScreenshot02 from './assets/product-screenshot-02.webp?url';
import productScreenshot03 from './assets/product-screenshot-03.webp?url';
const config = { previewImages: [
  { type: 'product-screenshot', url: productScreenshot01 },
  { type: 'product-screenshot', url: productScreenshot02 },
  { type: 'product-screenshot', url: productScreenshot03 },
] };
`;
    expect(rewriteMobileThemeEntry(source, 'already-wired.tsx')).toBe(source);
  });

  it('rejects incomplete mixed screenshot imports', () => {
    const source = `
import productScreenshot01 from './assets/product-screenshot-01.webp?url';
import previewAsset0 from './assets/cover.svg?url';
const config = { previewImages: [{ type: 'product-screenshot', url: productScreenshot01 }] };
`;
    expect(() => rewriteMobileThemeEntry(source, 'mixed.tsx')).toThrow(/incomplete|expected/);
  });

  it('edits only config.previewImages, preserving unrelated.previewImages', () => {
    const source = `
const unrelated = { previewImages: ['leave this alone'] };
const config: BatchShowcaseConfig = {
  previewImages: [{ type: display.previewImages[0].type, url: previewAsset0 }],
};
`;
    const output = rewriteMobileThemeEntry(`import previewAsset0 from './assets/cover.svg?url';\n${source}`, 'scoped.tsx');
    expect(output).toContain("previewImages: ['leave this alone']");
    expect(output).toContain("{ type: 'product-screenshot', url: productScreenshot01 }");
  });

  it('reports an already-wired theme unchanged in --check mode', () => {
    const themesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-'));
    const themeDir = path.join(themesRoot, 'fixture-mobile');
    fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
    for (let index = 1; index <= 3; index += 1) fs.writeFileSync(path.join(themeDir, 'assets', `product-screenshot-0${index}.webp`), 'x');
    fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify({ assets: { productScreenshots: [1, 2, 3].map(index => ({ type: 'product-screenshot', path: `assets/product-screenshot-0${index}.webp` })) } }));
    fs.writeFileSync(path.join(themeDir, 'index.tsx'), `import productScreenshot01 from './assets/product-screenshot-01.webp?url';\nimport productScreenshot02 from './assets/product-screenshot-02.webp?url';\nimport productScreenshot03 from './assets/product-screenshot-03.webp?url';\nconst config = { previewImages: [{ type: 'product-screenshot', url: productScreenshot01 }, { type: 'product-screenshot', url: productScreenshot02 }, { type: 'product-screenshot', url: productScreenshot03 }] };`);
    expect(syncMobileThemeScreenshotWiring({ themesRoot, check: true })).toEqual([{ theme: 'fixture-mobile', status: 'unchanged' }]);
  });
});
