import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { backfillMakeClientPrototypePreviewLinks } from './makeClientRuntimeLinks';
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-runtime-links-'));
afterAll(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
});
function backfillFor(runtimeOrigin, headers) {
    return backfillMakeClientPrototypePreviewLinks([{ id: 'home', clientUrl: '/prototypes/home' }], projectRoot, runtimeOrigin, { headers })[0]?.clientUrl;
}
describe('Make client runtime links', () => {
    it('keeps loopback runtime links for loopback admin requests', () => {
        expect(backfillFor('http://localhost:51720', { host: 'localhost:53817' }))
            .toBe('http://localhost:51720/prototypes/home');
    });
    it('keeps non-loopback runtime origins unchanged', () => {
        expect(backfillFor('https://preview.example.test:51720', { host: '192.168.1.42:53817' }))
            .toBe('https://preview.example.test:51720/prototypes/home');
    });
    it('prefers the first forwarded host when adapting loopback runtime links', () => {
        expect(backfillFor('http://127.0.0.1:51720', {
            host: 'localhost:53817',
            'x-forwarded-host': 'make.lan:53817, proxy.internal',
        })).toBe('http://make.lan:51720/prototypes/home');
    });
    it('supports bracketed IPv6 LAN request hosts', () => {
        expect(backfillFor('http://[::1]:51720', { host: '[fd00::42]:53817' }))
            .toBe('http://[fd00::42]:51720/prototypes/home');
    });
});
