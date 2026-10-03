export type MakeSurface = 'standard' | 'codex';

export interface MakeSurfaceCapabilities {
    conversationUi: boolean;
    externalOpenMenu: boolean;
    directAiTools: boolean;
}

const STANDARD_CAPABILITIES: MakeSurfaceCapabilities = {
    conversationUi: true,
    externalOpenMenu: true,
    directAiTools: true,
};

const CODEX_CAPABILITIES: MakeSurfaceCapabilities = {
    conversationUi: false,
    externalOpenMenu: false,
    directAiTools: true,
};

export function resolveMakeSurface(search: string): MakeSurface {
    return new URLSearchParams(search).get('surface') === 'codex' ? 'codex' : 'standard';
}

export function resolveMakeSurfaceCapabilities(surface: MakeSurface): MakeSurfaceCapabilities {
    return surface === 'codex' ? CODEX_CAPABILITIES : STANDARD_CAPABILITIES;
}

export function preserveMakeSurface(urlValue: string, surface: MakeSurface): string {
    const isAbsolute = /^[a-z][a-z\d+.-]*:/iu.test(urlValue);
    const url = new URL(urlValue, 'http://localhost');
    if (surface === 'codex') {
        url.searchParams.set('surface', 'codex');
    } else {
        url.searchParams.delete('surface');
    }
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
