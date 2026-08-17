import { describe, expect, it, vi } from 'vitest';
vi.mock('../exportHtmlArchive.ts', () => ({
    buildExportHtmlStaticFiles: vi.fn(),
}));
vi.mock('../http.ts', () => ({
    getRequestUrl: vi.fn(),
    readJsonBody: vi.fn(),
    sendJson: vi.fn(),
    sendText: vi.fn(),
}));
import { normalizeAxhubPublishResultUrl, normalizeFilesForAxhub } from '../managementApi.axhub.ts';
describe('Axhub publish URL normalization', () => {
    it('renames the Axhub HTML entry script with a content hash and updates index.html', () => {
        const files = normalizeFilesForAxhub([
            {
                path: 'index.html',
                contentType: 'text/html; charset=utf-8',
                body: Buffer.from("await loadEntryScript('./index.js');", 'utf8'),
            },
            {
                path: 'index.js',
                contentType: 'application/javascript; charset=utf-8',
                body: Buffer.from('var UserComponent = function Home(){};', 'utf8'),
            },
        ]);
        const paths = files.map((file) => file.path).sort();
        const entryPath = paths.find((filePath) => /^index\.[a-f0-9]{8}\.js$/u.test(filePath)) || '';
        expect(entryPath).toBeTruthy();
        expect(paths).toEqual(expect.arrayContaining(['index.html', entryPath]));
        expect(paths).not.toContain('index.js');
        expect(files.find((file) => file.path === 'index.html')?.body.toString('utf8')).toBe(`await loadEntryScript('./${entryPath}');`);
        expect(files.find((file) => file.path === entryPath)?.body.toString('utf8')).toBe('var UserComponent = function Home(){};');
    });
    it('omits empty non-core files before uploading to Axhub', () => {
        const files = normalizeFilesForAxhub([
            {
                path: 'index.html',
                contentType: 'text/html; charset=utf-8',
                body: Buffer.from("await loadEntryScript('./index.js');", 'utf8'),
            },
            {
                path: 'index.js',
                contentType: 'application/javascript; charset=utf-8',
                body: Buffer.from('var UserComponent = function Home(){};', 'utf8'),
            },
            {
                path: 'media/.gitkeep',
                contentType: 'application/octet-stream',
                body: Buffer.alloc(0),
            },
            {
                path: 'media/logo.svg',
                contentType: 'image/svg+xml',
                body: Buffer.from('<svg />', 'utf8'),
            },
        ]);
        expect(files.map((file) => file.path)).not.toContain('media/.gitkeep');
        expect(files.map((file) => file.path)).toContain('media/logo.svg');
        expect(files.every((file) => file.body.length > 0)).toBe(true);
    });
    it('rejects empty core files before uploading to Axhub', () => {
        expect(() => normalizeFilesForAxhub([
            {
                path: 'index.html',
                contentType: 'text/html; charset=utf-8',
                body: Buffer.from("await loadEntryScript('./index.js');", 'utf8'),
            },
            {
                path: 'index.js',
                contentType: 'application/javascript; charset=utf-8',
                body: Buffer.alloc(0),
            },
        ])).toThrow('Axhub 发布核心文件为空：index.js');
    });
    it('converts Axhub-hosted relative publish URLs into absolute Axhub URLs', () => {
        const result = normalizeAxhubPublishResultUrl({
            pid: 12,
            name: 'Landing Page',
            path: 'cc4bb37540de9614',
            url: '/html/cc4bb37540de9614/',
            htmlUsedSpace: 2048,
            generateTime: '2026-06-26T10:00:00.000Z',
        }, 'https://axhub.im');
        expect(result.url).toBe('https://axhub.im/html/cc4bb37540de9614/');
    });
    it('uses the configured Axhub base URL when resolving relative publish URLs', () => {
        const result = normalizeAxhubPublishResultUrl({
            pid: 12,
            name: 'Landing Page',
            path: 'cc4bb37540de9614',
            url: 'html/cc4bb37540de9614/',
            htmlUsedSpace: 2048,
            generateTime: '2026-06-26T10:00:00.000Z',
        }, 'https://staging.axhub.test/');
        expect(result.url).toBe('https://staging.axhub.test/html/cc4bb37540de9614/');
    });
    it('resolves Enterprise /pro publish URLs against the Enterprise server URL', () => {
        const result = normalizeAxhubPublishResultUrl({
            pid: 12,
            name: 'Landing Page',
            path: 'cc4bb37540de9614',
            url: '/pro/cc4bb37540de9614/',
            htmlUsedSpace: 2048,
            generateTime: '2026-07-01T10:00:00.000Z',
        }, 'https://enterprise.example.com/');
        expect(result.url).toBe('https://enterprise.example.com/pro/cc4bb37540de9614/');
    });
    it('keeps already absolute publish URLs unchanged', () => {
        const result = normalizeAxhubPublishResultUrl({
            pid: 12,
            name: 'Landing Page',
            path: 'cc4bb37540de9614',
            url: 'https://assets.axhub.test/html/cc4bb37540de9614/',
            htmlUsedSpace: 2048,
            generateTime: '2026-06-26T10:00:00.000Z',
        }, 'https://axhub.im');
        expect(result.url).toBe('https://assets.axhub.test/html/cc4bb37540de9614/');
    });
});
