#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VALID_ROUTES = new Set(['html', 'svg', 'clean-crop', 'rembg-cutout', 'generated-refined', 'generated-chroma', 'clean-plate']);
const VALID_TEXT_ROLES = new Set(['ui-text', 'brand-text', 'display-text', 'decorative-text']);
const SPECIAL_TEXT_ROLES = new Set(['brand-text', 'display-text', 'decorative-text']);
const VALID_RENDER_MODES = new Set(['html-text', 'font-matched-html', 'preserve-in-image', 'transparent-asset', 'svg', 'manual-review']);
const VALID_OCR_USAGES = new Set(['render', 'semantic-only', 'verification-only']);
const VALID_ASSET_ACTIONS = new Set(['none', 'reuse', 'remove-background', 'rembg', 'reconstruct-svg', 'reconstruct-css', 'regenerate', 'manual-review']);
const FILE_ROUTES = new Set(['svg', 'clean-crop', 'rembg-cutout', 'generated-refined', 'generated-chroma', 'clean-plate']);
const GENERATED_ROUTES = new Set(['generated-refined', 'generated-chroma', 'clean-plate']);
const BITMAP_ROUTES = new Set(['clean-crop', 'rembg-cutout', 'generated-refined', 'generated-chroma', 'clean-plate']);
const VALID_BACKGROUND_MODES = new Set(['preserve', 'existing-alpha', 'known-key', 'complex-remove']);
const ROUTE_BACKGROUND_MODES = new Map([
  ['clean-crop', new Set(['preserve', 'existing-alpha', 'known-key'])],
  ['rembg-cutout', new Set(['complex-remove'])],
  ['generated-refined', new Set(['preserve', 'complex-remove'])],
  ['generated-chroma', new Set(['known-key', 'complex-remove'])],
  ['clean-plate', new Set(['preserve', 'complex-remove'])],
]);
const ACTION_ROUTES = new Map([
  ['none', new Set(['html'])],
  ['reuse', new Set(['svg', 'clean-crop'])],
  ['remove-background', new Set(['rembg-cutout', 'generated-refined', 'generated-chroma'])],
  ['rembg', new Set(['rembg-cutout'])],
  ['reconstruct-svg', new Set(['svg'])],
  ['reconstruct-css', new Set(['html'])],
  ['regenerate', new Set(['generated-refined', 'generated-chroma', 'clean-plate'])],
]);
const RENDER_MODE_ROUTES = new Map([
  ['html-text', new Set(['html'])],
  ['font-matched-html', new Set(['html'])],
  ['preserve-in-image', new Set(['clean-crop', 'generated-refined', 'generated-chroma', 'clean-plate'])],
  ['transparent-asset', new Set(['clean-crop', 'rembg-cutout', 'generated-refined', 'generated-chroma'])],
  ['svg', new Set(['svg'])],
]);
const VALID_STYLE_PROPERTIES = new Set([
  'alignItems', 'background', 'backgroundColor', 'border', 'borderColor', 'borderRadius', 'borderStyle',
  'borderWidth', 'boxShadow', 'color', 'display', 'flexDirection', 'fontFamily', 'fontSize', 'fontStyle',
  'fontWeight', 'gap', 'justifyContent', 'letterSpacing', 'lineHeight', 'objectFit', 'objectPosition', 'opacity',
  'overflow', 'padding', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop', 'textAlign',
  'textDecoration', 'textOverflow', 'textShadow', 'textTransform', 'transform', 'transformOrigin', 'whiteSpace', 'zIndex',
]);
const HASH_PATTERN = /^[a-f0-9]{64}$/iu;

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2);
    result[key] = argv[index + 1]?.startsWith('--') ? true : argv[++index];
  }
  return result;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function present(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

function findArtifactId(value, artifactId) {
  if (!value || typeof value !== 'object') return false;
  if (value.id === artifactId || value.artifactId === artifactId) return true;
  if (Array.isArray(value)) return value.some((item) => findArtifactId(item, artifactId));
  return Object.values(value).some((item) => findArtifactId(item, artifactId));
}

function validateBounds(errors, label, bounds, viewport) {
  if (!isObject(bounds) || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))) {
    errors.push(`${label} must contain numeric x/y/width/height`);
    return;
  }
  if (bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0) {
    errors.push(`${label} must be non-negative with positive dimensions`);
    return;
  }
  if (Number.isFinite(viewport?.width) && (bounds.x + bounds.width > viewport.width || bounds.y + bounds.height > viewport.height)) {
    errors.push(`${label} is outside source viewport`);
  }
}

