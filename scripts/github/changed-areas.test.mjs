import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyChangedPaths, matrixForAreas, parseNameStatus } from './changed-areas.mjs';

describe('Axhub Make changed areas', () => {
  it('classifies public repository paths without Runtime workspace names', () => {
    assert.deepEqual(classifyChangedPaths(['README.md']), ['docs']);
    assert.deepEqual(classifyChangedPaths(['src/server/http.ts']), ['server']);
    assert.deepEqual(classifyChangedPaths(['src/index/app/IndexPage.tsx']), ['admin']);
    assert.deepEqual(classifyChangedPaths(['client/src/main.tsx']), ['client']);
    assert.deepEqual(classifyChangedPaths(['scripts/release-make.mjs']), ['release']);
    assert.deepEqual(classifyChangedPaths(['vendor/axhub-commentary/dist/index.js']), ['shared']);
    assert.deepEqual(classifyChangedPaths(['vite.config.ts']), ['shared']);
    assert.deepEqual(classifyChangedPaths(['vite.axure-export.config.ts']), ['admin']);
    assert.deepEqual(classifyChangedPaths(['vitest.config.ts']), ['shared']);
    assert.deepEqual(classifyChangedPaths(['src/server/vendorPackages.test.ts']), [
      'admin',
      'server',
    ]);
    assert.deepEqual(classifyChangedPaths(['package.json']), ['release', 'shared']);
  });

  it('uses conservative shared checks for unknown code paths', () => {
    assert.deepEqual(classifyChangedPaths(['future-runtime/entry.ts']), ['shared']);
  });

  it('keeps both sides of rename records', () => {
    const paths = parseNameStatus('R100\0src/server/old.ts\0src/index/new.tsx\0');
    assert.deepEqual(paths, ['src/server/old.ts', 'src/index/new.tsx']);
    assert.deepEqual(classifyChangedPaths(paths), ['admin', 'server']);
  });

  it('keeps the path from deletion records', () => {
    assert.deepEqual(parseNameStatus('D\0client/src/removed.tsx\0'), [
      'client/src/removed.tsx',
    ]);
  });

  it('keeps both sides of copy records', () => {
    assert.deepEqual(
      parseNameStatus('C100\0src/server/source.ts\0src/index/copied.tsx\0'),
      ['src/server/source.ts', 'src/index/copied.tsx'],
    );
  });

  it('rejects malformed or truncated records', () => {
    assert.throws(() => parseNameStatus('M\0'), /Malformed git name-status record: M/u);
    assert.throws(
      () => parseNameStatus('C100\0src/server/source.ts\0'),
      /Malformed git name-status record: C100/u,
    );
  });

  it('returns a deterministic GitHub matrix', () => {
    assert.deepEqual(matrixForAreas(['server', 'docs']), {
      include: [{ area: 'docs' }, { area: 'server' }],
    });
  });
});
