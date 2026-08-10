import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('DesignMdBatchShowcase responsive typography', () => {
  it('uses a fixed mobile display size and reserves fit-width tolerance', () => {
    const component = fs.readFileSync(
      path.resolve(__dirname, '../src/common/DesignMdBatchShowcase/index.tsx'),
      'utf8',
    );
    const css = fs.readFileSync(
      path.resolve(__dirname, '../src/common/DesignMdBatchShowcase/base.css'),
      'utf8',
    );

    expect(component).toContain('(availableWidth - 4) / textWidth');
    expect(css).toMatch(
      /@media \(max-width: 720px\)[^]*\.dmb-type-wide \.dmb-type-sample\s*\{[^}]*font-size:\s*44px;/u,
    );
  });
});
