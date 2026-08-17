import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMakeClientMarkerPath, getProjectExportsDir, getProjectMetadataPath, getProjectRegistryPath, } from '../projectCore/index.ts';
import { startMakeServer } from '../index.ts';
vi.mock('node:child_process', async (importActual) => {
    const actual = await importActual();
    return {
        ...actual,
        execFileSync: vi.fn(() => Buffer.from('')),
    };
});
const tempRoots = [];
function createTempRoot(prefix = 'axhub-export-make-api-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}
function writeFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}
function writeJson(filePath, value) {
    writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
function writeProjectMetadata(projectRoot) {
    const sourceFile = path.join(projectRoot, 'src/prototypes/home/index.tsx');
    writeFile(sourceFile, 'export default function Home() { return null; }\n');
    writeJson(getMakeClientMarkerPath(projectRoot), {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        project: { id: 'figma-client', name: 'Figma Client' },
    });
    writeJson(path.join(projectRoot, 'package.json'), {
        scripts: {
            dev: 'vite',
            'metadata:sync': 'node scripts/sync-project-metadata.mjs',
        },
    });
    writeJson(getProjectMetadataPath(projectRoot), {
        schemaVersion: 1,
        project: { id: 'figma-client', name: 'Figma Client' },
        resources: {
            prototypes: [
                {
                    id: 'home',
                    name: 'home',
                    title: 'Home',
                    clientUrl: 'http://localhost:3000/home',
                    filePath: 'src/prototypes/home/index.tsx',
                    artifacts: {
                        figma: {
                            canvasFigPath: '.axhub/make/artifacts/figma/home/canvas.fig',
                            metaPath: '.axhub/make/artifacts/figma/home/meta.json',
                            aiChatPath: '.axhub/make/artifacts/figma/home/ai_chat.json',
                            codeManifestPath: '.axhub/make/artifacts/figma/home/canvas.code-manifest.json',
                            imagesDir: '.axhub/make/artifacts/figma/home/images',
                            manifestPath: '.axhub/make/artifacts/figma/home/manifest.json',
                        },
                    },
                },
            ],
            docs: [],
            themes: [],
            data: [],
            templates: [],
        },
        navigation: { prototypes: ['home'], docs: [] },
        orders: { themes: [], data: [], templates: [] },
        capabilities: {
            quickEdit: true,
            quickEditMode: 'clientRuntime',
            figmaExport: true,
            axureExport: true,
            localExports: { html: false, make: false },
        },
    });
}
function writeCompleteFigmaArtifact(projectRoot, overrides = {}) {
    const artifactDir = path.join(projectRoot, '.axhub/make/artifacts/figma/home');
    writeFile(path.join(artifactDir, 'canvas.fig'), Buffer.from('FIGDATA'));
    writeJson(path.join(artifactDir, 'meta.json'), {
        file_name: overrides.fileName || 'Home Export',
        exported_at: '2026-05-01T00:00:00.000Z',
    });
    writeJson(path.join(artifactDir, 'ai_chat.json'), {});
    writeJson(path.join(artifactDir, 'canvas.code-manifest.json'), {});
    writeJson(path.join(artifactDir, 'manifest.json'), {});
    writeFile(path.join(artifactDir, 'images/icon.png'), Buffer.from('image'));
}
async function startTestServer(projectRoot) {
    return startMakeServer({
        projectRoot,
        host: 'localhost',
        port: 0,
        adminRoot: path.join(projectRoot, 'missing-admin'),
        registryPath: getProjectRegistryPath(createTempRoot('axhub-export-make-registry-')),
    });
}
afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('make-server Figma Make export API', () => {
    it('probes Figma artifacts from .axhub metadata and exposes effective make export capability', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot);
        writeCompleteFigmaArtifact(projectRoot);
        const server = await startTestServer(projectRoot);
        try {
            const probeResponse = await fetch(`${server.origin}/api/export-make?path=prototypes/home&probe=1`);
            const probe = await probeResponse.json();
            expect(probeResponse.status).toBe(200);
            expect(probe).toMatchObject({
                ok: true,
                path: 'prototypes/home',
                hasMakeAssets: true,
                lastExportedAt: '2026-05-01T00:00:00.000Z',
                fileName: 'Home Export.fig',
                hasCanvasFig: true,
                hasMetaJson: true,
                hasAiChat: true,
                hasManifest: true,
                hasImagesDir: true,
                imageCount: 1,
                hasDriftRisk: false,
                driftReasons: [],
            });
            const resources = await fetch(`${server.origin}/api/projects/figma-client/resources`).then((response) => response.json());
            expect(resources.capabilities.localExports).toEqual({
                html: false,
                make: true,
            });
        }
        finally {
            await server.close();
        }
    });
    it('returns a repair prompt when required Figma artifacts are missing', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot);
        writeJson(path.join(projectRoot, '.axhub/make/artifacts/figma/home/meta.json'), { file_name: 'Home Export' });
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(`${server.origin}/api/export-make?path=prototypes/home`);
            const body = await response.json();
            expect(response.status).toBe(409);
            expect(body).toMatchObject({
                hasMakeAssets: false,
                fileName: 'Home Export.fig',
            });
            expect(body.prompt).toContain('https://github.com/lintendo/Axhub-Skills/blob/main/skills/react-to-figma-make/SKILL.md');
            expect(body.prompt).toContain('.axhub/make/artifacts/figma/home/canvas.fig');
            expect(body.prompt).toContain('/api/export-make?path=prototypes/home');
            const promptResponse = await fetch(`${server.origin}/api/export-make?path=prototypes/home&prompt=1`);
            const promptBody = await promptResponse.json();
            expect(promptResponse.status).toBe(200);
            expect(promptBody).toMatchObject({
                ok: true,
                hasMakeAssets: false,
                fileName: 'Home Export.fig',
            });
            expect(promptBody.prompt).toContain('目标产物目录：`.axhub/make/artifacts/figma/home/`');
        }
        finally {
            await server.close();
        }
    });
    it('blocks stale Make export shells before downloading the .fig file', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot);
        writeCompleteFigmaArtifact(projectRoot);
        const sourceDir = path.join(projectRoot, 'src/prototypes/home');
        writeFile(path.join(sourceDir, 'src/App.tsx'), 'export default function App() { return null; }\n');
        const oldTime = new Date('2026-05-01T00:00:00.000Z');
        const newTime = new Date('2026-05-02T00:00:00.000Z');
        fs.utimesSync(path.join(sourceDir, 'src/App.tsx'), oldTime, oldTime);
        fs.utimesSync(path.join(sourceDir, 'index.tsx'), newTime, newTime);
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(`${server.origin}/api/export-make?path=prototypes/home`);
            const body = await response.json();
            expect(response.status).toBe(409);
            expect(body).toMatchObject({
                hasMakeAssets: true,
                hasDriftRisk: true,
            });
            expect(body.driftReasons.join('\n')).toContain('index.tsx');
        }
        finally {
            await server.close();
        }
    });
    it('runs pack and inspect, records the export, and streams the .fig download', async () => {
        const projectRoot = createTempRoot();
        writeProjectMetadata(projectRoot);
        writeCompleteFigmaArtifact(projectRoot, { fileName: 'Home Export.fig' });
        const execFileSyncMock = vi.mocked(execFileSync);
        execFileSyncMock.mockClear();
        const server = await startTestServer(projectRoot);
        try {
            const response = await fetch(`${server.origin}/api/export-make?path=prototypes/home`);
            const body = await response.text();
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('application/octet-stream');
            expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''Home%20Export.fig");
            expect(body).toBe('FIGDATA');
            expect(execFileSyncMock).toHaveBeenCalledTimes(2);
            expect(execFileSyncMock.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['pack', '--fig']));
            expect(execFileSyncMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(['inspect', '--fig']));
            const exportRecords = fs.readdirSync(getProjectExportsDir(projectRoot));
            expect(exportRecords.length).toBeGreaterThan(0);
            const latestRecord = JSON.parse(fs.readFileSync(path.join(getProjectExportsDir(projectRoot), exportRecords[0]), 'utf8'));
            expect(latestRecord).toMatchObject({
                projectId: 'figma-client',
                resourceId: 'home',
                operationType: 'make.export',
                status: 'success',
            });
        }
        finally {
            await server.close();
        }
    });
});
