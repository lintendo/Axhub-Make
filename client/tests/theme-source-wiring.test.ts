import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const themesRoot = path.join(appRoot, 'src/themes');

function themeDirs() {
  return fs
    .readdirSync(themesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

describe('generated theme source wiring', () => {
  it('passes theme.json source metadata into DesignMdBatchShowcase for collected themes', () => {
    const missing: string[] = [];

    for (const themeName of themeDirs()) {
      const themeJsonPath = path.join(themesRoot, themeName, 'theme.json');
      const indexPath = path.join(themesRoot, themeName, 'implementations/react/index.tsx');
      if (!fs.existsSync(themeJsonPath) || !fs.existsSync(indexPath)) continue;

      const themeJson = JSON.parse(fs.readFileSync(themeJsonPath, 'utf8'));
      if (!themeJson.source) continue;

      const source = fs.readFileSync(indexPath, 'utf8');
      const passesSourceDirectly = source.includes('source: themeData.source');
      const passesThemeThroughSharedAdapter = source.includes('createThemeShowcaseConfig')
        && source.includes('theme: themeData');
      if (!passesSourceDirectly && !passesThemeThroughSharedAdapter) {
        missing.push(themeName);
      }
    }

    expect(missing).toEqual([]);
  });
});
