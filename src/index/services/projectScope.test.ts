import { describe, expect, it } from 'vitest';

import {
  requireProjectScope,
  withProjectScope,
  withProjectScopeBody,
} from './projectScope';

describe('projectScope', () => {
  it('normalizes and requires an explicit project id', () => {
    expect(requireProjectScope(' project-b ')).toEqual({ projectId: 'project-b' });
    expect(() => requireProjectScope(null)).toThrow('请先选择项目');
    expect(() => requireProjectScope('  ')).toThrow('请先选择项目');
  });

  it('adds project scope without dropping existing query parameters', () => {
    expect(withProjectScope('/api/config?tab=ai', { projectId: 'project-b' }))
      .toBe('/api/config?tab=ai&projectId=project-b');
  });

  it('adds project scope to JSON bodies', () => {
    expect(withProjectScopeBody({ value: 1 }, { projectId: 'project-b' }))
      .toEqual({ value: 1, projectId: 'project-b' });
  });
});
