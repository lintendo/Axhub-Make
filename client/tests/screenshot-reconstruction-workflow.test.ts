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
      'SKILL.md',
      'scripts/build-reconstruction-manifest.mjs',
      'scripts/validate-reconstruction-manifest.mjs',
      'scripts/compile-reconstruction-tailwind.mjs',
      'scripts/render-reconstruction-review.mjs',
    ];
    for (const relativeFile of relativeFiles) {
      expect(fs.existsSync(path.join(agentsRoot, relativeFile)), `${relativeFile} missing in .agents`).toBe(true);
      expect(fs.existsSync(path.join(claudeRoot, relativeFile)), `${relativeFile} missing in .claude`).toBe(true);
      expect(fs.readFileSync(path.join(agentsRoot, relativeFile), 'utf8')).toBe(
        fs.readFileSync(path.join(claudeRoot, relativeFile), 'utf8'),
      );
    }
    expect(fs.readFileSync(path.join(agentsRoot, 'SKILL.md'), 'utf8')).toContain(
      '禁止使用 `first-pass.html` 代替 `templates/prototype-spec.html` 创建 `spec.html`。',
    );
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
        id: 'hero-title',
        specElementId: 'hero-title',
        uiRole: 'primary-action',
        bbox: { x: 24, y: 32, width: 220, height: 48 },
        textReview: {
          content: '立即办理',
          textRole: 'ui-text',
          renderMode: 'html-text',
          ocrUsage: 'render',
          decisionSource: 'vision-ai',
          confidence: 0.98,
          reason: '标准按钮文字，可编辑性优先',
        },
        assetReview: {
          assetAction: 'none',
          decisionSource: 'vision-ai',
          status: 'accepted',
          reason: '普通可编辑界面文字',
        },
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
    expect(built.elements[0].uiRole).toBe('primary-action');
    expect(built.elements[0].textReview).toMatchObject({
      textRole: 'ui-text',
      renderMode: 'html-text',
      decisionSource: 'vision-ai',
    });
    expect(built.elements[0].assetReview).toMatchObject({ assetAction: 'none', status: 'accepted' });
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

  it('deterministically renders reviewed text and assets without model-authored HTML', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-render-'));
    const assetsDir = path.join(dir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    writeFixturePng(path.join(assetsDir, 'brand.png'));
    writeFixturePng(path.join(assetsDir, 'poster.png'));
    const manifestPath = path.join(dir, 'reconstruction-manifest.json');
    const outputPath = path.join(dir, 'first-pass.html');
    fs.writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1,
      source: {
        path: 'source.png',
        sha256: 'a'.repeat(64),
        viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
      },
      elements: [{
        id: 'action-label',
        kind: 'button',
        sourceBBox: { x: 20, y: 20, width: 120, height: 44 },
        targetBBox: { x: 20, y: 20, width: 120, height: 44 },
        representation: 'html',
        textReview: {
          content: '立即办理', textRole: 'ui-text', renderMode: 'html-text',
          ocrUsage: 'render', decisionSource: 'vision-ai', confidence: 0.99, reason: '标准按钮文字',
        },
        assetReview: {
          assetAction: 'none', decisionSource: 'vision-ai', status: 'accepted', reason: '普通界面文字',
        },
        visualStyle: {
          color: '#ffffff', backgroundColor: '#1268d7', borderRadius: 8, fontSize: 16,
          transform: 'translateX(1px)', whiteSpace: 'nowrap',
        },
        candidates: [{ id: 'action-html', route: 'html', audit: { status: 'passed' } }],
        selectedCandidateId: 'action-html',
        specElementId: 'action-label',
        reactTarget: null,
      }, {
        id: 'brand-logo',
        kind: 'image',
        sourceBBox: { x: 20, y: 80, width: 100, height: 40 },
        targetBBox: { x: 20, y: 80, width: 100, height: 40 },
        representation: 'clean-crop',
        textReview: {
          content: '品牌标识', textRole: 'brand-text', renderMode: 'preserve-in-image',
          ocrUsage: 'semantic-only', decisionSource: 'vision-ai', confidence: 0.96, reason: '自定义品牌字形',
        },
        assetReview: {
          assetAction: 'reuse', decisionSource: 'vision-ai', status: 'accepted', reason: '自定义品牌字形',
        },
        candidates: [{
          id: 'brand-image', route: 'clean-crop', backgroundMode: 'existing-alpha',
          assetPath: 'assets/brand.png', audit: { status: 'passed' },
        }],
        selectedCandidateId: 'brand-image',
        specElementId: 'brand-logo',
        reactTarget: null,
      }, {
        id: 'campaign-poster',
        kind: 'image',
        sourceBBox: { x: 20, y: 140, width: 350, height: 180 },
        targetBBox: { x: 20, y: 140, width: 350, height: 180 },
        representation: 'clean-crop',
        textReview: {
          content: '海报艺术字', textRole: 'display-text', renderMode: 'preserve-in-image',
          ocrUsage: 'semantic-only', decisionSource: 'vision-ai', confidence: 0.97, reason: '文字属于海报构图',
        },
        assetReview: {
          assetAction: 'reuse', decisionSource: 'vision-ai', status: 'accepted', reason: '文字属于海报构图',
        },
        candidates: [{
          id: 'poster-image', route: 'clean-crop', backgroundMode: 'preserve',
          assetPath: 'assets/poster.png', audit: { status: 'passed' },
        }],
        selectedCandidateId: 'poster-image',
        specElementId: 'campaign-poster',
        reactTarget: null,
      }],
    }, null, 2));

    const first = run(agentsRoot, 'render-reconstruction-review.mjs', [
      '--manifest', manifestPath,
      '--project-root', dir,
      '--output', outputPath,
    ]);
    const firstHtml = fs.readFileSync(outputPath, 'utf8');
    const second = run(agentsRoot, 'render-reconstruction-review.mjs', [
      '--manifest', manifestPath,
      '--project-root', dir,
      '--output', outputPath,
    ]);
    const secondHtml = fs.readFileSync(outputPath, 'utf8');
    expect(JSON.parse(first).modelCallsDuringRender).toBe(0);
    expect(JSON.parse(second).modelCallsDuringRender).toBe(0);
    expect(secondHtml).toBe(firstHtml);
    expect(firstHtml).toContain('data-renderer="reconstruction-review-v1"');
    expect(firstHtml).toContain('data-model-calls-during-render="0"');
    expect(firstHtml).toContain("Content-Security-Policy");
    expect(firstHtml).toContain("img-src 'self' data:");
    expect(firstHtml).toContain('width:390px;height:844px');
    expect(firstHtml).toContain('data-reconstruction-id="action-label"');
    expect(firstHtml).toContain('>立即办理</button>');
    expect(firstHtml).toContain('transform:translateX(1px)');
    expect(firstHtml).toContain('white-space:nowrap');
    expect(firstHtml).toContain('src="assets/brand.png"');
    expect(firstHtml).toContain('src="assets/poster.png"');
    expect(firstHtml).not.toContain('source.png');

    const failedAudit = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    failedAudit.elements[1].candidates[0].audit.status = 'failed';
    fs.writeFileSync(manifestPath, JSON.stringify(failedAudit));
    const rejectedRender = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/render-reconstruction-review.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
      '--output', outputPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(rejectedRender.status).toBe(1);
    expect(rejectedRender.stderr).toMatch(/manifest validation failed/iu);
    expect(rejectedRender.stderr).toMatch(/selected candidate audit/iu);
  });

  it('requires stable element ids during manifest build and validation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-id-'));
    const sourceSummary = path.join(dir, 'source-summary.json');
    const elementsPath = path.join(dir, 'elements.json');
    const manifestPath = path.join(dir, 'reconstruction-manifest.json');
    fs.writeFileSync(sourceSummary, JSON.stringify({
      path: 'source.png', sha256: 'a'.repeat(64), viewport: { width: 390, height: 844 },
    }));
    const elementWithoutId = {
      specElementId: 'unstable-element',
      kind: 'image',
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      representation: 'html',
      textReview: null,
      assetReview: {
        assetAction: 'none', decisionSource: 'vision-ai', status: 'accepted', reason: '空布局占位',
      },
      candidates: [{ id: 'html', route: 'html', audit: { status: 'passed' } }],
      selectedCandidateId: 'html',
    };
    fs.writeFileSync(elementsPath, JSON.stringify({ elements: [elementWithoutId] }));
    const build = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/build-reconstruction-manifest.mjs'),
      '--source-summary', sourceSummary,
      '--elements', elementsPath,
      '--output', manifestPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(build.status).toBe(1);
    expect(build.stderr).toMatch(/elements\[0\] id is required/iu);

    fs.writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1,
      source: { path: 'source.png', sha256: 'a'.repeat(64), viewport: { width: 390, height: 844 } },
      elements: [{
        ...elementWithoutId,
        sourceBBox: elementWithoutId.bbox,
        targetBBox: elementWithoutId.bbox,
      }],
    }));
    const validation = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(validation.status).toBe(1);
    expect(JSON.parse(validation.stdout).errors.join('\n')).toMatch(/element id is required/iu);
  });

  it('rejects unreviewed or ordinary-HTML rendering for special visual text', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-text-review-'));
    const manifestPath = path.join(dir, 'reconstruction-manifest.json');
    const manifest = {
      schemaVersion: 1,
      source: { path: 'source.png', sha256: 'a'.repeat(64), viewport: { width: 390, height: 844 } },
      elements: [{
        id: 'campaign-title',
        kind: 'text',
        sourceBBox: { x: 20, y: 20, width: 240, height: 50 },
        targetBBox: { x: 20, y: 20, width: 240, height: 50 },
        representation: 'html',
        textReview: {
          content: '盛夏焕新', textRole: 'display-text', renderMode: 'html-text',
          ocrUsage: 'render', decisionSource: 'ocr', confidence: 0.9,
        },
        assetReview: { assetAction: 'none', decisionSource: 'ocr', status: 'accepted', reason: 'OCR 已识别' },
        candidates: [{ id: 'title-html', route: 'html', audit: { status: 'passed' } }],
        selectedCandidateId: 'title-html',
        specElementId: 'campaign-title',
        reactTarget: null,
      }],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', manifestPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(result.status).toBe(1);
    const errors = JSON.parse(result.stdout).errors.join('\n');
    expect(errors).toMatch(/text review decisionSource must be vision-ai/iu);
    expect(errors).toMatch(/special visual text cannot use html-text/iu);
    expect(errors).toMatch(/text review reason is required/iu);
    expect(errors).toMatch(/asset review decisionSource must be vision-ai/iu);
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
        textReview: null,
        assetReview: {
          assetAction: 'reuse',
          decisionSource: 'vision-ai',
          status: 'accepted',
          reason: '图片素材已通过候选审计',
        },
        candidates: [{
          id: 'hero-source',
          route: 'clean-crop',
          backgroundMode: 'preserve',
          assetPath: 'assets/reconstruction/hero.png',
          audit: { status: 'passed' },
        }, {
          id: 'hero-refined',
          route: 'generated-refined',
          backgroundMode: 'complex-remove',
          artifactId: 'image-artifact-123',
          assetPath: 'assets/reconstruction/hero.png',
          audit: { status: 'passed' },
        }, {
          id: 'hero-cutout',
          route: 'rembg-cutout',
          backgroundMode: 'complex-remove',
          model: 'birefnet-general',
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

    const flattenedPage = JSON.parse(JSON.stringify(manifest));
    flattenedPage.elements[0].representation = 'flatten-in-page';
    flattenedPage.elements[0].candidates = [{
      id: 'whole-page-image',
      route: 'flatten-in-page',
      audit: { status: 'passed' },
    }];
    flattenedPage.elements[0].selectedCandidateId = 'whole-page-image';
    fs.writeFileSync(manifestPath, JSON.stringify(flattenedPage));
    const flattenedPageRun = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
      '--source', sourcePath,
      '--generation-artifacts', generationArtifactsPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(flattenedPageRun.status).toBe(1);
    expect(JSON.parse(flattenedPageRun.stdout).errors.join('\n')).toMatch(/invalid representation route/iu);

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

  it('rejects manifests that have not completed explicit text and asset review', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-review-gate-'));
    const manifestPath = path.join(dir, 'reconstruction-manifest.json');
    const baseElement = {
      id: 'review-gate',
      kind: 'image',
      sourceBBox: { x: 0, y: 0, width: 100, height: 100 },
      targetBBox: { x: 0, y: 0, width: 100, height: 100 },
      representation: 'html',
      candidates: [{ id: 'empty-html', route: 'html', audit: { status: 'passed' } }],
      selectedCandidateId: 'empty-html',
      specElementId: 'review-gate',
      reactTarget: null,
    };
    const validate = (element: Record<string, unknown>) => {
      fs.writeFileSync(manifestPath, JSON.stringify({
        schemaVersion: 1,
        source: { path: 'source.png', sha256: 'a'.repeat(64), viewport: { width: 390, height: 844 } },
        elements: [element],
      }));
      return spawnSync(process.execPath, [
        path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
        '--manifest', manifestPath,
      ], { cwd: appRoot, encoding: 'utf8' });
    };

    const missing = validate(baseElement);
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout).errors.join('\n')).toMatch(/textReview decision is required/iu);
    expect(JSON.parse(missing.stdout).errors.join('\n')).toMatch(/asset review decision is required/iu);

    const unresolved = validate({
      ...baseElement,
      textReview: null,
      assetReview: {
        assetAction: 'manual-review',
        decisionSource: 'vision-ai',
        status: 'needs-review',
        reason: '字形和背景尚未确认',
      },
    });
    expect(unresolved.status).toBe(1);
    const unresolvedErrors = JSON.parse(unresolved.stdout).errors.join('\n');
    expect(unresolvedErrors).toMatch(/asset review must be resolved before rendering/iu);
    expect(unresolvedErrors).toMatch(/manual-review must be resolved before rendering/iu);

    const unresolvedText = validate({
      ...baseElement,
      textReview: {
        content: '品牌字样',
        textRole: 'brand-text',
        renderMode: 'manual-review',
        ocrUsage: 'verification-only',
        decisionSource: 'vision-ai',
        confidence: 0.5,
        reason: '字形尚未确认',
      },
      assetReview: {
        assetAction: 'reuse',
        decisionSource: 'vision-ai',
        status: 'accepted',
        reason: '素材候选本身已审计',
      },
    });
    expect(unresolvedText.status).toBe(1);
    expect(JSON.parse(unresolvedText.stdout).errors.join('\n')).toMatch(/text manual-review must be resolved before rendering/iu);
  });

  it('rejects candidate assets outside the project root in validation and rendering', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-path-'));
    const outsidePath = path.join(os.tmpdir(), `${path.basename(dir)}-outside.png`);
    writeFixturePng(outsidePath);
    const manifestPath = path.join(dir, 'reconstruction-manifest.json');
    const outputPath = path.join(dir, 'first-pass.html');
    fs.writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1,
      source: { path: 'source.png', sha256: 'a'.repeat(64), viewport: { width: 390, height: 844 } },
      elements: [{
        id: 'unsafe-asset',
        kind: 'image',
        sourceBBox: { x: 0, y: 0, width: 100, height: 100 },
        targetBBox: { x: 0, y: 0, width: 100, height: 100 },
        representation: 'clean-crop',
        textReview: null,
        assetReview: {
          assetAction: 'reuse', decisionSource: 'vision-ai', status: 'accepted', reason: '待验证路径范围',
        },
        candidates: [{
          id: 'outside', route: 'clean-crop', backgroundMode: 'existing-alpha',
          assetPath: path.relative(dir, outsidePath), audit: { status: 'passed' },
        }],
        selectedCandidateId: 'outside',
        specElementId: 'unsafe-asset',
        reactTarget: null,
      }],
    }));

    const validation = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(validation.status).toBe(1);
    expect(JSON.parse(validation.stdout).errors.join('\n')).toMatch(/asset path must stay inside project root/iu);

    const rendering = spawnSync(process.execPath, [
      path.join(agentsRoot, 'scripts/render-reconstruction-review.mjs'),
      '--manifest', manifestPath,
      '--project-root', dir,
      '--output', outputPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(rendering.status).toBe(1);
    expect(rendering.stderr).toMatch(/asset path must stay inside project root/iu);
  });

  it('enforces representation routes, candidate provenance, and controlled CSS', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-reconstruction-contract-'));
    const assetsDir = path.join(dir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    writeFixturePng(path.join(assetsDir, 'candidate.png'));
    const manifestPath = path.join(dir, 'reconstruction-manifest.json');
    const baseElement = {
      id: 'contract-element',
      kind: 'image',
      sourceBBox: { x: 0, y: 0, width: 100, height: 100 },
      targetBBox: { x: 0, y: 0, width: 100, height: 100 },
      textReview: null,
      assetReview: {
        assetAction: 'reuse', decisionSource: 'vision-ai', status: 'accepted', reason: '素材已确认',
      },
      specElementId: 'contract-element',
      reactTarget: null,
    };
    const validate = (element: Record<string, unknown>, extraArgs: string[] = []) => {
      fs.writeFileSync(manifestPath, JSON.stringify({
        schemaVersion: 1,
        source: { path: 'source.png', sha256: 'a'.repeat(64), viewport: { width: 390, height: 844 } },
        elements: [element],
      }));
      return spawnSync(process.execPath, [
        path.join(agentsRoot, 'scripts/validate-reconstruction-manifest.mjs'),
        '--manifest', manifestPath,
        '--project-root', dir,
        ...extraArgs,
      ], { cwd: appRoot, encoding: 'utf8' });
    };

    const missingFile = validate({
      ...baseElement,
      representation: 'svg',
      candidates: [{ id: 'logo-svg', route: 'svg', audit: { status: 'passed' } }],
      selectedCandidateId: 'logo-svg',
    });
    expect(missingFile.status).toBe(1);
    expect(JSON.parse(missingFile.stdout).errors.join('\n')).toMatch(/file candidate assetPath is required/iu);

    const noSelection = validate({
      ...baseElement,
      representation: 'clean-crop',
      candidates: [],
      selectedCandidateId: null,
    });
    expect(noSelection.status).toBe(1);
    expect(JSON.parse(noSelection.stdout).errors.join('\n')).toMatch(/selected candidate is required/iu);

    const mismatchedRoute = validate({
      ...baseElement,
      representation: 'html',
      assetReview: {
        assetAction: 'reconstruct-css', decisionSource: 'vision-ai', status: 'accepted', reason: '使用 CSS 重构',
      },
      candidates: [{
        id: 'wrong-route', route: 'rembg-cutout', backgroundMode: 'complex-remove',
        model: 'birefnet-general', audit: { status: 'passed' },
      }],
      selectedCandidateId: 'wrong-route',
    });
    expect(mismatchedRoute.status).toBe(1);
    const routeErrors = JSON.parse(mismatchedRoute.stdout).errors.join('\n');
    expect(routeErrors).toMatch(/representation must match selected candidate route/iu);
    expect(routeErrors).toMatch(/asset action reconstruct-css is incompatible/iu);

    const mismatchedTextMode = validate({
      ...baseElement,
      representation: 'html',
      textReview: {
        content: '海报标题', textRole: 'display-text', renderMode: 'preserve-in-image',
        ocrUsage: 'semantic-only', decisionSource: 'vision-ai', confidence: 0.95, reason: '标题属于海报构图',
      },
      assetReview: {
        assetAction: 'none', decisionSource: 'vision-ai', status: 'accepted', reason: '错误的 HTML 路线',
      },
      candidates: [{ id: 'html', route: 'html', audit: { status: 'passed' } }],
      selectedCandidateId: 'html',
    });
    expect(mismatchedTextMode.status).toBe(1);
    expect(JSON.parse(mismatchedTextMode.stdout).errors.join('\n')).toMatch(/renderMode preserve-in-image is incompatible with representation html/iu);

    const untrackedGeneration = validate({
      ...baseElement,
      representation: 'generated-refined',
      assetReview: {
        assetAction: 'regenerate', decisionSource: 'vision-ai', status: 'accepted', reason: '生成素材已确认',
      },
      candidates: [{
        id: 'generated', route: 'generated-refined', backgroundMode: 'complex-remove',
        assetPath: 'assets/generated.png', audit: { status: 'passed' },
      }],
      selectedCandidateId: 'generated',
    });
    expect(untrackedGeneration.status).toBe(1);
    expect(JSON.parse(untrackedGeneration.stdout).errors.join('\n')).toMatch(/generated candidate artifactId is required/iu);

    const missingModel = validate({
      ...baseElement,
      representation: 'rembg-cutout',
      assetReview: {
        assetAction: 'rembg', decisionSource: 'vision-ai', status: 'accepted', reason: '抠图结果已确认',
      },
      candidates: [{
        id: 'rembg', route: 'rembg-cutout', backgroundMode: 'complex-remove',
        assetPath: 'assets/rembg.png', audit: { status: 'passed' },
      }],
      selectedCandidateId: 'rembg',
    });
    expect(missingModel.status).toBe(1);
    expect(JSON.parse(missingModel.stdout).errors.join('\n')).toMatch(/rembg candidate model is required/iu);

    const uncontrolledCss = validate({
      ...baseElement,
      representation: 'html',
      assetReview: {
        assetAction: 'reconstruct-css', decisionSource: 'vision-ai', status: 'accepted', reason: '使用 CSS 重构',
      },
      visualStyle: { background: 'url(https://example.invalid/tracker.png)' },
      candidates: [{ id: 'html', route: 'html', audit: { status: 'passed' } }],
      selectedCandidateId: 'html',
    });
    expect(uncontrolledCss.status).toBe(1);
    expect(JSON.parse(uncontrolledCss.stdout).errors.join('\n')).toMatch(/visualStyle cannot contain url/iu);

    for (const background of [
      'image-set("https://example.invalid/tracker.png" 1x)',
      String.raw`u\72l(https://example.invalid/tracker.png)`,
    ]) {
      const bypass = validate({
        ...baseElement,
        representation: 'html',
        assetReview: {
          assetAction: 'reconstruct-css', decisionSource: 'vision-ai', status: 'accepted', reason: '使用 CSS 重构',
        },
        visualStyle: { background },
        candidates: [{ id: 'html', route: 'html', audit: { status: 'passed' } }],
        selectedCandidateId: 'html',
      });
      expect(bypass.status).toBe(1);
      expect(JSON.parse(bypass.stdout).errors.join('\n')).toMatch(/visualStyle cannot reference external images/iu);
    }

    const missingBackgroundMode = validate({
      ...baseElement,
      representation: 'clean-crop',
      candidates: [{
        id: 'bitmap', route: 'clean-crop', assetPath: 'assets/candidate.png', audit: { status: 'passed' },
      }],
      selectedCandidateId: 'bitmap',
    });
    expect(missingBackgroundMode.status).toBe(1);
    expect(JSON.parse(missingBackgroundMode.stdout).errors.join('\n')).toMatch(/bitmap candidate backgroundMode is required/iu);

    const unauditedAlternate = validate({
      ...baseElement,
      representation: 'clean-crop',
      candidates: [{
        id: 'selected', route: 'clean-crop', backgroundMode: 'preserve',
        assetPath: 'assets/candidate.png', audit: { status: 'passed' },
      }, {
        id: 'alternate', route: 'clean-crop', backgroundMode: 'preserve',
        assetPath: 'assets/candidate.png',
      }],
      selectedCandidateId: 'selected',
    });
    expect(unauditedAlternate.status).toBe(1);
    expect(JSON.parse(unauditedAlternate.stdout).errors.join('\n')).toMatch(/candidate audit must be resolved/iu);

    const unknownStyle = validate({
      ...baseElement,
      representation: 'html',
      assetReview: {
        assetAction: 'reconstruct-css', decisionSource: 'vision-ai', status: 'accepted', reason: '使用 CSS 重构',
      },
      visualStyle: { filter: 'blur(2px)' },
      candidates: [{ id: 'html', route: 'html', audit: { status: 'passed' } }],
      selectedCandidateId: 'html',
    });
    expect(unknownStyle.status).toBe(1);
    expect(JSON.parse(unknownStyle.stdout).errors.join('\n')).toMatch(/unknown visualStyle property: filter/iu);

    const nonCanonical = validate({
      ...baseElement,
      sourceBBox: undefined,
      targetBBox: undefined,
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      representation: 'html',
      assetReview: {
        assetAction: 'none', decisionSource: 'vision-ai', status: 'accepted', reason: '空布局占位',
      },
      candidates: [{ id: 'html', route: 'html', audit: { status: 'passed' }, selected: true }],
      selectedCandidateId: undefined,
      selectedCandidate: 'html',
    });
    expect(nonCanonical.status).toBe(1);
    const canonicalErrors = JSON.parse(nonCanonical.stdout).errors.join('\n');
    expect(canonicalErrors).toMatch(/sourceBBox must contain numeric/iu);
    expect(canonicalErrors).toMatch(/targetBBox must contain numeric/iu);
    expect(canonicalErrors).toMatch(/selected candidate is required/iu);

    const duplicateCandidates = validate({
      ...baseElement,
      representation: 'html',
      assetReview: {
        assetAction: 'none', decisionSource: 'vision-ai', status: 'accepted', reason: '空布局占位',
      },
      candidates: [
        { id: 'html', route: 'html', audit: { status: 'passed' } },
        { id: 'html', route: 'html', audit: { status: 'passed' } },
      ],
      selectedCandidateId: 'html',
    });
    expect(duplicateCandidates.status).toBe(1);
    expect(JSON.parse(duplicateCandidates.stdout).errors.join('\n')).toMatch(/duplicate candidate id: html/iu);

    const staleAuditBypass = validate({
      ...baseElement,
      representation: 'html',
      assetReview: {
        assetAction: 'none', decisionSource: 'vision-ai', status: 'accepted', reason: '空布局占位',
      },
      candidates: [{ id: 'html', route: 'html', audit: { status: 'failed' } }],
      selectedCandidateId: 'html',
      selectedCandidate: { id: 'html', audit: { status: 'passed' } },
    });
    expect(staleAuditBypass.status).toBe(1);
    expect(JSON.parse(staleAuditBypass.stdout).errors.join('\n')).toMatch(/selected candidate audit/iu);
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
