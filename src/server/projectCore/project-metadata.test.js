import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectMetadataStore } from './project-metadata';
const tempRoots = [];
function createTempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-project-metadata-'));
    tempRoots.push(root);
    return root;
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('project metadata store', () => {
    it('does not model ordinary resource files as metadata resource arrays', () => {
        const projectRoot = createTempRoot();
        const metadataPath = path.join(projectRoot, '.axhub', 'make', 'project.json');
        fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
        fs.writeFileSync(metadataPath, JSON.stringify({
            schemaVersion: 1,
            project: { id: 'demo', name: 'Demo' },
            resources: {
                prototypes: [],
                docs: [{ id: 'spec', name: 'spec', title: 'Spec', path: 'src/resources/spec.md' }],
                themes: [],
                data: [{ id: 'orders' }],
                templates: [{ id: 'prd' }],
            },
            navigation: {
                prototypes: [],
                docs: ['spec'],
            },
            orders: {
                themes: [],
                data: ['orders'],
                templates: ['prd'],
            },
        }), 'utf8');
        const store = createProjectMetadataStore(projectRoot);
        const metadata = store.getMetadata();
        expect(metadata.resources).toEqual({
            prototypes: [],
            themes: [],
        });
        expect(metadata.navigation).toEqual({ prototypes: [] });
        expect(metadata.orders).toEqual({ themes: [] });
        store.saveMetadata(metadata);
        const serialized = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        expect(serialized.resources).toEqual({
            prototypes: [],
            themes: [],
        });
        expect(serialized.navigation).toEqual({ prototypes: [] });
        expect(serialized.orders).toEqual({ themes: [] });
    });
    it('preserves normalized prototype page groups without retaining blank labels', () => {
        const projectRoot = createTempRoot();
        const metadataPath = path.join(projectRoot, '.axhub', 'make', 'project.json');
        fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
        fs.writeFileSync(metadataPath, JSON.stringify({
            schemaVersion: 1,
            project: { id: 'demo', name: 'Demo' },
            resources: {
                prototypes: [{
                        id: 'shop',
                        name: 'shop',
                        title: 'Shop',
                        clientUrl: '/prototypes/shop',
                        pages: [
                            { id: 'orders', title: '订单列表', group: '  订单管理  ' },
                            { id: 'customers', title: '客户列表', group: '   ' },
                        ],
                        defaultPageId: 'orders',
                    }],
                themes: [],
            },
            navigation: { prototypes: ['shop'] },
            orders: { themes: [] },
        }), 'utf8');
        const metadata = createProjectMetadataStore(projectRoot).getMetadata();
        expect(metadata.resources.prototypes[0]?.pages).toEqual([
            { id: 'orders', title: '订单列表', group: '订单管理' },
            { id: 'customers', title: '客户列表' },
        ]);
    });
});
