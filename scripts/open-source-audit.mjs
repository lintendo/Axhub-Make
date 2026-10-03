import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const allowedMakeMetadata = new Set([
  'client/.axhub/make/README.md',
  'client/.axhub/make/axhub.config.json',
  'client/.axhub/make/client.json',
  'client/.axhub/make/sidebar-tree.json',
]);

const forbiddenPathRules = [
  ['development-process-doc', /^docs\/superpowers(?:\/|$)/u],
  ['generated-report', /(?:^|\/)(?:automation-reports|midscene_run|test-results|coverage)(?:\/|$)/u],
  ['local-workspace', /(?:^|\/)(?:\.local|\.release|node_modules)(?:\/|$)/u],
  ['runtime-session', /(?:^|\/)\.sessions(?:\/|$)/u],
];

const sensitiveTextRules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/u],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u],
  ['openai-token', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u],
  ['posix-home-path', /(?<![A-Za-z0-9._-])\/(?:Users|home)\/[^/\s"'<>]+(?:\/|$)/u],
  ['mac-volume-path', /\/Volumes\/[^/\s"'<>]+(?:\/|$)/u],
  ['windows-home-path', /\b[A-Za-z]:\\Users\\[^\\\s"'<>]+(?:\\|$)/u],
  ['known-local-identity', new RegExp(['jian', 'zhoulin'].join(''), 'iu')],
];

const syntheticTestHomeNames = new Set(['demo', 'person', 'tester']);
const testFileRule = /\.test\.(?:[cm]?[jt]sx?)$/u;
const homePathCaptures = {
  'posix-home-path': /(?<![A-Za-z0-9._-])\/(?:Users|home)\/([^/\s"'<>]+)(?:\/|$)/gu,
  'windows-home-path': /\b[A-Za-z]:\\Users\\([^\\\s"'<>]+)(?:\\|$)/gu,
};

function isSyntheticTestHomePath(filePath, rule, line) {
  if (!testFileRule.test(filePath)) return false;
  const capture = homePathCaptures[rule];
  if (!capture) return false;
  const matches = [...line.matchAll(capture)];
  return matches.length > 0 && matches.every((match) => syntheticTestHomeNames.has(match[1]));
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/').replace(/^\.\//u, '');
}

export function findForbiddenPathFindings(paths) {
  const findings = [];
  for (const rawPath of paths) {
    const filePath = normalizePath(rawPath);
    if (filePath.startsWith('client/.axhub/make/') && !allowedMakeMetadata.has(filePath)) {
      findings.push({ path: filePath, rule: 'disallowed-make-metadata' });
      continue;
    }
    const match = forbiddenPathRules.find(([, pattern]) => pattern.test(filePath));
    if (match) findings.push({ path: filePath, rule: match[0] });
  }
  return findings;
}

export function findSensitiveTextFindings(relativePath, content) {
  const findings = [];
  const lines = content.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    for (const [rule, pattern] of sensitiveTextRules) {
      if (pattern.test(lines[index]) && !isSyntheticTestHomePath(relativePath, rule, lines[index])) {
        findings.push({ path: normalizePath(relativePath), line: index + 1, rule });
      }
    }
  }
  return findings;
}

function isText(buffer) {
  return !buffer.subarray(0, 8192).includes(0);
}

export function auditPaths(rootDir, paths, { checkForbiddenPaths = true } = {}) {
  const normalizedPaths = paths.map(normalizePath).sort();
  const findings = checkForbiddenPaths ? findForbiddenPathFindings(normalizedPaths) : [];
  for (const relativePath of normalizedPaths) {
    const absolutePath = path.join(rootDir, ...relativePath.split('/'));
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    const content = fs.readFileSync(absolutePath);
    if (!isText(content)) continue;
    findings.push(...findSensitiveTextFindings(relativePath, content.toString('utf8')));
  }
  return findings;
}

function listGitFiles(repoRoot) {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot },
  ).toString('utf8').split('\0').filter(Boolean);
}

function listDirectoryFiles(rootDir, currentDir = rootDir, relativeDir = '') {
  const files = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) files.push(...listDirectoryFiles(rootDir, absolutePath, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

export function runAudit({ repoRoot = process.cwd(), directory } = {}) {
  const rootDir = directory ? path.resolve(repoRoot, directory) : repoRoot;
  const paths = directory ? listDirectoryFiles(rootDir) : listGitFiles(repoRoot);
  return auditPaths(rootDir, paths, { checkForbiddenPaths: !directory });
}

function main() {
  const directoryIndex = process.argv.indexOf('--directory');
  const directory = directoryIndex >= 0 ? process.argv[directoryIndex + 1] : undefined;
  if (directoryIndex >= 0 && !directory) throw new Error('--directory requires a path');
  const findings = runAudit({ directory });
  if (findings.length > 0) {
    for (const finding of findings) {
      const location = finding.line ? `${finding.path}:${finding.line}` : finding.path;
      console.error(`${location} [${finding.rule}]`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(directory ? `Open-source audit passed: ${directory}` : 'Open-source audit passed: tracked tree');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
