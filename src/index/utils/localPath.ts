export function getExplicitLocalPath(item: unknown): string {
    if (!item || typeof item !== 'object') {
        return '';
    }
    const raw = item as {
        filePath?: unknown;
        absoluteFilePath?: unknown;
        path?: unknown;
    };
    const candidates = [raw.filePath, raw.absoluteFilePath, raw.path];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
}

export function hasExplicitLocalPath(item: unknown): boolean {
    return Boolean(getExplicitLocalPath(item));
}

export function stripIndexFilePath(value: string): string {
    return value.trim().replace(/\/index\.(t|j)sx?$/i, '');
}

export function getPrototypeLocalBasePath(item: unknown): string {
    const explicitPath = getExplicitLocalPath(item).replace(/\\/g, '/').trim();
    if (explicitPath) {
        return stripIndexFilePath(explicitPath).replace(/\/+$/u, '');
    }
    if (!item || typeof item !== 'object') {
        return '';
    }
    const specFilePath = String((item as { specFilePath?: unknown }).specFilePath || '')
        .replace(/\\/g, '/')
        .trim();
    const specDirectoryMarker = '/.spec/';
    const markerIndex = specFilePath.lastIndexOf(specDirectoryMarker);
    return markerIndex > 0 ? specFilePath.slice(0, markerIndex).replace(/\/+$/u, '') : '';
}
