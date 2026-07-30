import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const { buildMakeProjectMetadata } = await import('../scripts/sync-project-metadata.mjs');

const appRoot = path.resolve(__dirname, '..');
const themeRoot = path.join(appRoot, 'src/themes/kami');

function readThemeFile(relativePath: string) {
  return fs.readFileSync(path.join(themeRoot, relativePath), 'utf8');
}

describe('Kami theme resource entry structure', () => {
  it('ships a theme-local components and templates example without global resource expansion', () => {
    const expectedFiles = [
      'index.tsx',
      'style.css',
      'DESIGN.md',
      'components/PaperButton.tsx',
      'components/EditorialCard.tsx',
      'components/SpecTable.tsx',
      'templates/OnePagerTemplate.tsx',
      'templates/LongDocTemplate.tsx',
      'assets/kami-demo-tesla.png',
    ];

    for (const relativePath of expectedFiles) {
      expect(fs.existsSync(path.join(themeRoot, relativePath)), relativePath).toBe(true);
    }

    const indexSource = readThemeFile('index.tsx');
    expect(indexSource).toContain('@name Kami 紙主题');
    expect(indexSource).toContain('DesignMdBatchShowcase');
    expect(indexSource).toContain('BatchShowcaseConfig');
    expect(indexSource).toContain('BatchShowcaseTab');
    expect(indexSource).toContain('tabs={resourceTabs}');
    expect(indexSource).toContain("from './components/PaperButton'");
    expect(indexSource).toContain("from './components/EditorialCard'");
    expect(indexSource).toContain("from './components/SpecTable'");
    expect(indexSource).toContain("from './templates/OnePagerTemplate'");
    expect(indexSource).toContain("from './templates/LongDocTemplate'");
    expect(indexSource).toContain("label: '组件'");
    expect(indexSource).toContain("label: '模板'");
    expect(indexSource).toContain("from './assets/kami-demo-tesla.png?url'");
    expect(indexSource).not.toContain('<span>src/themes/kami/components/</span>');
    expect(indexSource).not.toContain('<span>src/themes/kami/templates/</span>');
    expect(indexSource).not.toContain('className="kami-theme"');
    expect(indexSource).not.toContain('className="kami-section"');

    for (const relativePath of expectedFiles.filter((file) => file.endsWith('.tsx'))) {
      const source = readThemeFile(relativePath);
      expect(source, relativePath).toContain("import React from 'react'");
      expect(source, relativePath).toContain('export default');
    }

    const styleSource = readThemeFile('style.css');
    expect(styleSource).toContain('--kami-paper');
    expect(styleSource).toContain('--kami-ink-blue');
    expect(styleSource).toContain('font-family');

    const designSource = readThemeFile('DESIGN.md');
    expect(designSource).toContain('**Observed — local source paths:** `index.tsx`, `style.css`, `components/*.tsx`, `templates/*.tsx`');
    expect(designSource).toContain('This is one responsive React/Web theme, not a mobile-theme fork.');
    for (const section of ['## Colors', '## Typography', '## Components', '## Layout', '## Responsive', "## Do's and Don'ts", '## Known Gaps']) {
      expect(designSource).toContain(section);
    }

    const metadata = buildMakeProjectMetadata(appRoot, {
      clientOrigin: 'http://localhost:51720',
    });
    const kamiTheme = metadata.resources.themes.find((item: any) => item.id === 'kami');

    expect(kamiTheme).toMatchObject({
      id: 'kami',
      name: 'kami',
      title: 'Kami 紙主题',
      clientUrl: 'http://localhost:51720/themes/kami',
      sourcePath: 'src/themes/kami',
    });
    expect((metadata.resources as any).components).toBeUndefined();
    expect((metadata.resources as any).templates).toBeUndefined();
  });
});
