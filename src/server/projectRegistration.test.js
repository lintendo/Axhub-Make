import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { allocateRegisteredProjectId, findRegisteredProjectByRoot, } from './projectRegistration';
describe('project registration identity', () => {
    const roots = [];
    afterEach(() => {
        for (const root of roots.splice(0)) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    it('finds an existing project through its comparable real root', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-project-root-'));
        roots.push(root);
        const project = {
            id: 'demo',
            name: 'Demo',
            root,
            metadataPath: '',
            createdAt: '',
            updatedAt: '',
        };
        expect(findRegisteredProjectByRoot([project], path.join(root, '.'))).toBe(project);
    });
    it('compares Windows roots case-insensitively', () => {
        const project = {
            id: 'demo',
            name: 'Demo',
            root: '/TMP/Project',
            metadataPath: '',
            createdAt: '',
            updatedAt: '',
        };
        expect(findRegisteredProjectByRoot([project], '/tmp/project', 'win32')).toBe(project);
    });
    it('allocates the first available numeric suffix', () => {
        const ids = new Set(['demo', 'demo-2']);
        expect(allocateRegisteredProjectId('demo', (id) => ids.has(id))).toBe('demo-3');
    });
});
