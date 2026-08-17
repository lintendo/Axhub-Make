import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupProjectApiTestRoots, createTempRoot, scopeProjectApiUrl, startTestServer, writeProjectMetadata, } from './projects-api.helpers.ts';
afterEach(() => {
    cleanupProjectApiTestRoots();
});
describe('resource sidecar directories', () => {
    it('excludes assets directories from the resource sidebar navigation', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot);
        const resourcesDir = path.join(projectRoot, 'src/resources');
        fs.mkdirSync(path.join(resourcesDir, 'board.assets'), { recursive: true });
        fs.writeFileSync(path.join(resourcesDir, 'board.excalidraw'), '{}\n', 'utf8');
        fs.writeFileSync(path.join(resourcesDir, 'board.assets/screenshot.png'), 'png', 'utf8');
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`));
            const body = await response.json();
            const tree = JSON.stringify(body.tree);
            expect(response.status).toBe(200);
            expect(tree).toContain('docs/board.excalidraw');
            expect(tree).not.toContain('board.assets');
            expect(tree).not.toContain('screenshot.png');
        }
        finally {
            await server.close();
        }
    });
});
