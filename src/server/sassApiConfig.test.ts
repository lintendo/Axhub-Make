import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..', '..');

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

describe('Vite Sass API configuration', () => {
  it('uses the stable modern Sass API for Make builds', () => {
    const configSources = [
      'vite.config.ts',
      'src/server/onDemandBuild.ts',
      'client/vite.config.ts',
    ].map(readSource);

    for (const source of configSources) {
      expect(source).toContain("scss: { api: 'modern'");
      expect(source).toContain("sass: { api: 'modern'");
      expect(source).not.toContain("'modern-compiler'");
    }
  });
});
