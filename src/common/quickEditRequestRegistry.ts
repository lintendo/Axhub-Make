type RequestEntry<T> = {
  promise: Promise<T>;
  settled: boolean;
};

export function createQuickEditRequestRegistry<T>(limit = 100) {
  const entries = new Map<string, RequestEntry<T>>();
  const maxEntries = Math.max(1, Math.floor(limit));

  const evictCompletedEntries = () => {
    if (entries.size <= maxEntries) return;
    for (const [requestId, entry] of entries) {
      if (entries.size <= maxEntries) break;
      if (entry.settled) entries.delete(requestId);
    }
  };

  const run = (requestId: string, operation: () => T | Promise<T>): Promise<T> => {
    const key = String(requestId || '').trim();
    if (!key) return Promise.resolve().then(operation);

    const existing = entries.get(key);
    if (existing) return existing.promise;

    const entry: RequestEntry<T> = {
      settled: false,
      promise: Promise.resolve().then(operation),
    };
    entries.set(key, entry);
    void entry.promise.then(
      () => {
        entry.settled = true;
        evictCompletedEntries();
      },
      () => {
        entry.settled = true;
        if (entries.get(key) === entry) entries.delete(key);
        evictCompletedEntries();
      },
    );
    evictCompletedEntries();
    return entry.promise;
  };

  return {
    run,
    size: () => entries.size,
  };
}
