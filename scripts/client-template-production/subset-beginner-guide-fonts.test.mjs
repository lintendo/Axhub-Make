import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectCharactersFromFiles,
  collectSubsetCharacters,
  getFontJobs,
  parseSubsetArgs,
  resolveBeginnerGuidePaths,
} from './subset-beginner-guide-fonts.mjs';

describe('beginner guide font subsetting', () => {
  it('collects unique page characters while ignoring duplicate text', () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beginner-font-subset-'));
    const sourcePath = path.join(fixtureDir, 'index.tsx');
    fs.writeFileSync(sourcePath, '<h1>发布到云端服务</h1><p>发布到云端服务 ABC 123</p>');

    const characters = collectCharactersFromFiles([sourcePath]);

    expect(characters).toContain('发');
    expect(characters).toContain('务');
    expect(characters).toContain('A');
    expect(characters.filter((character) => character === '发')).toHaveLength(1);
  });

  it('merges page text with a reusable common Chinese fallback set', () => {
    const characters = collectSubsetCharacters({
      pageCharacters: ['专', '属', 'A'],
      commonCharacters: '的一是专',
      extraCharacters: ' A',
    });

    expect(characters.join('')).toContain('专');
    expect(characters.join('')).toContain('的');
    expect(characters.join('')).toContain('A');
    expect(characters.filter((character) => character === '专')).toHaveLength(1);
  });

  it('builds one subsetting job for each TsangerJinKai02 source weight', () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beginner-font-app-'));
    const prototypeRoot = path.join(appRoot, 'src/prototypes/beginner-guide');
    fs.mkdirSync(prototypeRoot, { recursive: true });

    const paths = resolveBeginnerGuidePaths({ appRoot });
    const jobs = getFontJobs(paths);

    expect(jobs).toEqual([
      {
        weight: 400,
        inputPath: path.join(prototypeRoot, 'TsangerJinKai02-W04.ttf'),
        outputPath: path.join(prototypeRoot, 'TsangerJinKai02-W04.subset.woff2'),
      },
      {
        weight: 500,
        inputPath: path.join(prototypeRoot, 'TsangerJinKai02-W05.ttf'),
        outputPath: path.join(prototypeRoot, 'TsangerJinKai02-W05.subset.woff2'),
      },
    ]);
  });

  it('prefers ignored local source fonts over published prototype files', () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beginner-font-local-'));
    const localSourceRoot = path.join(appRoot, '.local/font-sources/beginner-guide');
    fs.mkdirSync(localSourceRoot, { recursive: true });

    const paths = resolveBeginnerGuidePaths({ appRoot });

    expect(paths.sourceFontDir).toBe(localSourceRoot);
  });

  it('parses script options for dry runs and explicit source font directories', () => {
    const args = parseSubsetArgs([
      'node',
      'subset-beginner-guide-fonts.mjs',
      '--dry-run',
      '--source-font-dir',
      '/tmp/fonts',
      '--app-root',
      '/tmp/app',
    ]);

    expect(args.dryRun).toBe(true);
    expect(args.sourceFontDir).toBe('/tmp/fonts');
    expect(args.appRoot).toBe('/tmp/app');
  });
});
