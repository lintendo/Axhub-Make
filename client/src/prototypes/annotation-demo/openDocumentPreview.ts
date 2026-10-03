import type { AnnotationViewerApi } from '@axhub/annotation';

export function openDocumentPreview(api: Pick<AnnotationViewerApi, 'openDirectoryArticle'> | null): void {
    api?.openDirectoryArticle('prd-overview', { readerMode: 'split', directoryOpen: false });
}
