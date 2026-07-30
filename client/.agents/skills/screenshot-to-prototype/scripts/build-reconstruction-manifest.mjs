#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function main() {
  const flags = args(process.argv);
  if (!flags['source-summary'] || !flags.elements || !flags.output) {
    throw new Error('Usage: --source-summary <json> --elements <json> --output <json>');
  }
  const summary = readJson(flags['source-summary']);
  const elementInput = typeof flags.elements === 'string' && flags.elements.endsWith('.json')
    ? readJson(flags.elements)
    : (typeof flags.elements === 'string' ? JSON.parse(flags.elements) : flags.elements);
  const rawSource = summary.source && typeof summary.source === 'object' ? summary.source : summary;
  const width = Number(rawSource.width ?? rawSource.dimensions?.width);
  const height = Number(rawSource.height ?? rawSource.dimensions?.height);
  const viewport = rawSource.viewport || (Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null);
  const source = {
    path: rawSource.path || rawSource.input,
    sha256: rawSource.sha256 || rawSource.hash,
    ...(Number.isFinite(width) ? { width } : {}),
    ...(Number.isFinite(height) ? { height } : {}),
    ...(viewport ? { viewport } : {}),
  };
  const rawElements = Array.isArray(elementInput) ? elementInput : (elementInput.elements || []);
  const elements = rawElements.map((element, index) => {
    const candidates = Array.isArray(element.candidates) ? element.candidates : [];
    const selectedCandidateId = element.selectedCandidateId
      || (typeof element.selectedCandidate === 'string' ? element.selectedCandidate : element.selectedCandidate?.id)
      || (typeof element.selected === 'string' ? element.selected : element.selected?.id)
      || candidates.find((candidate) => candidate?.selected === true)?.id
      || null;
    const selectedCandidate = candidates.find((candidate) => candidate?.id === selectedCandidateId);
    return {
      id: element.id || element.specElementId || `element-${index + 1}`,
      ...(element.name ? { name: element.name } : {}),
      ...(element.kind ? { kind: element.kind } : {}),
      sourceBBox: element.sourceBBox || element.bbox || element.targetBBox,
      targetBBox: element.targetBBox || element.bbox || element.sourceBBox,
      ...(element.representation || selectedCandidate?.route ? { representation: element.representation || selectedCandidate.route } : {}),
      candidates,
      selectedCandidateId,
      specElementId: element.specElementId || element.id || `element-${index + 1}`,
      reactTarget: element.reactTarget ?? null,
    };
  });
  const manifest = {
    schemaVersion: 1,
    source,
    elements,
  };
  const output = path.resolve(flags.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, ...manifest })}\n`);
}

main();
