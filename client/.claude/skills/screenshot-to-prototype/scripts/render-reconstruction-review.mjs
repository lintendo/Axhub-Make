#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { validateManifest } from './validate-reconstruction-manifest.mjs';

const usage = 'Usage: node render-reconstruction-review.mjs --manifest reconstruction-manifest.json --output first-pass.html [--project-root prototype-dir] [--source <png>] [--generation-artifacts <json>]';
const LENGTH_PROPERTIES = new Set([
  'borderRadius', 'borderWidth', 'fontSize', 'gap', 'letterSpacing', 'lineHeight',
  'padding', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop',
]);
const NUMBER_PROPERTIES = new Set(['fontWeight', 'opacity', 'zIndex']);
const STYLE_PROPERTIES = new Map([
  ['alignItems', 'align-items'],
  ['background', 'background'],
  ['backgroundColor', 'background-color'],
  ['border', 'border'],
  ['borderColor', 'border-color'],
  ['borderRadius', 'border-radius'],
  ['borderStyle', 'border-style'],
  ['borderWidth', 'border-width'],
  ['boxShadow', 'box-shadow'],
  ['color', 'color'],
  ['display', 'display'],
  ['flexDirection', 'flex-direction'],
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['fontStyle', 'font-style'],
  ['fontWeight', 'font-weight'],
  ['gap', 'gap'],
  ['justifyContent', 'justify-content'],
  ['letterSpacing', 'letter-spacing'],
  ['lineHeight', 'line-height'],
  ['objectFit', 'object-fit'],
  ['objectPosition', 'object-position'],
  ['opacity', 'opacity'],
  ['overflow', 'overflow'],
  ['padding', 'padding'],
  ['paddingBottom', 'padding-bottom'],
  ['paddingLeft', 'padding-left'],
  ['paddingRight', 'padding-right'],
  ['paddingTop', 'padding-top'],
  ['textAlign', 'text-align'],
  ['textDecoration', 'text-decoration'],
  ['textOverflow', 'text-overflow'],
  ['textShadow', 'text-shadow'],
  ['textTransform', 'text-transform'],
  ['transform', 'transform'],
  ['transformOrigin', 'transform-origin'],
  ['whiteSpace', 'white-space'],
  ['zIndex', 'z-index'],
]);

