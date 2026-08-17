import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DESIGN_KNOWLEDGE_MANIFEST_URL, THEME_CATALOG_CACHE_TTL_MS, createDesignKnowledgeThemeCatalog, } from '../designKnowledgeThemeCatalog.ts';
const PUBLICATION_BASE = 'https://lintendo.github.io/Make-Template/knowledge/versions/test-v1';
const DESKTOP_INDEX_URL = `${PUBLICATION_BASE}/indexes/desktop.json`;
const MOBILE_INDEX_URL = `${PUBLICATION_BASE}/indexes/mobile.json`;
function serialize(value) {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}
function hash(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function createIndexRecord(params) {
    const publishable = params.publishable === true;
    return {
        schemaVersion: 1,
        id: params.id,
        slug: params.id,
        platforms: [params.platform],
        searchable: true,
        reviewStatus: publishable ? 'approved' : 'deferred',
        publishable,
        reasons: publishable ? [] : ['package-unauthorized'],
        title: params.id === 'alpha' ? 'Alpha Design' : params.id,
        tags: ['消费品牌', '营销网站', '简洁'],
        annotation: {
            industries: ['ecommerce-retail'],
            productTypes: ['marketing-site'],
            styles: ['clean'],
        },
        artifacts: {
            designMdUrl: `${PUBLICATION_BASE}/designs/${params.id}/DESIGN.md`,
            designMdHash: `sha256:${'1'.repeat(64)}`,
            previewUrl: `${PUBLICATION_BASE}/previews/${params.id}/index.html`,
            previewHash: `sha256:${'2'.repeat(64)}`,
            ...(params.cover === false ? {} : {
                previewImageUrl: `${PUBLICATION_BASE}/previews/${params.id}/assets/cover.webp`,
                previewImageHash: `sha256:${'3'.repeat(64)}`,
            }),
            ...(publishable ? {
                packageUrl: `${PUBLICATION_BASE}/packages/${params.id}.tgz`,
                packageHash: `sha256:${'4'.repeat(64)}`,
            } : {}),
        },
        text: `large searchable text for ${params.id}`,
        tokens: ['large', 'search', 'tokens'],
    };
}
function createFixture(params = {}) {
    const desktop = {
        schemaVersion: 1,
        taxonomyVersion: '1.0.0',
        searchContractVersion: '1.0.0',
        tokenizationVersion: 'nfkc-intl-segmenter-v1',
        platform: 'desktop',
        records: [
            createIndexRecord({ id: 'alpha', platform: 'desktop' }),
            createIndexRecord({ id: 'no-cover', platform: 'desktop', cover: false }),
        ],
        postings: {},
    };
    const mobile = {
        schemaVersion: 1,
        taxonomyVersion: '1.0.0',
        searchContractVersion: '1.0.0',
        tokenizationVersion: 'nfkc-intl-segmenter-v1',
        platform: 'mobile',
        records: [createIndexRecord({ id: 'alpha-mobile', platform: 'mobile' })],
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
        sourceCommits: {
            runtime: 'a'.repeat(40),
            'axhub-make': 'b'.repeat(40),
        },
        records: [],
        indexes: {
            desktop: {
                url: DESKTOP_INDEX_URL,
                hash: params.corruptDesktopHash ? `sha256:${'0'.repeat(64)}` : hash(desktopBytes),
                count: desktop.records.length,
            },
            mobile: {
                url: MOBILE_INDEX_URL,
                hash: hash(mobileBytes),
                count: mobile.records.length,
            },
        },
    };
    return {
        responses: new Map([
            [DESIGN_KNOWLEDGE_MANIFEST_URL, serialize(manifest)],
            [DESKTOP_INDEX_URL, desktopBytes],
            [MOBILE_INDEX_URL, mobileBytes],
        ]),
    };
}
function createFixtureFetch(responses) {
    return vi.fn(async (input) => {
        const url = String(input);
        const body = responses.get(url);
        return body
            ? new Response(Buffer.from(body).toString('utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } })
            : new Response(`Unexpected URL: ${url}`, { status: 404 });
    });
}
describe('Design Knowledge theme catalog', () => {
    it('loads a complete platform index and maps compact theme cards including missing covers', async () => {
        const fixture = createFixture();
        const fetch = createFixtureFetch(fixture.responses);
        const catalog = createDesignKnowledgeThemeCatalog({ fetch, now: () => 1_000 });
        const result = await catalog.load('desktop');
        expect(result).toMatchObject({ platform: 'desktop', total: 2, stale: false });
        expect(result.designSystems).toEqual([
            expect.objectContaining({
                id: 'alpha',
                platform: 'desktop',
                title: 'Alpha Design',
                description: '电商与零售 · 营销网站 · 简洁',
                previewUrl: `${PUBLICATION_BASE}/previews/alpha/index.html`,
                coverUrl: `${PUBLICATION_BASE}/previews/alpha/assets/cover.webp`,
                canDirectImport: false,
                directImportDisabledReason: '主题包尚未开放导入',
            }),
            expect.objectContaining({ id: 'no-cover', platform: 'desktop' }),
        ]);
        expect(result.designSystems[1]).not.toHaveProperty('coverUrl');
        expect(JSON.stringify(result)).not.toContain('large searchable text');
        expect(JSON.stringify(result)).not.toContain('tokens');
        expect(JSON.stringify(result)).not.toContain('packageUrl');
        expect(fetch).toHaveBeenCalledWith(DESIGN_KNOWLEDGE_MANIFEST_URL, expect.any(Object));
        expect(fetch).toHaveBeenCalledWith(DESKTOP_INDEX_URL, expect.any(Object));
        expect(fetch).not.toHaveBeenCalledWith(MOBILE_INDEX_URL, expect.anything());
    });
    it('rejects a platform index whose bytes do not match the manifest hash', async () => {
        const fixture = createFixture({ corruptDesktopHash: true });
        const catalog = createDesignKnowledgeThemeCatalog({ fetch: createFixtureFetch(fixture.responses) });
        await expect(catalog.load('desktop')).rejects.toMatchObject({
            code: 'THEME_LIBRARY_SCHEMA_INVALID',
        });
    });
    it('returns a stale verified platform cache when a refresh later fails', async () => {
        const fixture = createFixture();
        const fixtureFetch = createFixtureFetch(fixture.responses);
        let now = 1_000;
        let remoteFails = false;
        const fetch = vi.fn(async (input) => {
            if (remoteFails)
                throw new Error('offline');
            return fixtureFetch(input);
        });
        const catalog = createDesignKnowledgeThemeCatalog({ fetch, now: () => now });
        expect((await catalog.load('desktop')).stale).toBe(false);
        remoteFails = true;
        now += THEME_CATALOG_CACHE_TTL_MS + 1;
        const stale = await catalog.load('desktop');
        expect(stale.stale).toBe(true);
        expect(stale.total).toBe(2);
        expect(stale.designSystems.map((item) => item.id)).toEqual(['alpha', 'no-cover']);
    });
});
