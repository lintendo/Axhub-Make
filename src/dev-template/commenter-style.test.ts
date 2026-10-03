import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildCommenterColorMap } from '../../vendor/axhub-commentary/src/ui/runtime/commenter-style';

describe('commenter style', () => {
  it('assigns stable distinct colors to normalized commenter names', () => {
    const first = buildCommenterColorMap(['Alice', 'Bob', ' Alice ']);
    const second = buildCommenterColorMap(['Bob', 'Alice']);

    expect(first.get('Alice')).toBe(second.get('Alice'));
    expect(first.get('Bob')).toBe(second.get('Bob'));
    expect(first.get('Alice')).not.toBe(first.get('Bob'));
  });

  it('keeps commenter metadata in the existing prompt card renderer', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'vendor/axhub-commentary/src/ui/runtime/prompt-card-view.tsx'),
      'utf8',
    );

    expect(source).toContain('data-we-prompt-card-commenter');
    expect(source).toContain('批注者');
    expect(source).toContain('canClearCurrentElementEdits');
  });
});
