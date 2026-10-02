import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('LAN publish toolbar entries', () => {
    it('places fixed HTML and realtime publishing above cloud services', () => {
        const source = readFileSync(resolve(__dirname, './PresentationToolbar.tsx'), 'utf8');
        const lanIndex = source.indexOf('局域网');
        const cloudIndex = source.indexOf('云服务');

        expect(lanIndex).toBeGreaterThan(-1);
        expect(cloudIndex).toBeGreaterThan(lanIndex);
        expect(source).toContain("handleOpenLocalPublishDialog?.('html')");
        expect(source).toContain("handleOpenLocalPublishDialog?.('realtime')");
    });
});
