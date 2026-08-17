import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vite next/image compatibility alias', () => {
  it('routes the ACP Next image import to the native image adapter', () => {
    const viteConfigSource = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');

    expect(viteConfigSource).toContain(
      "{ find: /^next\\/image$/, replacement: path.resolve(__dirname, 'src/compat/nextImage.tsx') }",
    );
  });
});
