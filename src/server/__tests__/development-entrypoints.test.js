import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
describe('Make development entry points', () => {
    it('exposes only the integrated management development server', () => {
        const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
        const serverDev = packageJson.scripts?.['server:dev'];
        expect(serverDev).toContain('src/server/cli.ts -- --dev');
        expect(serverDev).not.toContain('AXHUB_ONLINE_BASE_URL=');
        expect(packageJson.scripts).not.toHaveProperty('admin:dev');
        expect(packageJson.scripts?.['admin:build']).toContain('vite build');
    });
});
