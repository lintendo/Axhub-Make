import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('dev-template bootstrap style isolation', () => {
  it('does not load the admin global stylesheet into embedded preview documents', () => {
    const bootstrapSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/dev-template/index.tsx'),
      'utf8',
    );

    expect(bootstrapSource).not.toContain("../index.css");
  });
});
