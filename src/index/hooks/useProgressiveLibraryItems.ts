import { useCallback, useEffect, useMemo, useState } from 'react';

export const ONLINE_LIBRARY_BATCH_SIZE = 9;

export function getNextVisibleLibraryItemCount(currentCount: number, totalCount: number): number {
  const safeTotal = Math.max(0, totalCount);
  if (safeTotal === 0) return 0;
  return Math.min(
    safeTotal,
    Math.max(ONLINE_LIBRARY_BATCH_SIZE, currentCount + ONLINE_LIBRARY_BATCH_SIZE),
  );
}

export function useProgressiveLibraryItems<T>(
  items: readonly T[],
  resetKey: string | null = null,
  loadMoreEnabled = true,
) {
  const [visibleCount, setVisibleCount] = useState(ONLINE_LIBRARY_BATCH_SIZE);
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(ONLINE_LIBRARY_BATCH_SIZE);
  }, [items, resetKey]);

  const hasMore = visibleCount < items.length;

  useEffect(() => {
    if (!loadMoreEnabled || !hasMore || !loadMoreElement || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) => getNextVisibleLibraryItemCount(current, items.length));
      }
    }, { rootMargin: '160px 0px' });
    observer.observe(loadMoreElement);
    return () => observer.disconnect();
  }, [hasMore, items.length, loadMoreElement, loadMoreEnabled]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    setLoadMoreElement(node);
  }, []);

  return { visibleItems, hasMore, loadMoreRef };
}
