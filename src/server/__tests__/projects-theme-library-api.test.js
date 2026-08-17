import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESIGN_KNOWLEDGE_MANIFEST_URL } from '../designKnowledgeThemeCatalog.ts';
import { getProjectMetadataPath } from '../projectCore/index.ts';
import { cleanupProjectApiTestRoots, createTempRoot, registerProject, setActiveProject, startTestServer, writeProjectMetadata, } from './projects-api.helpers';
const PUBLICATION_BASE = 'https://lintendo.github.io/Make-Template/knowledge/versions/api-test-v1';
const DESKTOP_INDEX_URL = `${PUBLICATION_BASE}/indexes/desktop.json`;
const MOBILE_INDEX_URL = `${PUBLICATION_BASE}/indexes/mobile.json`;
const MOBILE_PACKAGE_URL = `${PUBLICATION_BASE}/packages/mobile-kit.tgz`;
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    cleanupProjectApiTestRoots();
});
function sha256(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function serialize(value) {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}
function createThemePackage() {
    const source = createTempRoot('axhub-theme-package-source-');
    fs.writeFileSync(path.join(source, 'index.tsx'), 'export default function MobileKit() { return null; }\n');
    fs.writeFileSync(path.join(source, 'theme.json'), '{"name":"Mobile Kit"}\n');
    const archive = path.join(createTempRoot('axhub-theme-package-archive-'), 'mobile-kit.tgz');
    execFileSync('tar', ['--format=ustar', '-czf', archive, '-C', source, 'index.tsx', 'theme.json']);
    return fs.readFileSync(archive);
}
const THEME_PACKAGE_BYTES = createThemePackage();
function createRecord(params) {
    const publishable = Boolean(params.packageBytes);
    return {
        schemaVersion: 1,
        id: params.id,
        slug: params.id,
        platforms: [params.platform],
        searchable: true,
        reviewStatus: publishable ? 'approved' : 'deferred',
        publishable,
        reasons: publishable ? [] : ['package-unauthorized'],
        title: params.id === 'desktop-kit' ? 'Desktop Kit' : 'Mobile Kit',
        tags: ['简洁', '消费品牌'],
        annotation: { industries: ['ecommerce-retail'], productTypes: ['consumer-app'], styles: ['clean'] },
        artifacts: {
            designMdUrl: `${PUBLICATION_BASE}/designs/${params.id}/DESIGN.md`,
            designMdHash: `sha256:${'1'.repeat(64)}`,
            previewUrl: `${PUBLICATION_BASE}/previews/${params.id}/index.html`,
            previewHash: `sha256:${'2'.repeat(64)}`,
            previewImageUrl: `${PUBLICATION_BASE}/previews/${params.id}/assets/cover.webp`,
            previewImageHash: `sha256:${'3'.repeat(64)}`,
            ...(params.packageBytes ? { packageUrl: MOBILE_PACKAGE_URL, packageHash: sha256(params.packageBytes) } : {}),
        },
        text: 'large search text',
        tokens: ['large', 'tokens'],
    };
}
function mockKnowledgeResponses() {
    const packageBytes = THEME_PACKAGE_BYTES;
    const desktop = {
        schemaVersion: 1,
        taxonomyVersion: '1.0.0',
        searchContractVersion: '1.0.0',
        tokenizationVersion: 'nfkc-intl-segmenter-v1',
        platform: 'desktop',
        records: [createRecord({ id: 'desktop-kit', platform: 'desktop' })],
        postings: {},
    };
    const mobile = {
        schemaVersion: 1,
        taxonomyVersion: '1.0.0',
        searchContractVersion: '1.0.0',
        tokenizationVersion: 'nfkc-intl-segmenter-v1',
        platform: 'mobile',
        records: [createRecord({ id: 'mobile-kit', platform: 'mobile', packageBytes })],
        postings: {},
    };
    const desktopBytes = serialize(desktop);
    const mobileBytes = serialize(mobile);
    const manifest = {
        schemaVersion: 1,
        taxonomyVersion: '1.0.0',
        searchContractVersion: '1.0.0',
        tokenizationVersion: 'nfkc-intl-segmenter-v1',
        minReaderVersion: '1.0.0',
        maxReaderVersionExclusive: '2.0.0',
        sourceCommits: { runtime: 'a'.repeat(40), 'axhub-make': 'b'.repeat(40) },
        records: [],
        indexes: {
            desktop: { url: DESKTOP_INDEX_URL, hash: sha256(desktopBytes), count: 1 },
            mobile: { url: MOBILE_INDEX_URL, hash: sha256(mobileBytes), count: 1 },
        },
    };
    const responses = new Map([
        [DESIGN_KNOWLEDGE_MANIFEST_URL, serialize(manifest)],
        [DESKTOP_INDEX_URL, desktopBytes],
        [MOBILE_INDEX_URL, mobileBytes],
        [MOBILE_PACKAGE_URL, packageBytes],
    ]);
    const originalFetch = globalThis.fetch;
    const remoteRequests = [];
    vi.stubGlobal('fetch', vi.fn(async (input, init) => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
        if (url.startsWith('http://localhost:'))
            return originalFetch(input, init);
        remoteRequests.push(url);
        const body = responses.get(url);
        return body
            ? new Response(body, { status: 200 })
            : new Response(`Unexpected URL: ${url}`, { status: 404 });
    }));
    return { remoteRequests };
}
function scopeProjectApiUrl(projectRoot, rawUrl) {
    const metadata = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8'));
    const url = new URL(rawUrl);
    url.searchParams.set('projectId', metadata.project.id);
    return url.toString();
}
function writeThemeProject(projectRoot, id = 'theme-library-client') {
    writeProjectMetadata(projectRoot, {
        project: { id, name: id },
        resources: { prototypes: [], docs: [], themes: [], data: [], templates: [] },
        navigation: { prototypes: [], docs: [] },
        orders: { themes: [], data: [], templates: [] },
        capabilities: {
            quickEdit: true,
            quickEditMode: 'clientRuntime',
            figmaExport: true,
            axureExport: true,
            multiDevicePreview: true,
            resourceWrites: { themeImport: true },
        },
        resourceWriteTargets: { themes: { path: 'content/themes' } },
    });
}
async function startThemeServer(projectRoot) {
    const projectId = JSON.parse(fs.readFileSync(getProjectMetadataPath(projectRoot), 'utf8')).project.id;
    const server = await startTestServer(projectRoot);
    await registerProject(server.origin, projectRoot, projectId);
    await setActiveProject(server.origin, projectId);
    return server;
}
async function fetchJson(url, init) {
    const response = await fetch(url, init);
    return { status: response.status, body: await response.json() };
}
describe('make-server Design Knowledge theme library APIs', () => {
    it('lists the selected platform without reading the legacy local theme index', async () => {
        const projectRoot = createTempRoot();
        writeThemeProject(projectRoot);
        const { remoteRequests } = mockKnowledgeResponses();
        const server = await startThemeServer(projectRoot);
        try {
            const url = scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library?platform=mobile`);
            const listed = await fetchJson(url);
            expect(listed).toMatchObject({
                status: 200,
                body: { schemaVersion: 1, platform: 'mobile', total: 1, stale: false },
            });
            expect(listed.body.designSystems).toEqual([expect.objectContaining({
                    id: 'mobile-kit',
                    platform: 'mobile',
                    canDirectImport: true,
                })]);
            expect(remoteRequests).not.toEqual(expect.arrayContaining([expect.stringContaining('design-systems.json')]));
            expect(JSON.stringify(listed.body)).not.toContain('packageUrl');
        }
        finally {
            await server.close();
        }
    });
    it('rejects invalid platforms before loading the remote catalog', async () => {
        const projectRoot = createTempRoot();
        writeThemeProject(projectRoot);
        const { remoteRequests } = mockKnowledgeResponses();
        const server = await startThemeServer(projectRoot);
        try {
            const listed = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library?platform=tablet`));
            expect(listed).toMatchObject({ status: 400, body: { code: 'THEME_LIBRARY_PLATFORM_INVALID' } });
            expect(remoteRequests).toEqual([]);
        }
        finally {
            await server.close();
        }
    });
    it('rejects imports for catalog records without an authorized package', async () => {
        const projectRoot = createTempRoot();
        writeThemeProject(projectRoot);
        mockKnowledgeResponses();
        const server = await startThemeServer(projectRoot);
        try {
            const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ themeId: 'desktop-kit', platform: 'desktop' }),
            });
            expect(imported).toMatchObject({ status: 409, body: { code: 'THEME_LIBRARY_NOT_IMPORTABLE' } });
            expect(fs.existsSync(path.join(projectRoot, 'content/themes/desktop-kit'))).toBe(false);
        }
        finally {
            await server.close();
        }
    });
    it('imports a verified package selected only by theme id and platform', async () => {
        const projectRoot = createTempRoot();
        writeThemeProject(projectRoot, 'theme-package-client');
        const { remoteRequests } = mockKnowledgeResponses();
        const server = await startThemeServer(projectRoot);
        try {
            const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    themeId: 'mobile-kit',
                    platform: 'mobile',
                    packageUrl: 'https://attacker.example/evil.tgz',
                }),
            });
            expect(imported).toMatchObject({
                status: 200,
                body: {
                    success: true,
                    projectId: 'theme-package-client',
                    themeId: 'mobile-kit',
                    folderName: 'mobile-kit',
                    filePath: 'content/themes/mobile-kit/index.tsx',
                },
            });
            expect(fs.readFileSync(path.join(projectRoot, 'content/themes/mobile-kit/index.tsx'), 'utf8')).toContain('MobileKit');
            expect(remoteRequests).toContain(MOBILE_PACKAGE_URL);
            expect(remoteRequests).not.toContain('https://attacker.example/evil.tgz');
        }
        finally {
            await server.close();
        }
    });
    it('does not accept the legacy designSystemId import contract', async () => {
        const projectRoot = createTempRoot();
        writeThemeProject(projectRoot);
        mockKnowledgeResponses();
        const server = await startThemeServer(projectRoot);
        try {
            const imported = await fetchJson(scopeProjectApiUrl(projectRoot, `${server.origin}/api/theme-library/import`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ designSystemId: 'desktop-kit' }),
            });
            expect(imported).toMatchObject({ status: 400, body: { code: 'THEME_LIBRARY_THEME_ID_REQUIRED' } });
        }
        finally {
            await server.close();
        }
    });
});
