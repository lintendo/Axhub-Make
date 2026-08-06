import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const mappings = [
  ['docs', /^(?:\.github\/|README\.md$|CONTRIBUTING\.md$|CODE_OF_CONDUCT\.md$|SECURITY\.md$|LICENSE$|docs\/|scripts\/github\/)/u],
  ['server', /^(?:bin\/|src\/server\/|src\/common\/|tsconfig\.node\.json$)/u],
  ['admin', /^(?:src\/(?:index|components|styles|data|dev-template|spec-template|canvas-template|html-template)\/|vite\.axure-export\.config\.ts$)/u],
  ['client', /^client\//u],
  ['release', /^(?:scripts\/release-|package\.json$)/u],
  ['shared', /^(?:vendor\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|vendor-packages\.config\.json$|vite\.config\.ts$|vitest\.config\.ts$|tsconfig\.json$)/u],
];

export function parseNameStatus(output) {
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();

  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const pathCount = /^[RC]/u.test(status) ? 2 : 1;
    if (index + pathCount > fields.length) {
      throw new Error(`Malformed git name-status record: ${status}`);
    }
    paths.push(...fields.slice(index, index + pathCount));
    index += pathCount;
  }
  return paths;
}

export function classifyChangedPaths(paths) {
  if (paths.length === 0) return ['docs'];

  const areas = new Set();
  for (const filePath of paths) {
    let matched = false;
    for (const [area, pattern] of mappings) {
      if (!pattern.test(filePath)) continue;
      areas.add(area);
      matched = true;
    }
    if (!matched) areas.add('shared');
  }
  return [...areas].sort();
}

export function matrixForAreas(areas) {
  const normalized = areas.length === 0 ? ['docs'] : [...new Set(areas)].sort();
  return { include: normalized.map((area) => ({ area })) };
}

export function changedPathsFromGit(baseSha, headSha) {
  if (!baseSha || !headSha) throw new Error('AXHUB_BASE_SHA and AXHUB_HEAD_SHA are required');
  const output = execFileSync(
    'git',
    ['diff', '--name-status', '-z', `${baseSha}...${headSha}`],
    { encoding: 'utf8', shell: false },
  );
  return parseNameStatus(output);
}

export function runFromEnvironment(env = process.env) {
  const paths = changedPathsFromGit(env.AXHUB_BASE_SHA, env.AXHUB_HEAD_SHA);
  const matrix = matrixForAreas(classifyChangedPaths(paths));
  process.stdout.write(`matrix=${JSON.stringify(matrix)}\n`);
  return matrix;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromEnvironment();
}
