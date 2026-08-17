import { describe, expect, it } from 'vitest';
import { getEmbeddedViteWatchIgnored } from './viteDevServer.ts';
describe('embedded Vite dev middleware', () => {
    it('watches annotation sources while ignoring generated and vendor output in dev mode', () => {
        const ignored = getEmbeddedViteWatchIgnored();
        expect(ignored).toEqual(expect.arrayContaining([
            '**/automation-reports/**',
            '**/client/**',
            '**/midscene/**',
            '**/node_modules/**',
            '**/vendor/**',
        ]));
        expect(ignored).not.toContain('**/annotation-source.json');
    });
});
