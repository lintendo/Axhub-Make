#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { readPng } from '../../screenshot-to-prototype/scripts/png-utils.mjs';

const CORE_PATTERN = /中央主视觉|中央载体|核心分析区域|数字孪生|主标题|标题框架|主要数据|核心数据|指标框架|图表框架|表格框架|列表框架|central[-_ ]?(visual|map)|\bmap\b|\b3d\b|\bkpi\b|\bchart\b|\btable\b/i;
const FORBIDDEN_IMPLEMENTATION_PATTERN = /占位|近似|后续替换|稍后替换|待替换|react.{0,24}(阶段|stage)|placeholder|approximate|defer/i;
const FORBIDDEN_IMPLEMENTATION_TYPES = new Set(['placeholder', 'approximation', 'deferred']);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error('Usage: validate-visual-audit.mjs --elements <file> --visual-audit <file> --review <file> --acceptance <file>');
    }
    args[key.slice(2)] = value;
  }
  for (const required of ['elements', 'visual-audit', 'review', 'acceptance']) {
    if (!args[required]) throw new Error(`Missing --${required}`);
  }
  return args;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label} at ${filePath}: ${error.message}`);
  }
}

function hasBox(box) {
  return box
    && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(box[key]))
    && box.width > 0
    && box.height > 0;
}

function boxesEqual(actual, expected) {
  return ['x', 'y', 'width', 'height'].every((key) => actual[key] === expected[key]);
}

function isCore(element) {
  return CORE_PATTERN.test(`${element?.id ?? ''} ${element?.kind ?? ''} ${element?.uiRole ?? ''}`);
}

function resolveEvidence(auditPath, value) {
  if (!value || typeof value !== 'string') return null;
  return path.resolve(path.dirname(auditPath), value);
}

async function validateEvidence(elementId, field, auditPath, value, region, requireVariation, errors) {
  const evidencePath = resolveEvidence(auditPath, value);
  if (!evidencePath || !fs.existsSync(evidencePath)) {
    errors.push(`${elementId}: ${field} evidence file does not exist`);
    return;
  }
  try {
    const auditRoot = `${path.dirname(path.resolve(auditPath))}${path.sep}`;
    if (!evidencePath.startsWith(auditRoot)) throw new Error('visual evidence path escapes the audit directory');
    if (path.extname(evidencePath).toLowerCase() !== '.png') throw new Error('visual evidence must be PNG');
    const image = readPng(evidencePath);
    if (image.width !== region.width || image.height !== region.height) {
      errors.push(`${elementId}: ${field} dimensions ${image.width}x${image.height} do not match region ${region.width}x${region.height}`);
    }
    const visibleColors = new Set();
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (image.data[offset + 3] > 8) {
        visibleColors.add(image.data.subarray(offset, offset + 4).toString('hex'));
        if (visibleColors.size > 1) break;
      }
    }
    if (visibleColors.size === 0 || (requireVariation && visibleColors.size < 2)) {
      errors.push(`${elementId}: ${field} evidence is blank${requireVariation ? ' or single-color' : ''}`);
    }
    return image;
  } catch (error) {
    errors.push(`${elementId}: ${field} is not a decodable image (${error.message})`);
    return null;
  }
}

let args;
let elementsDocument;
let audit;
let review;
let acceptance;
try {
  args = parseArgs(process.argv.slice(2));
  elementsDocument = readJson(args.elements, 'elements');
  audit = readJson(args['visual-audit'], 'visual audit');
  review = readJson(args.review, 'AI review');
  acceptance = readJson(args.acceptance, 'final acceptance');
} catch (error) {
  process.stderr.write(`- ${error.message}\n`);
  process.exit(1);
}
const elements = Array.isArray(elementsDocument.elements) ? elementsDocument.elements : [];
const records = Array.isArray(audit.elements) ? audit.elements : [];
const findings = Array.isArray(review.findings) ? review.findings : null;
const deviations = Array.isArray(acceptance.knownDeviations) ? acceptance.knownDeviations : null;
const errors = [];

if (elements.length === 0) errors.push('elements must be a non-empty array');
if (audit.schemaVersion !== 1) errors.push('visual audit schemaVersion must be 1');
if (!['passed', 'ok'].includes(String(audit.status).toLowerCase())) errors.push('visual audit status must be passed');
if (review.decision !== 'passed') errors.push('review decision must be passed');
if (!findings) errors.push('review findings must be an array');
if (acceptance.status !== 'passed') errors.push(`final acceptance status must be passed, got ${acceptance.status ?? 'missing'}`);
if (!deviations) errors.push('final acceptance knownDeviations must be an array');

const elementById = new Map();
for (const element of elements) {
  if (!element?.id || elementById.has(element.id)) errors.push('each element must have a unique non-empty id');
  else elementById.set(element.id, element);
  if (!hasBox(element?.sourceBBox) || !hasBox(element?.targetBBox)) {
    errors.push(`${element?.id ?? 'unknown element'}: sourceBBox and targetBBox are required`);
  }
}

const recordByElementId = new Map();
for (const record of records) {
  if (!record?.elementId || recordByElementId.has(record.elementId)) {
    errors.push('each visual audit record must have a unique non-empty elementId');
    continue;
  }
  recordByElementId.set(record.elementId, record);
  if (!elementById.has(record.elementId)) errors.push(`${record.elementId}: visual audit record has no matching element`);
}

for (const element of elements) {
  const record = recordByElementId.get(element.id);
  if (!record) {
    errors.push(`${element.id}: missing visual audit record`);
    continue;
  }
  if (!record.implementation || !(record.component || record.outputPath)) {
    errors.push(`${element.id}: final implementation and component/outputPath are required`);
  }
  if (!hasBox(record.sourceRegion) || !hasBox(record.renderedRegion)) {
    errors.push(`${element.id}: sourceRegion and renderedRegion are required`);
  } else {
    if (!boxesEqual(record.sourceRegion, element.sourceBBox) || !boxesEqual(record.renderedRegion, element.targetBBox)) {
      errors.push(`${element.id}: evidence regions must match the element sourceBBox and targetBBox`);
    }
    const [sourceImage, renderedImage] = await Promise.all([
      validateEvidence(element.id, 'sourceEvidence', args['visual-audit'], record.sourceEvidence, record.sourceRegion, isCore(element), errors),
      validateEvidence(element.id, 'renderedEvidence', args['visual-audit'], record.renderedEvidence, record.renderedRegion, isCore(element), errors),
    ]);
    if (sourceImage && renderedImage && sourceImage.width === renderedImage.width && sourceImage.height === renderedImage.height
      && sourceImage.data.equals(renderedImage.data)) {
      errors.push(`${element.id}: source and rendered evidence must not be identical placeholder images`);
    }
  }
  if (!['passed', 'ok'].includes(String(record.status).toLowerCase())) {
    errors.push(`${element.id}: visual audit status must be passed`);
  }
  if (!['high', 'acceptable'].includes(String(record.fidelity).toLowerCase())) {
    errors.push(`${element.id}: fidelity ${record.fidelity ?? 'missing'} is not deliverable`);
  }
  if (!record.selectedRoute || !record.implementedRoute || record.selectedRoute !== record.implementedRoute) {
    errors.push(`${element.id}: implemented route must match selected route`);
  }
  if (!record.implementationType || FORBIDDEN_IMPLEMENTATION_TYPES.has(String(record.implementationType).toLowerCase())
    || FORBIDDEN_IMPLEMENTATION_PATTERN.test(String(record.implementationType))) {
    errors.push(`${element.id}: implementationType ${record.implementationType ?? 'missing'} is not deliverable`);
  }
  if (FORBIDDEN_IMPLEMENTATION_PATTERN.test(`${record.implementation ?? ''} ${record.selectedRoute ?? ''} ${record.implementedRoute ?? ''}`)) {
    errors.push(`${element.id}: implementation describes a placeholder, approximation, or deferred replacement`);
  }
  if (record.routeStatus !== 'implemented' || record.deferredStage) {
    errors.push(`${element.id}: route must be implemented in the HTML spec and not deferred`);
  }
  if (isCore(element) && ['medium', 'high'].includes(String(record.deviation).toLowerCase())) {
    errors.push(`${element.id}: unresolved ${record.deviation} core deviation`);
  }
}

if (records.length !== elements.length) errors.push(`visual audit coverage mismatch: expected ${elements.length}, got ${records.length}`);
if (audit?.summary?.total !== records.length) errors.push(`audit summary total mismatch: expected ${records.length}, got ${audit?.summary?.total}`);
if (audit?.summary?.passed !== records.length || audit?.summary?.failed !== 0) {
  errors.push(`audit summary must report ${records.length} passed and 0 failed`);
}

for (const finding of findings ?? []) {
  const element = elementById.get(finding.elementId);
  if (!finding.elementId || !element) errors.push(`review finding must reference a known elementId: ${finding.elementId ?? 'missing'}`);
  const resolved = finding.resolved === true || String(finding.status).toLowerCase() === 'resolved';
  if (element && isCore(element) && ['medium', 'high'].includes(String(finding.severity).toLowerCase()) && !resolved) {
    errors.push(`unresolved ${finding.severity} review finding in ${finding.area ?? finding.elementId}`);
  }
}

for (const deviation of deviations ?? []) {
  const element = elementById.get(deviation.elementId);
  if (!deviation.elementId || !element) errors.push(`known deviation must reference a known elementId: ${deviation.elementId ?? 'missing'}`);
  if (element && isCore(element) && ['medium', 'high'].includes(String(deviation.severity).toLowerCase())) {
    errors.push(`${deviation.elementId}: final acceptance contains unresolved ${deviation.severity} core deviation`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Visual audit valid: ${records.length}/${elements.length} elements passed\n`);
}
