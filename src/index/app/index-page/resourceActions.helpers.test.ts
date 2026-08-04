import { describe, expect, it } from 'vitest';

import {
  getProjectRelativeResourcePathForItem,
  withResourceProject,
  withResourceProjectBody,
} from './resourceActions.helpers';

describe('resource action project scope', () => {
  it('requires and appends an explicit project id', () => {
    expect(withResourceProject('/api/delete?probe=1', 'project-b'))
      .toBe('/api/delete?probe=1&projectId=project-b');
    expect(withResourceProjectBody({ path: 'prototypes/home' }, 'project-b'))
      .toEqual({ path: 'prototypes/home', projectId: 'project-b' });
    expect(() => withResourceProject('/api/delete', null)).toThrow('请先选择项目');
  });
});

describe('resource copy paths', () => {
  it('returns paths relative to the project root', () => {
    expect(getProjectRelativeResourcePathForItem({ path: 'assets/logo.png' }))
      .toBe('src/resources/assets/logo.png');
    expect(getProjectRelativeResourcePathForItem({ filePath: 'src/resources/assets/logo.png' }))
      .toBe('src/resources/assets/logo.png');
    expect(getProjectRelativeResourcePathForItem({ filePath: './src/resources/assets/logo.png' }))
      .toBe('src/resources/assets/logo.png');
    expect(getProjectRelativeResourcePathForItem({ absoluteFilePath: '/workspace/project/src/resources/assets/logo.png' }))
      .toBe('src/resources/assets/logo.png');
    expect(getProjectRelativeResourcePathForItem({ absoluteFilePath: 'C:\\workspace\\project\\src\\resources\\assets\\logo.png' }))
      .toBe('src/resources/assets/logo.png');
    expect(getProjectRelativeResourcePathForItem({ absoluteFilePath: '\\\\server\\share\\project\\src\\resources\\assets\\logo.png' }))
      .toBe('src/resources/assets/logo.png');
    expect(getProjectRelativeResourcePathForItem({ filePath: 'assets\\logo.png' }))
      .toBe('src/resources/assets/logo.png');
    expect(getProjectRelativeResourcePathForItem({ filePath: 'archive/src/resources/logo.png' }))
      .toBe('src/resources/archive/src/resources/logo.png');
    expect(getProjectRelativeResourcePathForItem({})).toBe('');
  });
});