function resolveAssetPath(projectRoot, assetPath) {
  if (typeof assetPath !== 'string' || !assetPath.trim() || path.isAbsolute(assetPath)) return null;
  const projectRelative = path.resolve(projectRoot, assetPath);
  const relative = path.relative(projectRoot, projectRelative);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  if (fs.existsSync(projectRelative)) {
    const realRoot = fs.realpathSync(projectRoot);
    const realAsset = fs.realpathSync(projectRelative);
    const realRelative = path.relative(realRoot, realAsset);
    if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return null;
  }
  return projectRelative;
}

function candidateAudit(candidate) {
  return candidate?.audit || candidate?.auditReport
    || (candidate?.auditStatus ? { status: candidate.auditStatus } : null)
    || (candidate?.audited === true ? { status: 'passed' } : null);
}

function containsExternalCssImage(value) {
  return /\\|(?:image-set|-webkit-image-set|cross-fade|element|paint|image)\s*\(|(?:https?|file|ftp|data):|\/\//iu.test(value);
}

function validateVisualReviews(errors, label, element) {
  const hasTextReview = Object.prototype.hasOwnProperty.call(element || {}, 'textReview');
  const textReview = element?.textReview;
  if (!hasTextReview) errors.push(`${label} textReview decision is required; use null when no text is visible`);
  else if (textReview !== null && !isObject(textReview)) errors.push(`${label} textReview must be an object or null`);
  else if (textReview) {
    if (!present(textReview.content)) errors.push(`${label} text review content is required`);
    if (!VALID_TEXT_ROLES.has(textReview.textRole)) errors.push(`${label} text review has invalid textRole`);
    if (!VALID_RENDER_MODES.has(textReview.renderMode)) errors.push(`${label} text review has invalid renderMode`);
    if (!VALID_OCR_USAGES.has(textReview.ocrUsage)) errors.push(`${label} text review has invalid ocrUsage`);
    if (textReview.decisionSource !== 'vision-ai') errors.push(`${label} text review decisionSource must be vision-ai`);
    if (!Number.isFinite(textReview.confidence) || textReview.confidence < 0 || textReview.confidence > 1) {
      errors.push(`${label} text review confidence must be from 0 to 1`);
    }
    if (!present(textReview.reason)) errors.push(`${label} text review reason is required`);
    if (SPECIAL_TEXT_ROLES.has(textReview.textRole) && textReview.renderMode === 'html-text') {
      errors.push(`${label} special visual text cannot use html-text without an evidenced font match`);
    }
    if (textReview.ocrUsage === 'render' && !['html-text', 'font-matched-html'].includes(textReview.renderMode)) {
      errors.push(`${label} OCR render usage requires an HTML text render mode`);
    }
    if (textReview.renderMode === 'font-matched-html' && !present(textReview.fontEvidence)) {
      errors.push(`${label} font-matched-html requires fontEvidence`);
    }
    if (textReview.renderMode === 'manual-review') errors.push(`${label} text manual-review must be resolved before rendering`);
  }

  const assetReview = element?.assetReview;
  if (!isObject(assetReview)) errors.push(`${label} asset review decision is required`);
  else {
    if (!VALID_ASSET_ACTIONS.has(assetReview.assetAction)) errors.push(`${label} asset review has invalid assetAction`);
    if (assetReview.decisionSource !== 'vision-ai') errors.push(`${label} asset review decisionSource must be vision-ai`);
    if (!['accepted', 'accepted-with-warning', 'needs-review'].includes(assetReview.status)) {
      errors.push(`${label} asset review has invalid status`);
    }
    if (!present(assetReview.reason)) errors.push(`${label} asset review reason is required`);
    if (assetReview.status === 'needs-review') errors.push(`${label} asset review must be resolved before rendering`);
    if (assetReview.assetAction === 'manual-review') errors.push(`${label} manual-review must be resolved before rendering`);
  }
  if (textReview && SPECIAL_TEXT_ROLES.has(textReview.textRole) && !assetReview) {
    errors.push(`${label} special visual text requires an asset review decision`);
  }
}

export function validateManifest(manifest, options) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!isObject(manifest?.source)) errors.push('source is required');

  const sourceHash = manifest?.source?.sha256 || manifest?.source?.hash;
  if (!HASH_PATTERN.test(String(sourceHash || ''))) errors.push('source hash must be a sha256');
  const viewport = manifest?.source?.viewport;
  if (!isObject(viewport) || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    errors.push('source viewport must contain positive width/height');
  }
  if (options.source) {
    if (!fs.existsSync(options.source)) errors.push('source file is missing');
    else {
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(options.source)).digest('hex');
      if (actualHash !== sourceHash) errors.push('source hash does not match --source');
    }
  }

  let generationArtifacts = null;
  if (options.generationArtifacts) {
    try {
      generationArtifacts = JSON.parse(fs.readFileSync(options.generationArtifacts, 'utf8'));
    } catch {
      errors.push('generation artifacts file is missing or invalid JSON');
    }
  }

  if (!Array.isArray(manifest?.elements)) errors.push('elements must be an array');
  const seenElementIds = new Set();
  const seenSpecElementIds = new Set();
  for (const [index, element] of (manifest?.elements || []).entries()) {
    const label = `elements[${index}]`;
    if (!present(element?.id)) errors.push(`${label} element id is required`);
    else if (seenElementIds.has(element.id)) errors.push(`duplicate element id: ${element.id}`);
    else seenElementIds.add(element.id);
    if (!present(element?.specElementId)) errors.push(`${label} specElementId is required`);
    else if (seenSpecElementIds.has(element.specElementId)) errors.push(`duplicate specElementId: ${element.specElementId}`);
    else seenSpecElementIds.add(element.specElementId);

    const sourceBounds = element?.sourceBBox;
    const targetBounds = element?.targetBBox;
    validateBounds(errors, `${label} sourceBBox`, sourceBounds, viewport);
    validateBounds(errors, `${label} targetBBox`, targetBounds, viewport);
    validateVisualReviews(errors, label, element);
    if (!VALID_ROUTES.has(element?.representation)) errors.push(`${label} invalid representation route`);
    const allowedActionRoutes = ACTION_ROUTES.get(element?.assetReview?.assetAction);
    if (allowedActionRoutes && !allowedActionRoutes.has(element?.representation)) {
      errors.push(`${label} asset action ${element.assetReview.assetAction} is incompatible with representation ${element.representation}`);
    }
    const allowedTextRoutes = RENDER_MODE_ROUTES.get(element?.textReview?.renderMode);
    if (allowedTextRoutes && !allowedTextRoutes.has(element?.representation)) {
      errors.push(`${label} renderMode ${element.textReview.renderMode} is incompatible with representation ${element.representation}`);
    }
    if (element?.visualStyle != null && !isObject(element.visualStyle)) {
      errors.push(`${label} visualStyle must be an object`);
    } else if (isObject(element?.visualStyle)) {
      for (const [property, value] of Object.entries(element.visualStyle)) {
        if (!VALID_STYLE_PROPERTIES.has(property)) errors.push(`${label} unknown visualStyle property: ${property}`);
        if (typeof value === 'string' && /url\s*\(/iu.test(value)) {
          errors.push(`${label} visualStyle cannot contain url(); use a reviewed asset candidate`);
        } else if (typeof value === 'string' && containsExternalCssImage(value)) {
          errors.push(`${label} visualStyle cannot reference external images; use a reviewed asset candidate`);
        }
      }
    }

    const candidates = Array.isArray(element?.candidates) ? element.candidates : [];
    const selectedCandidateId = element?.selectedCandidateId;
    const seenCandidateIds = new Set();
    for (const candidate of candidates) {
      const candidateLabel = `${label} candidate ${candidate?.id || '<unknown>'}`;
      if (!present(candidate?.id)) errors.push(`${label} candidate id is required`);
      else if (seenCandidateIds.has(candidate.id)) errors.push(`${label} duplicate candidate id: ${candidate.id}`);
      else seenCandidateIds.add(candidate.id);
      if (!VALID_ROUTES.has(candidate?.route)) errors.push(`${candidateLabel} has invalid route`);
      if (FILE_ROUTES.has(candidate?.route) && !present(candidate?.assetPath)) {
        errors.push(`${candidateLabel} file candidate assetPath is required`);
      }
      if (candidate?.route === 'rembg-cutout' && !present(candidate?.model)) {
        errors.push(`${candidateLabel} rembg candidate model is required`);
      }
      if (GENERATED_ROUTES.has(candidate?.route) && !present(candidate?.artifactId)) {
        errors.push(`${candidateLabel} generated candidate artifactId is required`);
      }
      if (BITMAP_ROUTES.has(candidate?.route)) {
        if (!present(candidate?.backgroundMode)) errors.push(`${candidateLabel} bitmap candidate backgroundMode is required`);
        else if (!VALID_BACKGROUND_MODES.has(candidate.backgroundMode)) errors.push(`${candidateLabel} has invalid backgroundMode`);
        else if (!ROUTE_BACKGROUND_MODES.get(candidate.route)?.has(candidate.backgroundMode)) {
          errors.push(`${candidateLabel} backgroundMode ${candidate.backgroundMode} is incompatible with route ${candidate.route}`);
        }
      }
      if (candidate?.assetPath) {
        const assetFile = resolveAssetPath(options.projectRoot, candidate.assetPath);
        if (!assetFile) errors.push(`${candidateLabel} asset path must stay inside project root`);
        else if (!fs.existsSync(assetFile)) errors.push(`${candidateLabel} asset file is missing`);
      }
      if (candidate?.artifactId) {
        if (!generationArtifacts) errors.push(`${candidateLabel} requires --generation-artifacts`);
        else if (!findArtifactId(generationArtifacts, candidate.artifactId)) errors.push(`${candidateLabel} artifact id is missing`);
      }
      const audit = candidateAudit(candidate);
      const auditStatus = String(audit?.status || '').toLowerCase();
      if (!['passed', 'ok', 'accepted-with-warning'].includes(auditStatus) && audit?.passed !== true) {
        errors.push(`${candidateLabel} candidate audit must be resolved`);
      }
    }
    if (!present(selectedCandidateId)) errors.push(`${label} selected candidate is required`);
    if (present(selectedCandidateId)) {
      const selectedCandidate = candidates.find((candidate) => candidate?.id === selectedCandidateId);
      if (!selectedCandidate) errors.push(`${label} selected candidate must exist in candidates`);
      else {
        if (element?.representation !== selectedCandidate.route) {
          errors.push(`${label} representation must match selected candidate route`);
        }
        const allowedRoutes = ACTION_ROUTES.get(element?.assetReview?.assetAction);
        if (allowedRoutes && !allowedRoutes.has(selectedCandidate.route)) {
          errors.push(`${label} asset action ${element.assetReview.assetAction} is incompatible with selected candidate route ${selectedCandidate.route}`);
        }
        const audit = candidateAudit(selectedCandidate);
        const auditStatus = String(audit?.status || '').toLowerCase();
        if (!['passed', 'ok', 'accepted-with-warning'].includes(auditStatus) && audit?.passed !== true) {
          errors.push(`${label} selected candidate audit must be passed or explicitly accepted-with-warning`);
        }
      }
    }
  }
  return errors;
}

function main() {
  const flags = parseArgs(process.argv);
  if (!flags.manifest) throw new Error('Usage: --manifest <json> [--project-root <dir>] [--source <png>] [--generation-artifacts <json>]');
  const manifestPath = path.resolve(flags.manifest);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const projectRoot = flags['project-root']
    ? path.resolve(flags['project-root'])
    : path.resolve(path.dirname(manifestPath), '../..');
  const errors = validateManifest(manifest, {
    manifestPath,
    projectRoot,
    source: flags.source ? path.resolve(flags.source) : null,
    generationArtifacts: flags['generation-artifacts'] ? path.resolve(flags['generation-artifacts']) : null,
  });
  const report = { status: errors.length ? 'failed' : 'passed', errors, manifest: manifestPath };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
