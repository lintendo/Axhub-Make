import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  inferThemeFromUrl,
  parseResponsiveViewports,
  parseSourceCaptureArgs,
  resolveSourceCaptureJob,
  summarizeTheme,
} from '../../client/scripts/capture-theme-source.mjs';

describe('capture-theme-source CLI planning', () => {
  it('parses source capture options for screenshot and token evidence', () => {
    const args = parseSourceCaptureArgs([
      'node',
      'capture-theme-source.mjs',
      'https://www.trae.ai/',
      '--theme',
      'trae-ai',
      '--output',
      '.local/theme-capture-trae-ai',
      '--viewport',
      '1440x900',
      '--responsive-viewports',
      'desktop:1440x900,tablet:768x1024,mobile:390x844',
      '--wait-for-selector',
      'main',
      '--dismiss-selector',
      'button:has-text("Accept")',
      '--remove-selector',
      '.cookie-banner',
      '--header',
      'Authorization=Bearer token',
      '--connect-cdp',
      'http://localhost:9222',
      '--no-scroll-warmup',
    ]);

    expect(args.url).toBe('https://www.trae.ai/');
    expect(args.theme).toBe('trae-ai');
    expect(args.output).toBe('.local/theme-capture-trae-ai');
    expect(args.viewport).toEqual({ width: 1440, height: 900 });
    expect(args.responsiveViewports).toEqual([
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 390, height: 844 },
    ]);
    expect(args.waitForSelectors).toEqual(['main']);
    expect(args.dismissSelectors).toEqual(['button:has-text("Accept")']);
    expect(args.removeSelectors).toEqual(['.cookie-banner']);
    expect(args.headers).toEqual({ Authorization: 'Bearer token' });
    expect(args.connectCdp).toBe('http://localhost:9222');
    expect(args.scrollWarmup).toBe(false);
  });

  it('resolves default output directory from a URL-derived theme key', () => {
    const appRoot = '/repo/client';
    const workspaceRoot = '/repo';
    const args = parseSourceCaptureArgs([
      'node',
      'capture-theme-source.mjs',
      'https://www.trae.ai/',
      '--dry-run',
    ]);

    const job = resolveSourceCaptureJob(args, { appRoot, workspaceRoot });

    expect(job.theme).toBe('trae');
    expect(job.outputDir).toBe(path.join(appRoot, '.local/theme-capture-trae'));
    expect(job.viewport).toEqual({ width: 1440, height: 900 });
    expect(job.responsive).toBe(true);
    expect(job.screenshot).toBe(true);
    expect(job.tokens).toBe(true);
  });

  it('normalizes responsive viewport lists and URL theme inference', () => {
    expect(parseResponsiveViewports('wide:1600x900,narrow:375x812')).toEqual([
      { name: 'wide', width: 1600, height: 900 },
      { name: 'narrow', width: 375, height: 812 },
    ]);
    expect(inferThemeFromUrl('https://www.example.co.uk/path')).toBe('example');
  });

  it('keeps computed token summaries focused on theme evidence', () => {
    const summary = summarizeTheme({
      colors: { text: [{ value: 'rgb(255, 255, 255)', count: 2 }] },
      typography: { families: [{ value: 'Inter', count: 3 }] },
      spacing: [{ value: '16px', count: 4 }],
      ignored: 'not included',
    });

    expect(summary).toEqual({
      colors: { text: [{ value: 'rgb(255, 255, 255)', count: 2 }] },
      typography: { families: [{ value: 'Inter', count: 3 }] },
      spacing: [{ value: '16px', count: 4 }],
      radius: [],
      lineWidth: [],
      shadow: {},
      transitions: [],
      animations: [],
      cssVariables: {},
    });
  });
});
