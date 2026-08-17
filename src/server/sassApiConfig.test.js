import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const appRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
function readSource(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
describe('Vite Sass API configuration', () => {
    it('uses the stable modern Sass API for Make builds', () => {
        const configSources = [
            'apps/axhub-make/vite.config.ts',
            'apps/axhub-make/src/server/onDemandBuild.ts',
            'apps/axhub-make/client/vite.config.ts',
        ].map(readSource);
        for (const source of configSources) {
            expect(source).toContain("scss: { api: 'modern'");
            expect(source).toContain("sass: { api: 'modern'");
            expect(source).not.toContain("'modern-compiler'");
        }
    });
});
