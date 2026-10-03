import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import assert from 'node:assert/strict';

it('excludes every local theme from the published client template', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve('client/template-manifest.json'), 'utf8'),
  );
  const exclusions = manifest.themes.idRules
    .filter(({ action }) => action === 'exclude')
    .map(({ pattern }) => new RegExp(pattern, 'u'));

  for (const themeId of ['example', 'chatgpt-mobile', 'future-theme-2026']) {
    assert(
      exclusions.some((pattern) => pattern.test(themeId)),
      `${themeId} must be excluded from the published client template`,
    );
  }
});
