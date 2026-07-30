#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const VALID_ROUTES = new Set(['html', 'svg', 'clean-crop', 'generated-refined', 'generated-chroma', 'flatten-in-page', 'clean-plate']);
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

function resolveAssetPath(manifestPath, projectRoot, assetPath) {
  const manifestRelative = path.resolve(path.dirname(manifestPath), assetPath);
  const projectRelative = path.resolve(projectRoot, assetPath);
  if (fs.existsSync(manifestRelative)) return manifestRelative;
  if (fs.existsSync(projectRelative)) return projectRelative;
  return projectRelative;
}

function candidateAudit(candidate) {
  return candidate?.audit || candidate?.auditReport
    || (candidate?.auditStatus ? { status: candidate.auditStatus } : null)
    || (candidate?.audited === true ? { status: 'passed' } : null);
}

function validate(manifest, options) {
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
  const seenSpecElementIds = new Set();
  for (const [index, element] of (manifest?.elements || []).entries()) {
    const label = `elements[${index}]`;
    if (!present(element?.specElementId)) errors.push(`${label} specElementId is required`);
    else if (seenSpecElementIds.has(element.specElementId)) errors.push(`duplicate specElementId: ${element.specElementId}`);
    else seenSpecElementIds.add(element.specElementId);

    validateBounds(errors, `${label} sourceBBox`, element?.sourceBBox || element?.bbox, viewport);
    validateBounds(errors, `${label} targetBBox`, element?.targetBBox || element?.bbox || element?.sourceBBox, viewport);
    if (element?.representation && !VALID_ROUTES.has(element.representation)) errors.push(`${label} invalid representation route`);

    const candidates = Array.isArray(element?.candidates) ? element.candidates : [];
    const selectedCandidateId = typeof element?.selectedCandidate === 'string'
      ? element.selectedCandidate
      : element?.selectedCandidateId || element?.selectedCandidate?.id || candidates.find((candidate) => candidate?.selected === true)?.id;
    for (const candidate of candidates) {
      const candidateLabel = `${label} candidate ${candidate?.id || '<unknown>'}`;
      if (!present(candidate?.id)) errors.push(`${label} candidate id is required`);
      if (!VALID_ROUTES.has(candidate?.route)) errors.push(`${candidateLabel} has invalid route`);
      if (candidate?.assetPath) {
        const assetFile = resolveAssetPath(options.manifestPath, options.projectRoot, candidate.assetPath);
        if (!fs.existsSync(assetFile)) errors.push(`${candidateLabel} asset file is missing`);
      }
      if (candidate?.artifactId) {
        if (!generationArtifacts) errors.push(`${candidateLabel} requires --generation-artifacts`);
        else if (!findArtifactId(generationArtifacts, candidate.artifactId)) errors.push(`${candidateLabel} artifact id is missing`);
      }
    }
    if (candidates.length > 0 && !present(selectedCandidateId)) errors.push(`${label} selected candidate is required`);
    if (present(selectedCandidateId)) {
      const selectedCandidate = candidates.find((candidate) => candidate?.id === selectedCandidateId);
      if (!selectedCandidate) errors.push(`${label} selected candidate must exist in candidates`);
      else {
        const audit = candidateAudit(element?.selectedCandidate) || candidateAudit(selectedCandidate);
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
  const errors = validate(manifest, {
    manifestPath,
    projectRoot,
    source: flags.source ? path.resolve(flags.source) : null,
    generationArtifacts: flags['generation-artifacts'] ? path.resolve(flags['generation-artifacts']) : null,
  });
  const report = { status: errors.length ? 'failed' : 'passed', errors, manifest: manifestPath };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
