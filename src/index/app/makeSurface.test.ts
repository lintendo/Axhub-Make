import { describe, expect, it } from 'vitest';

import {
    preserveMakeSurface,
    resolveMakeSurface,
    resolveMakeSurfaceCapabilities,
} from './makeSurface';

describe('Make surface', () => {
    it('uses the standard surface unless the query explicitly requests Codex', () => {
        expect(resolveMakeSurface('')).toBe('standard');
        expect(resolveMakeSurface('?surface=standard')).toBe('standard');
        expect(resolveMakeSurface('?surface=unknown')).toBe('standard');
        expect(resolveMakeSurface('?surface=codex')).toBe('codex');
    });

    it('keeps direct AI tools while removing conversation UI and the external open menu in Codex', () => {
        expect(resolveMakeSurfaceCapabilities('standard')).toEqual({
            conversationUi: true,
            externalOpenMenu: true,
            directAiTools: true,
        });
        expect(resolveMakeSurfaceCapabilities('codex')).toEqual({
            conversationUi: false,
            externalOpenMenu: false,
            directAiTools: true,
        });
    });

    it('adds only the Codex surface parameter to root-relative and absolute URLs', () => {
        expect(preserveMakeSurface('/?projectId=demo', 'codex')).toBe('/?projectId=demo&surface=codex');
        expect(preserveMakeSurface('http://127.0.0.1:53817/?surface=standard', 'codex')).toBe('http://127.0.0.1:53817/?surface=codex');
        expect(preserveMakeSurface('/?projectId=demo&surface=codex', 'standard')).toBe('/?projectId=demo');
    });
});
