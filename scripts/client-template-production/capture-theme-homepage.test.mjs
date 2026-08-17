import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  findWorkspaceRoot,
  normalizeViewport,
  parseCaptureArgs,
  resolveChromiumLaunchOptions,
  resolveCaptureJobs,
  resolveScreenshotBox,
  resolveScreenshotPlan,
  resolveWidthNormalization,
} from '../../client/scripts/capture-theme-homepage.mjs';

function makeFixture() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-capture-'));
  const appRoot = path.join(workspaceRoot, 'apps', 'make-project');
  const themeRoot = path.join(appRoot, 'src', 'themes', 'linear');
  fs.mkdirSync(themeRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages: []\n');
  fs.writeFileSync(
    path.join(themeRoot, 'theme.json'),
    JSON.stringify({
      source: {
        websiteUrl: 'https://linear.app/',
        originalDetailUrl: 'https://getdesign.md/linear.app/design-md',
      },
    }, null, 2),
  );
  return { workspaceRoot, appRoot };
}

describe('capture-theme-homepage CLI planning', () => {
  it('parses screenshot options needed for stable long homepage captures', () => {
    const args = parseCaptureArgs([
      'node',
      'capture-theme-homepage.mjs',
      '--',
      '--theme',
      'linear',
      '--url',
      'https://linear.app',
      '--viewport',
      '1440x1200',
      '--wait-for-selector',
      'main',
      '--dismiss-selector',
      'button:has-text("Accept")',
      '--remove-selector',
      '.newsletter-modal',
      '--header',
      'Authorization=Bearer token',
      '--connect-cdp',
      'http://localhost:9222',
      '--storage-state',
      '.local/auth/linear.json',
      '--hide-scrollbar',
      '--scroll-warmup',
      '--quality',
      '92',
    ]);

    expect(args.theme).toBe('linear');
    expect(args.url).toBe('https://linear.app');
    expect(args.viewport).toEqual({ width: 1440, height: 1200 });
    expect(args.waitForSelectors).toEqual(['main']);
    expect(args.dismissSelectors).toEqual(['button:has-text("Accept")']);
    expect(args.removeSelectors).toEqual(['.newsletter-modal']);
    expect(args.headers).toEqual({ Authorization: 'Bearer token' });
    expect(args.connectCdp).toBe('http://localhost:9222');
    expect(args.storageState).toBe('.local/auth/linear.json');
    expect(args.hideScrollbar).toBe(true);
    expect(args.scrollWarmup).toBe(true);
    expect(args.quality).toBe(92);
  });

  it('resolves a single theme from theme.json metadata into the official homepage asset path', () => {
    const { workspaceRoot, appRoot } = makeFixture();
    const args = parseCaptureArgs(['node', 'capture-theme-homepage.mjs', '--theme', 'linear']);

    const jobs = resolveCaptureJobs(args, { appRoot, workspaceRoot });

    expect(jobs).toHaveLength(1);
    expect(jobs[0].theme).toBe('linear');
    expect(jobs[0].url).toBe('https://linear.app/');
    expect(jobs[0].outputPath).toBe(path.join(appRoot, 'src/themes/linear/assets/official-homepage.webp'));
    expect(jobs[0].reportPath).toBe(path.join(workspaceRoot, '.local/theme-captures/linear/meta.json'));
    expect(jobs[0].viewport).toEqual({ width: 1440, height: 1200 });
    expect(jobs[0].waitUntil).toBe('load');
    expect(jobs[0].hideScrollbar).toBe(true);
    expect(jobs[0].scrollWarmup).toBe(true);
    expect(jobs[0]).not.toHaveProperty('dryRun');
    expect(jobs[0]).not.toHaveProperty('help');
  });

  it('merges config defaults, per-theme settings, and CLI overrides for batch capture', () => {
    const { workspaceRoot, appRoot } = makeFixture();
    const configPath = path.join(workspaceRoot, 'theme-capture.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaults: {
          viewport: '1920x1080',
          waitForSelectors: ['main'],
          removeSelectors: ['.chat-widget'],
          headers: { 'X-Capture': 'theme' },
        },
        themes: {
          linear: {
            url: 'https://linear.app/custom',
            dismissSelectors: ['button:has-text("Accept all")'],
            waitAfterLoadMs: 2500,
          },
          stripe: 'https://stripe.com',
        },
      }, null, 2),
    );

    const args = parseCaptureArgs([
      'node',
      'capture-theme-homepage.mjs',
      '--config',
      configPath,
      '--theme',
      'linear',
      '--viewport',
      '1366x900',
      '--header',
      'Authorization=Bearer local',
    ]);

    const jobs = resolveCaptureJobs(args, { appRoot, workspaceRoot });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      theme: 'linear',
      url: 'https://linear.app/custom',
      viewport: { width: 1366, height: 900 },
      waitForSelectors: ['main'],
      removeSelectors: ['.chat-widget'],
      dismissSelectors: ['button:has-text("Accept all")'],
      waitAfterLoadMs: 2500,
      headers: {
        'X-Capture': 'theme',
        Authorization: 'Bearer local',
      },
    });
  });

  it('expands all config themes when --all is requested', () => {
    const { workspaceRoot, appRoot } = makeFixture();
    const configPath = path.join(workspaceRoot, 'theme-capture.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        themes: [
          { theme: 'linear', url: 'https://linear.app' },
          { theme: 'stripe', url: 'https://stripe.com' },
        ],
      }),
    );

    const args = parseCaptureArgs(['node', 'capture-theme-homepage.mjs', '--config', configPath, '--all']);

    expect(resolveCaptureJobs(args, { appRoot, workspaceRoot }).map((job) => job.theme)).toEqual([
      'linear',
      'stripe',
    ]);
  });

  it('finds the workspace root and rejects invalid viewport strings', () => {
    const { workspaceRoot, appRoot } = makeFixture();

    expect(findWorkspaceRoot(appRoot)).toBe(workspaceRoot);
    expect(() => normalizeViewport('wide')).toThrow('Invalid viewport');
  });

  it('builds launch options with an explicit or discovered Chrome executable fallback', () => {
    expect(resolveChromiumLaunchOptions({
      headless: true,
      browserExecutable: '/tmp/Test Chrome',
    }).executablePath).toBe('/tmp/Test Chrome');

    const discovered = resolveChromiumLaunchOptions(
      { headless: false },
      {
        candidatePaths: ['/missing/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
        exists: (candidate) => candidate.includes('Google Chrome'),
      },
    );

    expect(discovered.headless).toBe(false);
    expect(discovered.executablePath).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    expect(discovered.args).toContain('--disable-blink-features=AutomationControlled');
  });

  it('captures webp outputs through a temporary png screenshot plan', () => {
    const plan = resolveScreenshotPlan({
      theme: 'linear',
      format: 'webp',
      outputPath: '/tmp/linear/official-homepage.webp',
      reportDir: '/tmp/.local/theme-captures/linear',
    });

    expect(plan).toEqual({
      playwrightType: 'png',
      screenshotPath: '/tmp/.local/theme-captures/linear/official-homepage-source.png',
      outputPath: '/tmp/linear/official-homepage.webp',
      needsConversion: true,
    });
  });

  it('clips very tall webp screenshots to the encoder-safe height', () => {
    expect(resolveScreenshotBox({
      format: 'webp',
      viewport: { width: 1440, height: 1200 },
      maxScreenshotHeight: 16383,
    }, {
      scrollHeight: 24000,
    })).toEqual({
      fullPage: false,
      viewport: { width: 1440, height: 16383 },
      clipped: true,
      sourceHeight: 24000,
      outputHeight: 16383,
    });

    expect(resolveScreenshotBox({
      format: 'webp',
      viewport: { width: 1440, height: 1200 },
      maxScreenshotHeight: 16383,
    }, {
      scrollHeight: 8000,
    })).toEqual({
      fullPage: true,
      clipped: false,
      sourceHeight: 8000,
      outputHeight: 8000,
    });
  });

  it('normalizes horizontally overflowing screenshots back to the viewport width', () => {
    expect(resolveWidthNormalization({
      viewport: { width: 1440, height: 1200 },
    }, {
      width: 3870,
      height: 6517,
    })).toEqual({
      needed: true,
      width: 1440,
      height: 6517,
      x: 0,
      y: 0,
    });

    expect(resolveWidthNormalization({
      viewport: { width: 1440, height: 1200 },
    }, {
      width: 1440,
      height: 6517,
    })).toEqual({
      needed: false,
      width: 1440,
      height: 6517,
      x: 0,
      y: 0,
    });
  });
});
