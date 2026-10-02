import { describe, expect, it } from 'vitest';
import {
  ONLINE_LIBRARY_BATCH_SIZE,
  getNextVisibleLibraryItemCount,
} from './useProgressiveLibraryItems';
import { readFileSync } from 'node:fs';

describe('progressive online library items', () => {
  it('uses nine items for every progressive batch', () => {
    expect(ONLINE_LIBRARY_BATCH_SIZE).toBe(9);
    expect(getNextVisibleLibraryItemCount(0, 37)).toBe(9);
    expect(getNextVisibleLibraryItemCount(9, 37)).toBe(18);
    expect(getNextVisibleLibraryItemCount(36, 37)).toBe(37);
    expect(getNextVisibleLibraryItemCount(9, 9)).toBe(9);
    expect(getNextVisibleLibraryItemCount(0, 0)).toBe(0);
  });

  it('can wait for an explicit scroll signal before observing the next batch', () => {
    const source = readFileSync(new URL('./useProgressiveLibraryItems.ts', import.meta.url), 'utf8');
    expect(source).toContain('loadMoreEnabled = true');
    expect(source).toContain('if (!loadMoreEnabled || !hasMore || !loadMoreElement');
  });
});
