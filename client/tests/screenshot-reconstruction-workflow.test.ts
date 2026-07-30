import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const agentsRoot = path.join(appRoot, '.agents/skills/screenshot-to-prototype');
const claudeRoot = path.join(appRoot, '.claude/skills/screenshot-to-prototype');

function run(root: string, script: string, args: string[]) {
  return execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd: appRoot,
    encoding: 'utf8',
  });
}

function writeFixturePng(filePath: string) {
  // A tiny valid PNG is sufficient for manifest resource validation.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  fs.writeFileSync(filePath, png);
}

describe('screenshot reconstruction workflow assets', () => {
  it('keeps the workflow assets mirrored and builds/validates a reconstruction manifest', () => {
    const relativeFiles = [
      'scripts/build-reconstruction-manifest.mjs',
      'scripts/validate-reconstruction-manifest.mjs',
      'scripts/compile-reconstruction-tailwind.mjs',
    ];
    for (const relativeFile of relativeFiles) {
      expect(fs.existsSync(path.join(agentsRoot, relativeFile)), `${relativeFile} missing in .agents`).toBe(true);
      expect(fs.existsSync(path.join(claudeRoot, relativeFile)), `${relativeFile} missing in .claude`).toBe(true);
      expect(fs.readFileSync(path.join(agentsRoot, relativeFile), 'utf8')).toBe(
        fs.readFileSync(path.join(claudeRoot, relativeFile), 'utf8'),
      );
    }
    for (const removedFile of ['assets/visual-comparison-template.html', 'scripts/build-visual-comparison.mjs', 'scripts/compare-reconstruction.mjs']) {
      expect(fs.existsSync(path.join(agentsRoot, removedFile))).toBe(false);
      expect(fs.existsSync(path.join(claudeRoot, removedFile))).toBe(false);
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-workflow-'));
    const sourceSummary = path.join(dir, 'source-summary.json');
    const elements = path.join(dir, 'elements.json');
    const manifest = path.join(dir, 'reconstruction-manifest.json');
    fs.writeFileSync(sourceSummary, JSON.stringify({
      path: 'source.png',
      sha256: 'a'.repeat(64),
      width: 390,
      height: 844,
      viewport: { width: 390, height: 844 },
      dpr: 2,
    }));
    fs.writeFileSync(elements, JSON.stringify({
      elements: [{
        specElementId: 'hero-title',
        bbox: { x: 24, y: 32, width: 220, height: 48 },
        resource: { type: 'html', path: 'spec.html' },
        artifact: { type: 'source', path: 'source.png', sha256: 'a'.repeat(64) },
        route: '/home',
        candidates: [{ id: 'html-primary', route: 'html', audit: { status: 'passed' } }],
        selectedCandidate: { id: 'html-primary', audit: { status: 'passed' } },
      }],
    }));

    const built = JSON.parse(run(agentsRoot, 'build-reconstruction-manifest.mjs', [
      '--source-summary', sourceSummary,
      '--elements', elements,
      '--output', manifest,
    ]));
    expect(built.schemaVersion).toBe(1);
    expect(built.source.sha256).toBe('a'.repeat(64));
    expect(built.elements[0].specElementId).toBe('hero-title');
    expect(built.elements[0].selectedCandidateId).toBe('html-primary');
    expect(built).not.toHaveProperty('status');
    expect(built).not.toHaveProperty('review');
    expect(built.elements[0]).not.toHaveProperty('reviewStatus');
    expect(built.elements[0]).not.toHaveProperty('selectedCandidate');
    expect(JSON.parse(run(agentsRoot, 'validate-reconstruction-manifest.mjs', ['--manifest', manifest])).status).toBe('passed');

    const invalid = JSON.parse(JSON.stringify(built));
    invalid.elements[0].candidates[0].audit = { status: 'failed' };
    const invalidPath = path.join(dir, 'invalid.json');
    fs.writeFileSync(invalidPath, JSON.stringify(invalid));
    const invalidRun = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', invalidPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(invalidRun.status).toBe(1);
    expect(JSON.parse(invalidRun.stdout).errors.join('\n')).toMatch(/selected candidate audit/iu);
  });

  it('accepts the canonical bbox/candidate contract and rejects viewport overflow', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-canonical-'));
    const sourcePath = path.join(dir, 'source.png');
    const assetPath = path.join(dir, 'assets/reconstruction/hero.png');
    const generationArtifactsPath = path.join(dir, 'generation-artifacts.json');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    writeFixturePng(sourcePath);
    writeFixturePng(assetPath);
    fs.writeFileSync(generationArtifactsPath, JSON.stringify({ artifacts: [{ id: 'image-artifact-123' }] }));
    const manifestPath = path.join(dir, 'reconstruction-manifest.json');
    const manifest = {
      schemaVersion: 1,
      source: {
        path: 'source.png',
        sha256: crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
        viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
      },
      elements: [{
        id: 'hero-illustration',
        kind: 'image',
        sourceBBox: { x: 20, y: 30, width: 100, height: 80 },
        targetBBox: { x: 20, y: 30, width: 100, height: 80 },
        representation: 'clean-crop',
        candidates: [{
          id: 'hero-source',
          route: 'clean-crop',
          assetPath: 'assets/reconstruction/hero.png',
          audit: { status: 'passed' },
        }, {
          id: 'hero-refined',
          route: 'generated-refined',
          artifactId: 'image-artifact-123',
          assetPath: 'assets/reconstruction/hero.png',
          audit: { status: 'passed' },
        }],
        selectedCandidateId: 'hero-source',
        specElementId: 'reconstruction-hero-illustration',
        reactTarget: null,
      }],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const valid = JSON.parse(run(agentsRoot, 'validate-reconstruction-manifest.mjs', [
      '--manifest', manifestPath,
      '--project-root', dir,
      '--source', sourcePath,
      '--generation-artifacts', generationArtifactsPath,
    ]));
    expect(valid.status).toBe('passed');

    manifest.elements[0].candidates[1].artifactId = 'missing-artifact';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const missingArtifact = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
      '--source', sourcePath,
      '--generation-artifacts', generationArtifactsPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(missingArtifact.status).toBe(1);
    expect(JSON.parse(missingArtifact.stdout).errors.join('\n')).toMatch(/artifact id is missing/iu);

    manifest.elements[0].candidates[1].artifactId = 'image-artifact-123';
    manifest.source.sha256 = 'b'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const changedSource = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
      '--source', sourcePath,
      '--generation-artifacts', generationArtifactsPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(changedSource.status).toBe(1);
    expect(JSON.parse(changedSource.stdout).errors.join('\n')).toMatch(/source hash does not match/iu);

    manifest.source.sha256 = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
    manifest.elements[0].targetBBox.x = 391;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const overflow = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
      '--source', sourcePath,
      '--generation-artifacts', generationArtifactsPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(overflow.status).toBe(1);
    expect(JSON.parse(overflow.stdout).errors.join('\n')).toMatch(/outside source viewport/iu);
  });

  it('compiles scoped Tailwind utilities from the requested spec without preflight or CDN', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-tailwind-'));
    const spec = path.join(dir, 'spec.html');
    const css = path.join(dir, 'tailwind.css');
    fs.writeFileSync(spec, '<div class="recon:bg-slate-900 recon:text-white recon:px-4">Hello</div>');
    const output = run(agentsRoot, 'compile-reconstruction-tailwind.mjs', [
      '--spec', spec,
      '--output', css,
      '--prefix', 'recon',
    ]);
    expect(JSON.parse(output).output).toBe(css);
    const compiled = fs.readFileSync(css, 'utf8');
    expect(compiled).toContain('recon\\:bg-slate-900');
    expect(compiled).toContain('recon\\:text-white');
    expect(compiled).not.toMatch(/unpkg|cdn\.tailwindcss\.com/iu);
    expect(compiled).not.toMatch(/::before|::after|\*\s*\{/u);
  });

});
