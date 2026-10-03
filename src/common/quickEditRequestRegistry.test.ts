import { describe, expect, it, vi } from 'vitest';

import { createQuickEditRequestRegistry } from './quickEditRequestRegistry';

describe('createQuickEditRequestRegistry', () => {
  it('shares one in-flight operation for duplicate request ids', async () => {
    const registry = createQuickEditRequestRegistry<number>();
    const operation = vi.fn(async () => 42);

    const [first, second] = await Promise.all([
      registry.run('commit-1', operation),
      registry.run('commit-1', operation),
    ]);

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('reuses a completed result and evicts the oldest completed entry at the limit', async () => {
    const registry = createQuickEditRequestRegistry<string>(2);
    const operation = vi.fn(async (value: string) => value);

    await registry.run('request-a', () => operation('a'));
    await registry.run('request-a', () => operation('duplicate-a'));
    await registry.run('request-b', () => operation('b'));
    await registry.run('request-c', () => operation('c'));
    await registry.run('request-a', () => operation('replayed-a'));

    expect(operation).toHaveBeenCalledTimes(4);
    expect(operation).toHaveBeenNthCalledWith(1, 'a');
    expect(operation).toHaveBeenNthCalledWith(4, 'replayed-a');
  });
});
