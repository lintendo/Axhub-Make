import { describe, expect, it } from 'vitest';
import { summarizeStatuses } from './report-mobile-theme-screenshot-status.mjs';

describe('mobile screenshot status report', () => {
  it('counts collection and regression states independently', () => {
    expect(summarizeStatuses([
      { slug: 'one-mobile', collection: 'complete', regression: 'passed', actual: 3 },
      { slug: 'two-mobile', collection: 'review', regression: 'pending', actual: 3 },
      { slug: 'three-mobile', collection: 'blocked', regression: 'pending', actual: 0 },
    ])).toEqual({
      total: 3,
      assets: 6,
      collection: { complete: 1, review: 1, blocked: 1 },
      regression: { passed: 1, pending: 2 },
      ready: 1,
    });
  });
});
