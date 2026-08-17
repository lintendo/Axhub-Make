import { describe, expect, it, vi } from 'vitest';
import { handleEntriesCompatibilityApi } from './managementApi.entries';
function createJsonResponse() {
    let body = '';
    const headers = new Map();
    const res = {
        statusCode: 0,
        setHeader: vi.fn((key, value) => {
            headers.set(key, value);
            return res;
        }),
        end: vi.fn((chunk) => {
            body = String(chunk ?? '');
            return res;
        }),
    };
    return {
        res,
        headers,
        readBody: () => JSON.parse(body),
    };
}
describe('entries compatibility API', () => {
    it('preserves placeholder prototype metadata for the start page after resource refresh', () => {
        const { res, readBody } = createJsonResponse();
        const handled = handleEntriesCompatibilityApi({
            url: '/api/entries.json',
            method: 'GET',
            headers: { host: 'localhost' },
        }, res, { runtimeOrigin: '' }, {
            project: {
                id: 'demo-project',
                root: '/tmp/demo-project',
            },
            metadata: {
                resources: {
                    prototypes: [
                        {
                            id: 'untitled',
                            name: 'untitled',
                            title: 'Untitled',
                            clientUrl: '/prototypes/untitled',
                            filePath: 'src/prototypes/untitled/index.tsx',
                            absoluteFilePath: '/tmp/demo-project/src/prototypes/untitled/index.tsx',
                            placeholder: true,
                            placeholderGuide: {
                                kind: 'prototype-empty',
                                title: 'Empty prototype',
                                description: 'Describe what to create.',
                                steps: [],
                                tips: [],
                            },
                        },
                    ],
                    docs: [],
                    themes: [],
                    data: [],
                    templates: [],
                },
            },
        }, '/api/entries.json');
        expect(handled).toBe(true);
        expect(readBody().prototypes[0]).toMatchObject({
            name: 'untitled',
            placeholder: true,
            placeholderGuide: {
                kind: 'prototype-empty',
                title: 'Empty prototype',
            },
        });
    });
    it('preserves waiting prototype metadata after resource refresh', () => {
        const { res, readBody } = createJsonResponse();
        const handled = handleEntriesCompatibilityApi({
            url: '/api/entries.json',
            method: 'GET',
            headers: { host: 'localhost' },
        }, res, { runtimeOrigin: '' }, {
            project: {
                id: 'demo-project',
                root: '/tmp/demo-project',
            },
            metadata: {
                resources: {
                    prototypes: [
                        {
                            id: 'untitled',
                            name: 'untitled',
                            title: 'Untitled',
                            clientUrl: '/prototypes/untitled',
                            filePath: 'src/prototypes/untitled/index.tsx',
                            absoluteFilePath: '/tmp/demo-project/src/prototypes/untitled/index.tsx',
                            generationStatus: 'waiting',
                        },
                    ],
                    docs: [],
                    themes: [],
                    data: [],
                    templates: [],
                },
            },
        }, '/api/entries.json');
        const body = readBody();
        expect(handled).toBe(true);
        expect(body.prototypes[0]).toMatchObject({
            name: 'untitled',
            generationStatus: 'waiting',
        });
        expect(body.prototypes[0]).not.toHaveProperty('placeholder');
        expect(body.prototypes[0]).not.toHaveProperty('placeholderGuide');
    });
    it('rewrites loopback runtime links to the LAN request hostname', () => {
        const { res, readBody } = createJsonResponse();
        const handled = handleEntriesCompatibilityApi({
            url: '/api/entries.json',
            method: 'GET',
            headers: { host: '192.168.1.42:53817' },
        }, res, { runtimeOrigin: 'http://localhost:51720' }, {
            project: {
                id: 'demo-project',
                root: '/tmp/demo-project',
            },
            metadata: {
                resources: {
                    prototypes: [
                        {
                            id: 'home',
                            name: 'home',
                            clientUrl: '/prototypes/home?mode=review#summary',
                        },
                    ],
                    docs: [],
                    themes: [],
                    data: [],
                    templates: [],
                },
            },
        }, '/api/entries.json');
        expect(handled).toBe(true);
        expect(readBody().prototypes[0]).toMatchObject({
            clientUrl: 'http://192.168.1.42:51720/prototypes/home?mode=review#summary',
            previewUrl: 'http://192.168.1.42:51720/prototypes/home?mode=review#summary',
        });
    });
});