function containsExternalCssImage(value) {
  return /\\|(?:image-set|-webkit-image-set|cross-fade|element|paint|image)\s*\(|(?:https?|file|ftp|data):|\/\//iu.test(value);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeCssValue(value, property) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`visualStyle.${property} must be finite`);
    if (NUMBER_PROPERTIES.has(property)) return String(value);
    if (LENGTH_PROPERTIES.has(property)) return `${value}px`;
  }
  const stringValue = String(value ?? '').trim();
  if (!stringValue || /[;{}<>]/u.test(stringValue) || /url\s*\(/iu.test(stringValue) || containsExternalCssImage(stringValue)) {
    throw new Error(`visualStyle.${property} contains an unsafe value`);
  }
  return stringValue;
}

function styleFor(element) {
  const bounds = element.targetBBox || element.sourceBBox;
  if (!bounds) throw new Error(`Element ${element.id} is missing targetBBox`);
  const declarations = [
    'position:absolute',
    `left:${bounds.x}px`,
    `top:${bounds.y}px`,
    `width:${bounds.width}px`,
    `height:${bounds.height}px`,
  ];
  for (const [property, cssProperty] of STYLE_PROPERTIES) {
    if (element.visualStyle?.[property] == null) continue;
    declarations.push(`${cssProperty}:${safeCssValue(element.visualStyle[property], property)}`);
  }
  return declarations.join(';');
}

function resolveAsset(projectRoot, outputPath, assetPath) {
  if (typeof assetPath !== 'string' || !assetPath.trim() || path.isAbsolute(assetPath)) {
    throw new Error(`Asset path must stay inside project root: ${assetPath}`);
  }
  const absolute = path.resolve(projectRoot, assetPath);
  const relative = path.relative(projectRoot, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Asset path must stay inside project root: ${assetPath}`);
  }
  if (!fs.existsSync(absolute)) throw new Error(`Asset file is missing: ${assetPath}`);
  const realRoot = fs.realpathSync(projectRoot);
  const realAsset = fs.realpathSync(absolute);
  const realRelative = path.relative(realRoot, realAsset);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error(`Asset path must stay inside project root: ${assetPath}`);
  }
  return path.relative(path.dirname(outputPath), absolute).split(path.sep).join('/');
}

function selectedCandidate(element) {
  const candidates = Array.isArray(element.candidates) ? element.candidates : [];
  return candidates.find((candidate) => candidate.id === element.selectedCandidateId);
}

function assertReviewed(element) {
  if (!element.assetReview || element.assetReview.decisionSource !== 'vision-ai') {
    throw new Error(`Element ${element.id} is missing a vision-ai asset review`);
  }
  if (!['accepted', 'accepted-with-warning'].includes(element.assetReview.status)) {
    throw new Error(`Element ${element.id} has an unresolved asset review`);
  }
  if (element.assetReview.assetAction === 'manual-review') {
    throw new Error(`Element ${element.id} still requires manual review`);
  }
  if (element.textReview && element.textReview.decisionSource !== 'vision-ai') {
    throw new Error(`Element ${element.id} is missing a vision-ai text review`);
  }
  if (element.textReview?.renderMode === 'manual-review') {
    throw new Error(`Element ${element.id} still requires manual text review`);
  }
}

function renderElement(element, context) {
  assertReviewed(element);
  const attributes = [
    `data-reconstruction-id="${escapeHtml(element.specElementId || element.id)}"`,
    `data-asset-action="${escapeHtml(element.assetReview.assetAction)}"`,
    `style="${escapeHtml(styleFor(element))}"`,
  ];
  const textReview = element.textReview;
  if (textReview) {
    attributes.push(`data-text-role="${escapeHtml(textReview.textRole)}"`);
    attributes.push(`data-render-mode="${escapeHtml(textReview.renderMode)}"`);
  }
  if (textReview && ['html-text', 'font-matched-html'].includes(textReview.renderMode)) {
    const tag = element.kind === 'button' ? 'button' : 'div';
    return `<${tag} ${attributes.join(' ')}>${escapeHtml(textReview.content)}</${tag}>`;
  }

  const candidate = selectedCandidate(element);
  if (candidate?.assetPath) {
    const source = resolveAsset(context.projectRoot, context.outputPath, candidate.assetPath);
    const alt = textReview?.ocrUsage === 'semantic-only' ? textReview.content : '';
    return `<img ${attributes.join(' ')} src="${escapeHtml(source)}" alt="${escapeHtml(alt)}">`;
  }
  if (textReview && ['preserve-in-image', 'transparent-asset', 'svg'].includes(textReview.renderMode)) {
    throw new Error(`Element ${element.id} requires a selected image or SVG candidate`);
  }
  return `<div ${attributes.join(' ')}></div>`;
}

function renderHtml(manifest, context) {
  const viewport = manifest.source?.viewport;
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) {
    throw new Error('Manifest source viewport is required');
  }
  const elements = (manifest.elements || []).map((element) => renderElement(element, context)).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:"><meta name="viewport" content="width=device-width,initial-scale=1"><title>截图还原首版视觉稿</title><style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}button{margin:0;padding:0;border:0;font:inherit}.reconstruction-stage{position:relative;overflow:hidden;width:${viewport.width}px;height:${viewport.height}px;background:#fff}img{display:block}
</style></head><body><main class="reconstruction-stage" data-renderer="reconstruction-review-v1" data-model-calls-during-render="0">
${elements}
</main></body></html>`;
}

function main() {
  const flags = parseArgs(process.argv);
  if (!flags.manifest || !flags.output) throw new Error(usage);
  const manifestPath = path.resolve(String(flags.manifest));
  const outputPath = path.resolve(String(flags.output));
  const projectRoot = flags['project-root']
    ? path.resolve(String(flags['project-root']))
    : path.resolve(path.dirname(manifestPath), '../..');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validationErrors = validateManifest(manifest, {
    manifestPath,
    projectRoot,
    source: flags.source ? path.resolve(String(flags.source)) : null,
    generationArtifacts: flags['generation-artifacts'] ? path.resolve(String(flags['generation-artifacts'])) : null,
  });
  if (validationErrors.length) throw new Error(`Manifest validation failed:\n${validationErrors.join('\n')}`);
  const html = renderHtml(manifest, { manifestPath, outputPath, projectRoot });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${html}\n`);
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    renderer: 'reconstruction-review-v1',
    modelCallsDuringRender: 0,
    elementCount: manifest.elements?.length || 0,
    viewport: manifest.source?.viewport,
  })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
