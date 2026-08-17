import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, startTestServer, writeJson, writeProjectMetadata, } from './projects-api.helpers';
async function startRegisteredTestServer(projectRoot, registryHome = createTempRoot('axhub-ai-image-obsolete-home-'), options = {}) {
    const server = await startTestServer(projectRoot, registryHome, options);
    try {
        const projectId = String(JSON.parse(fs.readFileSync(path.join(projectRoot, '.axhub', 'make', 'project.json'), 'utf8'))?.project?.id || path.basename(projectRoot));
        await registerProject(server.origin, projectRoot, projectId, projectId);
        return server;
    }
    catch (error) {
        await server.close();
        throw error;
    }
}
afterEach(() => {
    vi.restoreAllMocks();
    cleanupProjectApiTestRoots();
});
describe('obsolete AI image APIs', () => {
    it('returns 404 for deleted image history and image generation endpoints', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot, {
            project: { id: 'ai-image-obsolete', name: 'AI Image Obsolete' },
            resourceWriteTargets: {
                prototypes: { type: 'project-relative-path', path: 'src/prototypes' },
            },
        });
        writeJson(path.join(projectRoot, '.axhub', 'make', 'axhub.config.json'), {
            server: { host: 'localhost', allowLAN: true },
        });
        const server = await startRegisteredTestServer(projectRoot);
        try {
            const [historyGet, historyPut, generate] = await Promise.all([
                fetch(`${server.origin}/api/ai-image/history?targetPath=prototypes/home`),
                fetch(`${server.origin}/api/ai-image/history?targetPath=prototypes/home`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tasks: [], images: {} }),
                }),
                fetch(`${server.origin}/api/ai-image/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: '一张产品主视觉',
                        params: { n: 1 },
                    }),
                }),
            ]);
            expect(historyGet.status).toBe(404);
            expect(historyPut.status).toBe(404);
            expect(generate.status).toBe(404);
            expect(fs.existsSync(path.join(projectRoot, 'src/prototypes/home/.spec/ai-image-history.json'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
});
