import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadExportHtmlArchive } from './export.api';

describe('downloadExportHtmlArchive', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('passes includeSource when downloading HTML with source files', async () => {
        const click = vi.fn();
        const appendChild = vi.fn();
        const removeChild = vi.fn();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            headers: new Headers({ 'Content-Disposition': 'attachment; filename="home-html.zip"' }),
            blob: async () => new Blob(['zip']),
        } as Response);

        vi.stubGlobal('document', {
            body: {
                appendChild,
                removeChild,
            },
            createElement: vi.fn(() => ({
                href: '',
                download: '',
                click,
            })),
        });
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:export-html'),
            revokeObjectURL: vi.fn(),
        });

        await expect(downloadExportHtmlArchive(
            'prototypes/home',
            { projectId: 'project-b' },
            { includeSource: true },
        )).resolves.toBe('home-html.zip');

        expect(fetchMock).toHaveBeenCalledWith('/api/export-html?path=prototypes%2Fhome&includeSource=1&projectId=project-b');
        expect(click).toHaveBeenCalledTimes(1);
        expect(appendChild).toHaveBeenCalledTimes(1);
        expect(removeChild).toHaveBeenCalledTimes(1);
    });
});
