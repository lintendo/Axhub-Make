import { describe, expect, it, vi } from 'vitest';

import { openDocumentPreview } from '../src/prototypes/annotation-demo/openDocumentPreview';

describe('document mode preview', () => {
  it('opens the overview article in split mode without the directory', () => {
    const openDirectoryArticle = vi.fn(() => true);

    openDocumentPreview({ openDirectoryArticle });

    expect(openDirectoryArticle).toHaveBeenCalledExactlyOnceWith('prd-overview', {
      readerMode: 'split',
      directoryOpen: false,
    });
  });

  it('waits for the viewer API before opening the article', () => {
    expect(() => openDocumentPreview(null)).not.toThrow();
  });
});
