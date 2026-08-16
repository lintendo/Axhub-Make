#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { unzipSync, zipSync } from 'fflate';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const makeServerRoot = repoRoot;
const makePackageJsonPath = path.join(makeServerRoot, 'package.json');
const releaseRoot = path.join(repoRoot, '.release/make');
const releaseAdminDir = path.join(releaseRoot, 'admin');
const npmPackageDir = path.join(releaseRoot, 'npm-package');
const npmPackageDistDir = path.join(npmPackageDir, 'dist');
const npmPackageServerDir = path.join(npmPackageDistDir, 'server');
const npmPackageServerConvertersDir = path.join(npmPackageServerDir, 'converters');
const npmPackageScriptsDir = path.join(npmPackageDir, 'scripts');
const binDir = path.join(releaseRoot, 'bin');
const artifactsDir = path.join(releaseRoot, 'artifacts');
const tmpDir = path.join(releaseRoot, 'tmp');
const manifestPath = path.join(releaseRoot, 'manifest.json');
const templateReleaseRoot = path.join(repoRoot, '.release/make-client-template');
const templateArtifactsDir = path.join(templateReleaseRoot, 'artifacts');
const templateManifestPath = path.join(templateReleaseRoot, 'manifest.json');
const canvasFigSyncSource = path.join(makeServerRoot, 'vendor/axhub-export-core/scripts/canvas-fig-sync.mjs');
const canvasFigSyncBundleEntry = path.join(makeServerRoot, 'node_modules/axhub-export-core/scripts/canvas-fig-sync.mjs');
const bundledCanvasFigSyncPath = path.join(tmpDir, 'canvas-fig-sync.mjs');
const makeClientTemplateSourceDir = path.join(makeServerRoot, 'client');
const makeClientTemplatePackageJsonPath = path.join(makeClientTemplateSourceDir, 'package.json');
const makeClientTemplateContentManifestFileName = 'template-manifest.json';
const makeClientTemplateSourcePath = path.join(makeServerRoot, 'src/common/makeClientTemplate.ts');
const makeClientTemplateReleaseNotesFileName = 'RELEASE_NOTES.md';
const makeClientTemplateZipName = 'axhub-make-client-template.zip';
const makeClientTemplateLatestManifestName = 'axhub-make-client-template.latest.json';
const makeClientTemplateLatestManifestGiteeTagName = 'make-client-template-latest';
const makeClientTemplatePackageManager = 'pnpm@10.20.0';
const makeClientTemplateRequiredExactDependencies = new Set([
  'lucide-react',
]);
const makeClientTemplateExactDevDependencies = new Map([
  ['react', '18.2.0'],
  ['react-dom', '18.2.0'],
]);
const makeClientTemplateIgnoredScripts = new Set([
  'test',
  'test:run',
  'test:coverage',
  'test:watch',
  'test:ui',
  'coverage',
  'font:subset:beginner-guide',
]);
const makeClientTemplateIgnoredDevDependencies = new Set([
  'vitest',
  '@vitest/ui',
  '@vitest/coverage-v8',
  'subset-font',
]);
const makeClientTemplateTrackableCommentGitignoreEntries = [
  '!.axhub/make/comments/',
  '!.axhub/make/comments/**',
  '!.axhub/make/comment-assets/',
  '!.axhub/make/comment-assets/**',
];
const includeOpenCodeWebUi = false;
const npmPackagePackedSizeLimit = 35 * 1024 * 1024;
const npmPackageUnpackedSizeLimit = 80 * 1024 * 1024;
const npmPackageEntryCountLimit = 750;
const requiredNpmBin = {
  make: './bin/cli.mjs',
  'axhub-make': './bin/cli.mjs',
  'make-server': './bin/cli.mjs',
};
const disallowedDependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const requiredNpmPackageFiles = [
  'package.json',
  'bin/cli.mjs',
  'dist/server/cli.mjs',
  'dist/server/converters/ai-studio-converter.mjs',
  'dist/server/converters/axure-html-converter.mjs',
  'dist/server/converters/figma-make-converter.mjs',
  'dist/server/converters/stitch-converter.mjs',
  'dist/server/converters/v0-converter.mjs',
  'dist/admin/index.html',
  'dist/admin/assets/favicon.ico',
  'dist/admin/assets/axure-export-runtime.js',
  'dist/admin/auto-debug-client.js',
  'scripts/canvas-fig-sync.mjs',
];
const serverBundleExternalPackages = [
  'vite',
  '@vitejs/plugin-react',
  '@tailwindcss/vite',
];
const disallowedNpmPackagePathPatterns = [
  /^src(?:\/|$)/u,
  /(?:^|\/)__tests__(?:\/|$)/u,
  /(?:^|\/)[^/]+\.test\.[^/]+$/u,
  /(?:^|\/)coverage(?:\/|$)/u,
  /(?:^|\/)node_modules(?:\/|$)/u,
  /(?:^|\/)\.next(?:\/|$)/u,
  /(?:^|\/)\.DS_Store$/u,
  /(?:^|\/)\.env(?:\.|$)/u,
  /(?:^|\/)\.local(?:\/|$)/u,
  /\.tsbuildinfo$/u,
  /\.timestamp-[^/]+$/u,
  /^README\.md$/u,
  /^assets(?:\/|$)/u,
  /^dist\/admin\/images(?:\/|$)/u,
];
const textLikeArtifactExtensions = new Set([
  '',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.map',
  '.md',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const localMachinePathPatterns = [
  /(?:file:)?\/Users\/[^'"`\s]+/u,
  /(?:file:)?\/Volumes\/[^'"`\s]+/u,
  /[A-Za-z]:\\Users\\[^'"`\s]+/u,
  /%2FUsers%2F/iu,
  /%2FVolumes%2F/iu,
];
const localMachinePathSanitizePatterns = [
  /(?:file:)?\/Users\/[^'"`\s]+/gu,
  /(?:file:)?\/Volumes\/[^'"`\s]+/gu,
  /[A-Za-z]:\\Users\\[^'"`\s]+/gu,
  /%2FUsers%2F[^'"`\s]+/giu,
  /%2FVolumes%2F[^'"`\s]+/giu,
];
const templateCopyIgnoredNames = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vite',
  '.local',
  '.logs',
  'logs',
  '.codegraph',
  '.codex',
  '.drawio-tmp',
  '.opencode',
  '.trae',
  '.workbuddy',
  'coverage',
  'tests',
  '.cache',
  'tmp-midscene',
  'tmp',
  'temp',
]);
const templateCopyIgnoredFiles = new Set([
  '.DS_Store',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.admin-server-info.json',
  '.dev-server-info.json',
  'prototype-comments.json',
  'axhub.config.json',
  'entries.json',
  'sidebar-tree.json',
]);
const executableTargets = [
  { id: 'macos-arm64', bunTarget: 'bun-darwin-arm64', executableName: 'axhub-make' },
  { id: 'macos-x64', bunTarget: 'bun-darwin-x64', executableName: 'axhub-make' },
  { id: 'windows-x64', bunTarget: 'bun-windows-x64', executableName: 'axhub-make.exe' },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function logStep(message) {
  console.log(`\n==> ${message}`);
}

function quoteCommand(command, args) {
  return [command, ...args].map((part) => {
    if (/^[A-Za-z0-9_./:@=-]+$/u.test(part)) {
      return part;
    }
    return JSON.stringify(part);
  }).join(' ');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Command failed (${result.status}): ${quoteCommand(command, args)}${output ? `\n${output}` : ''}`);
  }
  return result;
}

function assertTool(command, args = ['--version']) {
  run(command, args, { capture: true });
}

function copyDir(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

export function copyOpenCodeWebUiToRelease({
  makeServerRoot: sourceMakeServerRoot = makeServerRoot,
  releaseAdminDir: targetReleaseAdminDir = releaseAdminDir,
} = {}) {
  void sourceMakeServerRoot;
  void targetReleaseAdminDir;
  if (!includeOpenCodeWebUi) {
    return null;
  }
  const source = path.join(sourceMakeServerRoot, 'dist/opencode-webui');
  const destination = path.resolve(path.dirname(targetReleaseAdminDir), 'opencode-webui');
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`OpenCode WebUI build output is missing index.html: ${source}`);
  }
  copyDir(source, destination);
  return destination;
}

export function copyOpenCodeWebUiToNpmPackage({
  releaseAdminDir: sourceReleaseAdminDir = releaseAdminDir,
  npmPackageDistDir: targetNpmPackageDistDir = npmPackageDistDir,
} = {}) {
  void sourceReleaseAdminDir;
  void targetNpmPackageDistDir;
  if (!includeOpenCodeWebUi) {
    return null;
  }
  const source = path.resolve(path.dirname(sourceReleaseAdminDir), 'opencode-webui');
  const destination = path.join(targetNpmPackageDistDir, 'opencode-webui');
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`OpenCode WebUI release asset is missing index.html: ${source}`);
  }
  copyDir(source, destination);
  return destination;
}

export function copyOpenCodeWebUiToPlatformArtifact({
  releaseAdminDir: sourceReleaseAdminDir = releaseAdminDir,
  artifactDir,
} = {}) {
  void sourceReleaseAdminDir;
  void artifactDir;
  if (!includeOpenCodeWebUi) {
    return null;
  }
  if (!artifactDir) {
    throw new Error('artifactDir is required');
  }
  const source = path.resolve(path.dirname(sourceReleaseAdminDir), 'opencode-webui');
  const destination = path.join(artifactDir, 'opencode-webui');
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`OpenCode WebUI release asset is missing index.html: ${source}`);
  }
  copyDir(source, destination);
  return destination;
}

function copyFile(source, destination, mode) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (mode !== undefined) {
    fs.chmodSync(destination, mode);
  }
}

export function createCanvasFigSyncBundleArgs(outFile, entryFile) {
  return [
    'build',
    entryFile,
    '--target=node',
    '--format=esm',
    '--packages=bundle',
    '--outfile',
    outFile,
  ];
}

function buildCanvasFigSyncBundle() {
  if (!fs.existsSync(canvasFigSyncBundleEntry)) {
    throw new Error(`Canvas fig sync bundle entry is missing: ${canvasFigSyncBundleEntry}`);
  }
  fs.mkdirSync(path.dirname(bundledCanvasFigSyncPath), { recursive: true });
  run('bun', createCanvasFigSyncBundleArgs(bundledCanvasFigSyncPath, canvasFigSyncBundleEntry), { cwd: makeServerRoot });
  fs.chmodSync(bundledCanvasFigSyncPath, 0o755);
  assertCanvasFigSyncScriptBundled(bundledCanvasFigSyncPath);
  return bundledCanvasFigSyncPath;
}

function walkFiles(rootDir) {
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  };
  visit(rootDir);
  return files.sort((left, right) => left.localeCompare(right));
}

export function assertAdminBundleCopy(adminDir) {
  const bundleSource = walkFiles(adminDir)
    .filter((filePath) => path.extname(filePath).toLowerCase() === '.js')
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');

  if (!bundleSource.includes('输入需求标注，支持 Markdown 格式')) {
    throw new Error('Admin build is missing required demand annotation copy');
  }

  for (const legacyCopy of ['标注 Markdown', '输入需求标注 Markdown']) {
    if (bundleSource.includes(legacyCopy)) {
      throw new Error(`Admin build includes legacy demand annotation copy: ${legacyCopy}`);
    }
  }
}

function isTextLikeArtifactPath(filePath) {
  return textLikeArtifactExtensions.has(path.extname(filePath).toLowerCase());
}

function findLocalMachinePath(value) {
  const source = typeof value === 'string' ? value : value.toString('utf8');
  return localMachinePathPatterns.find((pattern) => pattern.test(source)) || null;
}

function buildSameLengthPathReplacement(match) {
  const replacement = /^[A-Za-z]:\\/u.test(match)
    ? 'C:\\__axhub_build_path__'
    : match.startsWith('%2F') || match.startsWith('%2f')
      ? '%2F__axhub_build_path__'
      : match.startsWith('file:')
        ? 'file:/__axhub_build_path__'
        : '/__axhub_build_path__';

  if (replacement.length >= match.length) {
    return replacement.slice(0, match.length);
  }
  return replacement.padEnd(match.length, '_');
}

export function sanitizeLocalMachinePathsInFile(filePath) {
  const source = fs.readFileSync(filePath).toString('latin1');
  let sanitized = source;
  for (const pattern of localMachinePathSanitizePatterns) {
    sanitized = sanitized.replace(pattern, buildSameLengthPathReplacement);
  }
  if (sanitized !== source) {
    fs.writeFileSync(filePath, Buffer.from(sanitized, 'latin1'));
  }
  return {
    filePath,
    changed: sanitized !== source,
  };
}

function assertNoLocalMachinePathInText(label, value) {
  const pattern = findLocalMachinePath(value);
  if (pattern) {
    throw new Error(`${label} must not include local machine path (${pattern})`);
  }
}

function assertNoLocalMachinePathsInDirectory(rootDir, label) {
  for (const filePath of walkFiles(rootDir)) {
    if (!isTextLikeArtifactPath(filePath)) {
      continue;
    }
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
    assertNoLocalMachinePathInText(`${label} file ${relativePath}`, fs.readFileSync(filePath, 'utf8'));
  }
}

function assertNoLocalMachinePathsInBinaryFile(filePath, label) {
  assertNoLocalMachinePathInText(label, fs.readFileSync(filePath));
}

function assertNoLocalMachinePathsInZip(zipPath, label) {
  const entries = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  for (const [entryName, bytes] of Object.entries(entries)) {
    if (!isTextLikeArtifactPath(entryName)) {
      continue;
    }
    assertNoLocalMachinePathInText(`${label} entry ${entryName}`, Buffer.from(bytes).toString('utf8'));
  }
}

function assertNoLocalMachinePathsInTarGz(tarballPath, label) {
  const tarBytes = zlib.gunzipSync(fs.readFileSync(tarballPath));
  for (let offset = 0; offset + 512 <= tarBytes.length;) {
    const header = tarBytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    const sizeText = header.subarray(124, 136).toString('utf8').replace(/\0.*$/u, '').trim();
    const typeflag = header.subarray(156, 157).toString('utf8');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
    const entryName = [prefix, name].filter(Boolean).join('/');
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`${label} entry ${entryName || '(unknown)'} has invalid tar size`);
    }
    const contentOffset = offset + 512;
    if ((typeflag === '' || typeflag === '0') && isTextLikeArtifactPath(entryName)) {
      assertNoLocalMachinePathInText(
        `${label} entry ${entryName}`,
        tarBytes.subarray(contentOffset, contentOffset + size).toString('utf8'),
      );
    }
    offset = contentOffset + Math.ceil(size / 512) * 512;
  }
}

function shouldSkipTemplateSafetyEntry(entryName, relativePath = entryName) {
  const normalizedRelativePath = relativePath.split(path.sep).join('/');
  if (normalizedRelativePath.startsWith('.axhub/')) {
    return true;
  }
  if (templateCopyIgnoredNames.has(entryName) || templateCopyIgnoredFiles.has(entryName)) {
    return true;
  }
  if (entryName.endsWith('.tsbuildinfo')) {
    return true;
  }
  if (/\.test\.[^/]+$/u.test(entryName)) {
    return true;
  }
  if (/^src\/prototypes\/[^/]+\/\.spec\/acp(?:\/|$)/u.test(normalizedRelativePath)) {
    return true;
  }
  if (/^src\/prototypes\/[^/]+\/\.spec\/prototype-comments\.json$/u.test(normalizedRelativePath)) {
    return true;
  }
  if (/^src\/prototypes\/[^/]+\/\.spec\/reviews\/config\.json$/u.test(normalizedRelativePath)) {
    return true;
  }
  if (/^\.env\./u.test(entryName)) {
    return true;
  }
  if (/\.pid$/iu.test(entryName)) {
    return true;
  }
  return false;
}

function normalizeTemplateManifestPath(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const normalized = value.replace(/\\/gu, '/').replace(/^\.\//u, '');
  if (
    !normalized
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || /^[A-Za-z]:\//u.test(normalized)
    || normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`${label} must be a safe relative path: ${value}`);
  }
  return normalized;
}

function compileTemplateManifestRules(value, label) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((rule, index) => {
    const ruleLabel = `${label}[${index}]`;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error(`${ruleLabel} must be an object`);
    }
    if (rule.action !== 'include' && rule.action !== 'exclude') {
      throw new Error(`${ruleLabel}.action must be include or exclude`);
    }
    if (typeof rule.pattern !== 'string' || !rule.pattern) {
      throw new Error(`${ruleLabel}.pattern must be a non-empty string`);
    }
    if (typeof rule.description !== 'string' || !rule.description.trim()) {
      throw new Error(`${ruleLabel}.description must be a non-empty string`);
    }
    let regex;
    try {
      regex = new RegExp(rule.pattern, 'u');
    } catch (error) {
      throw new Error(`${ruleLabel}.pattern is not a valid regular expression: ${error.message}`);
    }
    return {
      action: rule.action,
      pattern: rule.pattern,
      description: rule.description.trim(),
      required: rule.required === true,
      regex,
    };
  });
}

function normalizeTemplateManifestPathList(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((entry, index) => normalizeTemplateManifestPath(entry, `${label}[${index}]`));
}

function loadMakeClientTemplateContentManifest(sourceClientDir) {
  const manifestPath = path.join(sourceClientDir, makeClientTemplateContentManifestFileName);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Make client template content manifest is required: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  if (manifest?.schemaVersion !== 1) {
    throw new Error(`Unsupported Make client template content manifest schema: ${manifest?.schemaVersion}`);
  }
  if (!manifest.runtime || typeof manifest.runtime !== 'object' || Array.isArray(manifest.runtime)) {
    throw new Error('template-manifest runtime must be an object');
  }
  const runtime = {
    files: normalizeTemplateManifestPathList(manifest.runtime.files, 'runtime.files'),
    directories: normalizeTemplateManifestPathList(manifest.runtime.directories, 'runtime.directories'),
    fileRules: compileTemplateManifestRules(manifest.runtime.fileRules, 'runtime.fileRules'),
  };
  if (!manifest.makeMetadata || typeof manifest.makeMetadata !== 'object' || Array.isArray(manifest.makeMetadata)) {
    throw new Error('template-manifest makeMetadata must be an object');
  }
  const makeMetadata = {
    seedDirectory: normalizeTemplateManifestPath(manifest.makeMetadata.seedDirectory, 'makeMetadata.seedDirectory'),
    outputDirectory: normalizeTemplateManifestPath(manifest.makeMetadata.outputDirectory, 'makeMetadata.outputDirectory'),
    files: [],
  };
  if (makeMetadata.outputDirectory !== '.axhub/make') {
    throw new Error('makeMetadata.outputDirectory must be .axhub/make');
  }
  if (!Array.isArray(manifest.makeMetadata.files)) {
    throw new Error('makeMetadata.files must be an array');
  }
  const metadataStrategies = new Set(['copy', 'sanitize', 'filter']);
  makeMetadata.files = manifest.makeMetadata.files.map((file, index) => {
    const fileLabel = `makeMetadata.files[${index}]`;
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw new Error(`${fileLabel} must be an object`);
    }
    if (!metadataStrategies.has(file.strategy)) {
      throw new Error(`${fileLabel}.strategy must be copy, sanitize, or filter`);
    }
    if (typeof file.description !== 'string' || !file.description.trim()) {
      throw new Error(`${fileLabel}.description must be a non-empty string`);
    }
    return {
      path: normalizeTemplateManifestPath(file.path, `${fileLabel}.path`),
      strategy: file.strategy,
      description: file.description.trim(),
    };
  });
  if (!Array.isArray(manifest.prototypes) || manifest.prototypes.length === 0) {
    throw new Error('template-manifest prototypes must be a non-empty array');
  }
  const prototypeIds = new Set();
  const prototypes = manifest.prototypes.map((prototype, index) => {
    const prototypeLabel = `prototypes[${index}]`;
    const id = String(prototype?.id || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
      throw new Error(`${prototypeLabel}.id must use lowercase letters, numbers, and hyphens`);
    }
    if (prototypeIds.has(id)) {
      throw new Error(`Duplicate prototype id in template-manifest: ${id}`);
    }
    prototypeIds.add(id);
    return {
      id,
      fileRules: compileTemplateManifestRules(prototype.fileRules, `${prototypeLabel}.fileRules`),
    };
  });
  if (!manifest.themes || typeof manifest.themes !== 'object' || Array.isArray(manifest.themes)) {
    throw new Error('template-manifest themes must be an object');
  }
  const themeRules = compileTemplateManifestRules(manifest.themes.idRules, 'themes.idRules');
  if (themeRules.some((rule) => rule.action !== 'exclude')) {
    throw new Error('themes.idRules only supports exclusions because themes are included by default');
  }
  if (!manifest.resources || typeof manifest.resources !== 'object' || Array.isArray(manifest.resources)) {
    throw new Error('template-manifest resources must be an object');
  }
  return {
    runtime,
    makeMetadata,
    prototypes,
    themeRules,
    resourceFiles: normalizeTemplateManifestPathList(manifest.resources.files, 'resources.files'),
  };
}

export function listAllowedMakeClientTemplateMetadataEntries({
  sourceClientDir = makeClientTemplateSourceDir,
} = {}) {
  const { makeMetadata } = loadMakeClientTemplateContentManifest(sourceClientDir);
  return makeMetadata.files
    .map((file) => `${makeMetadata.outputDirectory}/${file.path}`);
}

function isIncludedByTemplateRules(defaultIncluded, relativePath, rules) {
  const includedByRule = rules.some((rule) => rule.action === 'include' && rule.regex.test(relativePath));
  const excludedByRule = rules.some((rule) => rule.action === 'exclude' && rule.regex.test(relativePath));
  return (defaultIncluded || includedByRule) && !excludedByRule;
}

function walkTemplateSourceFiles(rootDir, currentDir = rootDir, relativeDir = '') {
  const files = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTemplateSourceFiles(rootDir, fullPath, relativePath));
    } else if (entry.isFile()) {
      files.push({ fullPath, relativePath });
    }
  }
  return files;
}

const designKnowledgeHashPattern = /^sha256:[a-f0-9]{64}$/u;
const designKnowledgePlatforms = ['desktop', 'mobile'];
const designKnowledgeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function assertSafeDesignKnowledgePath(value, label) {
  if (
    typeof value !== 'string'
    || !value
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Design Knowledge snapshot ${label} must be a safe normalized relative path`);
  }
  return value;
}

function assertRegularDesignKnowledgeFile(snapshotRoot, relativePath, label) {
  assertSafeDesignKnowledgePath(relativePath, label);
  let currentPath = snapshotRoot;
  for (const part of relativePath.split('/')) {
    currentPath = path.join(currentPath, part);
    if (!fs.existsSync(currentPath)) {
      throw new Error(`Design Knowledge snapshot ${label} is missing: ${relativePath}`);
    }
    if (fs.lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`Design Knowledge snapshot ${label} must not be a symbolic link: ${relativePath}`);
    }
  }
  if (!fs.lstatSync(currentPath).isFile()) {
    throw new Error(`Design Knowledge snapshot ${label} must be a regular file: ${relativePath}`);
  }
  return currentPath;
}

function listDesignKnowledgeSnapshotFiles(snapshotRoot, currentDir = snapshotRoot, relativeDir = '') {
  const files = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Design Knowledge snapshot must not contain symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...listDesignKnowledgeSnapshotFiles(snapshotRoot, fullPath, relativePath));
      continue;
    }
    if (!entry.isFile() || !fs.lstatSync(fullPath).isFile()) {
      throw new Error(`Design Knowledge snapshot must contain only regular files: ${relativePath}`);
    }
    files.push({ fullPath, relativePath });
  }
  return files;
}

export function validateDesignKnowledgeSnapshot({
  sourceClientDir = makeClientTemplateSourceDir,
} = {}) {
  const snapshotRoot = path.join(sourceClientDir, 'design-knowledge');
  if (!fs.existsSync(snapshotRoot) || fs.lstatSync(snapshotRoot).isSymbolicLink() || !fs.lstatSync(snapshotRoot).isDirectory()) {
    throw new Error(`Design Knowledge snapshot directory is missing: ${snapshotRoot}`);
  }
  const manifestPath = assertRegularDesignKnowledgeFile(snapshotRoot, 'manifest.json', 'manifest');
  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    throw new Error(`Design Knowledge snapshot manifest is invalid: ${error.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.schemaVersion !== 1) {
    throw new Error('Design Knowledge snapshot manifest has an unsupported schema');
  }
  if (typeof manifest.snapshotVersion !== 'string' || !manifest.snapshotVersion || /[\\/]/u.test(manifest.snapshotVersion) || manifest.snapshotVersion.includes('..')) {
    throw new Error('Design Knowledge snapshot manifest snapshotVersion is invalid');
  }
  if (!manifest.designMd || !Number.isInteger(manifest.designMd.count) || manifest.designMd.count < 0) {
    throw new Error('Design Knowledge snapshot manifest designMd count is invalid');
  }
  const designRoot = assertSafeDesignKnowledgePath(manifest.designMd.root, 'manifest designMd.root');
  if (!manifest.indexes || typeof manifest.indexes !== 'object' || Array.isArray(manifest.indexes)) {
    throw new Error('Design Knowledge snapshot manifest indexes are invalid');
  }

  const allIds = new Set();
  const designPaths = new Set();
  let totalRecordCount = 0;
  for (const platform of designKnowledgePlatforms) {
    const descriptor = manifest.indexes[platform];
    if (
      !descriptor
      || !Number.isInteger(descriptor.count)
      || descriptor.count < 0
      || !designKnowledgeHashPattern.test(descriptor.hash)
    ) {
      throw new Error(`Design Knowledge snapshot index descriptor is invalid: ${platform}`);
    }
    const relativeIndexPath = assertSafeDesignKnowledgePath(descriptor.path, `indexes.${platform}.path`);
    const indexPath = assertRegularDesignKnowledgeFile(snapshotRoot, relativeIndexPath, `indexes.${platform}`);
    const indexBytes = fs.readFileSync(indexPath);
    const indexHash = `sha256:${crypto.createHash('sha256').update(indexBytes).digest('hex')}`;
    if (indexHash !== descriptor.hash) {
      throw new Error(`Design Knowledge snapshot index hash mismatch: ${platform}`);
    }
    let index;
    try {
      index = JSON.parse(indexBytes.toString('utf8'));
    } catch {
      throw new Error(`Design Knowledge snapshot index is invalid: ${platform}`);
    }
    if (
      !index
      || typeof index !== 'object'
      || Array.isArray(index)
      || index.schemaVersion !== 1
      || index.platform !== platform
      || !Array.isArray(index.records)
      || index.records.length !== descriptor.count
    ) {
      throw new Error(`Design Knowledge snapshot index count/platform mismatch: ${platform}`);
    }
    totalRecordCount += index.records.length;
    for (const record of index.records) {
      const id = record?.id;
      const artifacts = record?.artifacts;
      if (
        !designKnowledgeIdPattern.test(id)
        || record.schemaVersion !== 1
        || record.slug !== id
        || !Array.isArray(record.platforms)
        || record.platforms.length !== 1
        || record.platforms[0] !== platform
        || record.publishable !== true
        || record.reviewStatus !== 'approved'
        || !artifacts
        || artifacts.designMdPath !== `${designRoot}/${id}.md`
        || !designKnowledgeHashPattern.test(artifacts.designMdHash)
      ) {
        throw new Error(`Design Knowledge snapshot record is invalid: ${id || '(unknown)'}`);
      }
      if (allIds.has(id)) {
        throw new Error(`Design Knowledge snapshot record id is duplicated: ${id}`);
      }
      allIds.add(id);
      const relativeDesignPath = assertSafeDesignKnowledgePath(artifacts.designMdPath, `records.${id}.artifacts.designMdPath`);
      const designPath = assertRegularDesignKnowledgeFile(snapshotRoot, relativeDesignPath, `records.${id}.DESIGN.md`);
      const designHash = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(designPath)).digest('hex')}`;
      if (designHash !== artifacts.designMdHash) {
        throw new Error(`Design Knowledge snapshot DESIGN.md hash mismatch: ${id}`);
      }
      designPaths.add(relativeDesignPath);
    }
  }
  if (manifest.designMd.count !== totalRecordCount || manifest.designMd.count !== designPaths.size) {
    throw new Error('Design Knowledge snapshot DESIGN.md count mismatch');
  }

  const snapshotFiles = listDesignKnowledgeSnapshotFiles(snapshotRoot);
  const packagedDesignPaths = new Set(snapshotFiles
    .map(({ relativePath }) => relativePath)
    .filter((relativePath) => relativePath.startsWith(`${designRoot}/`)));
  if (packagedDesignPaths.size !== designPaths.size || Array.from(designPaths).some((relativePath) => !packagedDesignPaths.has(relativePath))) {
    throw new Error('Design Knowledge snapshot DESIGN.md files do not match the index records');
  }
  for (const { relativePath } of snapshotFiles) {
    if (/(?:\.tgz|\.zip)$/iu.test(relativePath) || relativePath.split('/').includes('.local')) {
      throw new Error(`Design Knowledge snapshot contains a forbidden release file: ${relativePath}`);
    }
  }
  return manifest;
}

function addTemplateSourceFile(entries, sourceClientDir, relativeSourcePath, relativeOutputPath = relativeSourcePath) {
  const sourcePath = path.join(sourceClientDir, ...relativeSourcePath.split('/'));
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Make client template source file is missing: ${relativeSourcePath}`);
  }
  const outputPath = relativeOutputPath.split(path.sep).join('/');
  if (shouldSkipTemplateSafetyEntry(path.posix.basename(outputPath), outputPath)) {
    return;
  }
  entries[outputPath] = new Uint8Array(fs.readFileSync(sourcePath));
}

function addTemplateSourceDirectory(entries, sourceClientDir, relativeDirectory, rules = []) {
  const directoryPath = path.join(sourceClientDir, ...relativeDirectory.split('/'));
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(`Make client template source directory is missing: ${relativeDirectory}`);
  }
  for (const file of walkTemplateSourceFiles(directoryPath)) {
    const outputPath = `${relativeDirectory}/${file.relativePath}`;
    if (!isIncludedByTemplateRules(true, outputPath, rules)) {
      continue;
    }
    if (shouldSkipTemplateSafetyEntry(path.posix.basename(outputPath), outputPath)) {
      continue;
    }
    entries[outputPath] = new Uint8Array(fs.readFileSync(file.fullPath));
  }
}

function createMakeClientTemplateGitignore(source) {
  const normalized = Buffer.from(source).toString('utf8').trimEnd();
  const existingEntries = new Set(normalized.split(/\r?\n/u));
  const missingEntries = makeClientTemplateTrackableCommentGitignoreEntries
    .filter((entry) => !existingEntries.has(entry));
  return Buffer.from(`${normalized}\n${missingEntries.join('\n')}\n`, 'utf8');
}

function pruneMakeClientTemplateSidebarItems(items, allowedItemKeys) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      if (item.kind === 'folder') {
        return {
          ...item,
          children: pruneMakeClientTemplateSidebarItems(item.children, allowedItemKeys),
        };
      }
      return item;
    })
    .filter((item) => {
      if (!item) {
        return false;
      }
      if (item.kind === 'folder') {
        return Array.isArray(item.children) && item.children.length > 0;
      }
      return allowedItemKeys.has(String(item.itemKey || ''));
    });
}

function collectMakeClientTemplateSidebarItemKeys(items, keys = new Set()) {
  if (!Array.isArray(items)) {
    return keys;
  }
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    if (item.kind === 'folder') {
      collectMakeClientTemplateSidebarItemKeys(item.children, keys);
    } else if (typeof item.itemKey === 'string') {
      keys.add(item.itemKey);
    }
  }
  return keys;
}

function createFilteredMakeClientTemplateSidebar(source, prototypeIds, themeIds) {
  const tree = JSON.parse(source.toString('utf8'));
  const allowedPrototypeKeys = new Set(Array.from(prototypeIds, (id) => `prototypes/${id}`));
  const allowedThemeKeys = new Set(Array.from(themeIds, (id) => `themes/${id}`));
  const seedPrototypeKeys = new Set(
    (Array.isArray(tree.prototypes) ? tree.prototypes : [])
      .map((item) => String(item?.itemKey || ''))
      .filter(Boolean),
  );
  const seedThemeKeys = collectMakeClientTemplateSidebarItemKeys(tree.themesTree);
  const seedThemeIds = new Set(
    (Array.isArray(tree.themes) ? tree.themes : [])
      .map((id) => String(id || ''))
      .filter(Boolean),
  );
  const missingPrototypeKeys = Array.from(allowedPrototypeKeys).filter((itemKey) => !seedPrototypeKeys.has(itemKey));
  const missingThemeKeys = Array.from(allowedThemeKeys).filter((itemKey) => !seedThemeKeys.has(itemKey));
  const missingThemeIds = Array.from(themeIds).filter((id) => !seedThemeIds.has(id));
  if (missingPrototypeKeys.length > 0) {
    throw new Error(`Template sidebar seed is missing prototypes: ${missingPrototypeKeys.join(', ')}`);
  }
  if (missingThemeKeys.length > 0) {
    throw new Error(`Template sidebar seed is missing themes: ${missingThemeKeys.join(', ')}`);
  }
  if (missingThemeIds.length > 0) {
    throw new Error(`Template sidebar seed themes list is missing themes: ${missingThemeIds.join(', ')}`);
  }
  tree.prototypes = (Array.isArray(tree.prototypes) ? tree.prototypes : [])
    .filter((item) => allowedPrototypeKeys.has(String(item?.itemKey || '')));
  tree.themesTree = pruneMakeClientTemplateSidebarItems(tree.themesTree, allowedThemeKeys);
  if (Array.isArray(tree.themes)) {
    tree.themes = tree.themes.filter((id) => themeIds.has(String(id || '')));
  }
  return Buffer.from(`${JSON.stringify(tree, null, 2)}\n`, 'utf8');
}

function createSanitizedMakeClientTemplateConfig(source) {
  const config = JSON.parse(source.toString('utf8'));
  if (config.server && typeof config.server === 'object') {
    delete config.server.lanHost;
  }
  if (config.cloudPublishing && typeof config.cloudPublishing === 'object') {
    delete config.cloudPublishing.s3;
  }
  return Buffer.from(`${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function addMakeClientTemplateMetadata(entries, sourceClientDir, metadata, prototypeIds, themeIds) {
  for (const file of metadata.files) {
    const seedRelativePath = `${metadata.seedDirectory}/${file.path}`;
    const seedPath = path.join(sourceClientDir, ...seedRelativePath.split('/'));
    if (!fs.existsSync(seedPath) || !fs.statSync(seedPath).isFile()) {
      throw new Error(`Make client template metadata seed file is missing: ${seedRelativePath}`);
    }
    const source = fs.readFileSync(seedPath);
    let output = source;
    if (file.strategy === 'sanitize') {
      output = createSanitizedMakeClientTemplateConfig(source);
    } else if (file.strategy === 'filter') {
      output = createFilteredMakeClientTemplateSidebar(source, prototypeIds, themeIds);
    }
    const outputPath = `${metadata.outputDirectory}/${file.path}`;
    entries[outputPath] = new Uint8Array(output);
  }
}

function buildTemplateZippable(sourceClientDir) {
  const manifest = loadMakeClientTemplateContentManifest(sourceClientDir);
  const entries = {};
  for (const relativePath of manifest.runtime.files) {
    addTemplateSourceFile(entries, sourceClientDir, relativePath);
  }
  // The source checkout keeps live comments local; generated user projects may track them.
  if (entries['.gitignore']) {
    entries['.gitignore'] = new Uint8Array(createMakeClientTemplateGitignore(entries['.gitignore']));
  }
  for (const relativeDirectory of manifest.runtime.directories) {
    addTemplateSourceDirectory(entries, sourceClientDir, relativeDirectory, manifest.runtime.fileRules);
  }
  const prototypeIds = new Set();
  for (const prototype of manifest.prototypes) {
    prototypeIds.add(prototype.id);
    const prototypeDirectory = `src/prototypes/${prototype.id}`;
    const prototypeRoot = path.join(sourceClientDir, ...prototypeDirectory.split('/'));
    if (!fs.existsSync(prototypeRoot) || !fs.statSync(prototypeRoot).isDirectory()) {
      throw new Error(`Make client template prototype is missing: ${prototype.id}`);
    }
    const files = walkTemplateSourceFiles(prototypeRoot);
    for (const requiredRule of prototype.fileRules.filter((rule) => rule.required)) {
      if (!files.some((file) => requiredRule.regex.test(file.relativePath))) {
        throw new Error(`Required prototype file rule did not match ${prototype.id}: ${requiredRule.pattern}`);
      }
    }
    for (const file of files) {
      const defaultIncluded = !file.relativePath.startsWith('.spec/')
        || file.relativePath === '.spec/spec.md'
        || file.relativePath === '.spec/spec.html';
      if (!isIncludedByTemplateRules(defaultIncluded, file.relativePath, prototype.fileRules)) {
        continue;
      }
      const outputPath = `${prototypeDirectory}/${file.relativePath}`;
      if (shouldSkipTemplateSafetyEntry(path.posix.basename(outputPath), outputPath)) {
        continue;
      }
      entries[outputPath] = new Uint8Array(fs.readFileSync(file.fullPath));
    }
  }
  const themesRoot = path.join(sourceClientDir, 'src/themes');
  if (!fs.existsSync(themesRoot) || !fs.statSync(themesRoot).isDirectory()) {
    throw new Error('Make client template themes directory is missing: src/themes');
  }
  const themeIds = new Set();
  for (const entry of fs.readdirSync(themesRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !isIncludedByTemplateRules(true, entry.name, manifest.themeRules)) {
      continue;
    }
    themeIds.add(entry.name);
    addTemplateSourceDirectory(entries, sourceClientDir, `src/themes/${entry.name}`);
  }
  for (const relativePath of manifest.resourceFiles) {
    addTemplateSourceFile(entries, sourceClientDir, relativePath);
  }
  addMakeClientTemplateMetadata(entries, sourceClientDir, manifest.makeMetadata, prototypeIds, themeIds);
  return entries;
}

export function createMakeClientTemplatePackageJson(sourcePackageJson) {
  const packageJson = JSON.parse(JSON.stringify(sourcePackageJson || {}));
  packageJson.packageManager = makeClientTemplatePackageManager;

  packageJson.scripts = Object.fromEntries(
    Object.entries(packageJson.scripts || {})
      .filter(([name]) => !makeClientTemplateIgnoredScripts.has(name)),
  );
  packageJson.devDependencies = Object.fromEntries(
    Object.entries(packageJson.devDependencies || {})
      .filter(([name]) => !makeClientTemplateIgnoredDevDependencies.has(name)),
  );

  for (const name of makeClientTemplateRequiredExactDependencies) {
    const version = packageJson.dependencies?.[name];
    if (version && !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
      throw new Error(`Make client template dependency ${name} must use an exact version, got ${version}`);
    }
  }
  for (const [name, version] of makeClientTemplateExactDevDependencies) {
    if (packageJson.devDependencies?.[name]) {
      packageJson.devDependencies[name] = version;
    }
  }

  return packageJson;
}

function createMakeClientTemplateLockfile(packageJson) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-client-lock-'));
  try {
    writeJson(path.join(tempDir, 'package.json'), packageJson);
    run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
      'install',
      '--lockfile-only',
      '--ignore-scripts',
      '--ignore-workspace',
    ], {
      cwd: tempDir,
      capture: true,
    });
    const lockfilePath = path.join(tempDir, 'pnpm-lock.yaml');
    if (!fs.existsSync(lockfilePath)) {
      throw new Error('pnpm did not create a lockfile for the Make client template');
    }
    return fs.readFileSync(lockfilePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function createTemplateZipMetadata({
  templateVersion,
  githubRepo = 'lintendo/Axhub-Make',
  mirrorBaseUrl = 'https://gitee.com/axhub/Axhub-Make/releases/download',
} = {}) {
  const normalizedTemplateVersion = normalizeTemplateVersion(templateVersion);
  if (!normalizedTemplateVersion) {
    throw new Error('templateVersion is required for template zip metadata');
  }
  const tagName = `make-client-template-v${normalizedTemplateVersion}`;
  return {
    templateVersion: normalizedTemplateVersion,
    tagName,
    githubReleaseAssetName: makeClientTemplateZipName,
    primaryUrl: `https://github.com/${githubRepo}/releases/download/${tagName}/${makeClientTemplateZipName}`,
    mirrorUrl: `${mirrorBaseUrl}/${tagName}/${makeClientTemplateZipName}`,
  };
}

export function createMakeClientTemplateLatestManifest({
  templateVersion,
  releaseNotes,
  zipMetadata,
  publishedAt = new Date().toISOString(),
} = {}) {
  const normalizedTemplateVersion = normalizeTemplateVersion(templateVersion);
  const normalizedReleaseNotes = String(releaseNotes || '').trim();
  if (!normalizedTemplateVersion) {
    throw new Error('templateVersion is required for Make client template latest manifest');
  }
  if (!normalizedReleaseNotes) {
    throw new Error('releaseNotes is required for Make client template latest manifest');
  }
  if (!zipMetadata?.primaryUrl || !zipMetadata?.mirrorUrl) {
    throw new Error('zipMetadata primaryUrl and mirrorUrl are required for Make client template latest manifest');
  }
  return {
    schemaVersion: 1,
    version: normalizedTemplateVersion,
    releaseNotes: normalizedReleaseNotes,
    publishedAt,
    sources: [
      {
        id: 'github',
        url: zipMetadata.primaryUrl,
        markerRepository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
        templateVersion: normalizedTemplateVersion,
      },
      {
        id: 'gitee',
        url: zipMetadata.mirrorUrl,
        markerRepository: 'https://gitee.com/axhub/Axhub-Make/tree/main/client',
        templateVersion: normalizedTemplateVersion,
      },
    ],
  };
}

function normalizeTemplateVersion(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const withoutTagPrefix = raw.startsWith('make-client-template-v')
    ? raw.slice('make-client-template-v'.length)
    : raw;
  const normalized = withoutTagPrefix.startsWith('v') ? withoutTagPrefix.slice(1) : withoutTagPrefix;
  if (!normalized || /[\\/\s]/u.test(normalized)) {
    throw new Error(`Invalid make client template version: ${value}`);
  }
  return normalized;
}

function readMakeClientTemplateVersion() {
  const pkg = readJson(makeClientTemplatePackageJsonPath);
  const version = normalizeTemplateVersion(pkg?.version);
  if (!version) {
    throw new Error(`Make client template package version is missing: ${makeClientTemplatePackageJsonPath}`);
  }
  return version;
}

export function syncDefaultMakeClientTemplateVersion({
  sourceFile = makeClientTemplateSourcePath,
  templateVersion,
} = {}) {
  const normalizedVersion = normalizeTemplateVersion(templateVersion);
  if (!normalizedVersion) {
    throw new Error('templateVersion is required to sync the default Make client template version');
  }
  const source = fs.readFileSync(sourceFile, 'utf8');
  const pattern = /export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = ['"][^'"]+['"];/u;
  if (!pattern.test(source)) {
    throw new Error(`DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION export was not found: ${sourceFile}`);
  }
  const nextSource = source.replace(
    pattern,
    `export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = '${normalizedVersion}';`,
  );
  if (nextSource === source) {
    return { changed: false, sourceFile, templateVersion: normalizedVersion };
  }
  fs.writeFileSync(sourceFile, nextSource, 'utf8');
  return { changed: true, sourceFile, templateVersion: normalizedVersion };
}

function readReleaseNotesDeclaredVersion(releaseNotes) {
  const firstLine = String(releaseNotes || '').split(/\r?\n/u)[0]?.trim() || '';
  const match = firstLine.match(/^#\s+Axhub Make Client\s+([0-9A-Za-z][0-9A-Za-z.+-]*)\s*$/u);
  return match?.[1] || '';
}

export function readMakeClientTemplateReleaseNotes({
  sourceClientDir = makeClientTemplateSourceDir,
  templateVersion,
} = {}) {
  const normalizedVersion = normalizeTemplateVersion(templateVersion);
  if (!normalizedVersion) {
    throw new Error('templateVersion is required to read Make client template release notes');
  }
  const releaseNotesPath = path.join(sourceClientDir, makeClientTemplateReleaseNotesFileName);
  if (!fs.existsSync(releaseNotesPath)) {
    throw new Error(`Make client template release notes file is required: ${releaseNotesPath}`);
  }
  const releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8').trim();
  if (!releaseNotes) {
    throw new Error(`Make client template release notes file must not be empty: ${releaseNotesPath}`);
  }
  if (readReleaseNotesDeclaredVersion(releaseNotes) !== normalizedVersion) {
    throw new Error(`Make client template release notes must mention template version ${normalizedVersion}`);
  }
  return releaseNotes;
}

export function syncDefaultMakeClientTemplateReleaseNotes({
  sourceFile = makeClientTemplateSourcePath,
  templateVersion,
  releaseNotes,
} = {}) {
  const normalizedVersion = normalizeTemplateVersion(templateVersion);
  if (!normalizedVersion) {
    throw new Error('templateVersion is required to sync the default Make client template release notes');
  }
  const normalizedReleaseNotes = String(releaseNotes || '').trim();
  if (!normalizedReleaseNotes) {
    throw new Error('releaseNotes is required to sync the default Make client template release notes');
  }
  if (readReleaseNotesDeclaredVersion(normalizedReleaseNotes) !== normalizedVersion) {
    throw new Error(`Make client template release notes must mention template version ${normalizedVersion}`);
  }
  const source = fs.readFileSync(sourceFile, 'utf8');
  const nextExport = `export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = ${JSON.stringify(normalizedReleaseNotes)};`;
  const pattern = /export const DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES = (?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`);/u;
  let nextSource = '';
  if (pattern.test(source)) {
    nextSource = source.replace(pattern, nextExport);
  } else {
    const versionPattern = /export const DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION = ['"][^'"]+['"];\n/u;
    if (!versionPattern.test(source)) {
      throw new Error(`DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION export was not found: ${sourceFile}`);
    }
    nextSource = source.replace(versionPattern, (match) => `${match}${nextExport}\n`);
  }
  if (nextSource === source) {
    return { changed: false, sourceFile, templateVersion: normalizedVersion };
  }
  fs.writeFileSync(sourceFile, nextSource, 'utf8');
  return { changed: true, sourceFile, templateVersion: normalizedVersion };
}

export function createMakeClientTemplateZip({
  sourceClientDir = makeClientTemplateSourceDir,
  outputDir = artifactsDir,
} = {}) {
  if (!fs.existsSync(path.join(sourceClientDir, 'package.json'))) {
    throw new Error(`Make client template source is missing package.json: ${sourceClientDir}`);
  }
  const contentManifest = loadMakeClientTemplateContentManifest(sourceClientDir);
  if (contentManifest.runtime.directories.includes('design-knowledge')) {
    validateDesignKnowledgeSnapshot({ sourceClientDir });
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, makeClientTemplateZipName);
  fs.rmSync(zipPath, { force: true });
  const packageJson = createMakeClientTemplatePackageJson(
    readJson(path.join(sourceClientDir, 'package.json')),
  );
  const zippable = buildTemplateZippable(sourceClientDir);
  zippable['package.json'] = new Uint8Array(Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`, 'utf8'));
  zippable['pnpm-lock.yaml'] = new Uint8Array(createMakeClientTemplateLockfile(packageJson));
  const zipped = zipSync(zippable, { level: 6 });
  fs.writeFileSync(zipPath, Buffer.from(zipped));
  assertNoLocalMachinePathsInZip(zipPath, 'Make client template zip');
  return {
    path: zipPath,
    sha256: sha256File(zipPath),
  };
}

export function listZipEntries(zipPath) {
  return Object.keys(unzipSync(new Uint8Array(fs.readFileSync(zipPath)))).sort((left, right) => left.localeCompare(right));
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function writeChecksums(rootDir) {
  const lines = walkFiles(rootDir)
    .filter((filePath) => path.basename(filePath) !== 'SHA256SUMS')
    .map((filePath) => {
      const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
      return `${sha256File(filePath)}  ${relativePath}`;
    });
  fs.writeFileSync(path.join(rootDir, 'SHA256SUMS'), `${lines.join('\n')}\n`, 'utf8');
}

function parseArgs(args) {
  const options = {
    dryRun: false,
    prepareOnly: false,
    testLocal: false,
    skipNpm: false,
    skipGithub: false,
    confirmPublish: false,
    templateOnly: false,
    templateVersion: '',
    npmTag: 'beta',
    githubRepo: process.env.GITHUB_REPOSITORY || '',
    otp: '',
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const readValue = (name) => {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${name}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--') {
      continue;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--prepare-only') {
      options.prepareOnly = true;
    } else if (arg === '--test-local') {
      options.testLocal = true;
    } else if (arg === '--skip-npm') {
      options.skipNpm = true;
    } else if (arg === '--skip-github') {
      options.skipGithub = true;
    } else if (arg === '--confirm-publish') {
      options.confirmPublish = true;
    } else if (arg === '--template-only') {
      options.templateOnly = true;
    } else if (arg === '--template-version') {
      options.templateVersion = normalizeTemplateVersion(readValue('--template-version'));
    } else if (arg === '--github-repo') {
      options.githubRepo = readValue('--github-repo');
    } else if (arg === '--npm-tag') {
      options.npmTag = readValue('--npm-tag');
    } else if (arg === '--otp') {
      options.otp = readValue('--otp');
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage: pnpm release:make -- --github-repo OWNER/REPO [options]

Options:
  --github-repo <owner/repo>  GitHub repository for the Release. Required unless --skip-github is used.
  --npm-tag <tag>            npm dist-tag. Defaults to beta.
  --template-only            Prepare or publish only the Make client template zip release.
  --template-version <ver>   Template version for --template-only. A leading v is accepted.
  --otp <code>               npm one-time password for 2FA.
  --dry-run                  Prepare and test locally, then print publish/upload commands.
  --prepare-only             Build local release artifacts only.
  --test-local               Test previously prepared local artifacts only.
  --skip-npm                 Skip npm publish in release mode.
  --skip-github              Skip GitHub Release creation in release mode.
  --confirm-publish          Confirm external npm/GitHub publishing after reviewing prepared artifacts.
  -h, --help                 Show this help message.
`);
}

export function createPublishPackageJson(sourcePackage) {
  return {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: sourcePackage.description,
    type: 'module',
    bin: requiredNpmBin,
    files: [
      'bin',
      'dist',
      'scripts',
      'package.json',
    ],
    engines: {
      node: '>=20',
    },
    publishConfig: {
      access: 'public',
    },
  };
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function assertBelowLimit(label, value, limit) {
  if (value > limit) {
    throw new Error(`${label} ${formatBytes(value)} exceeds limit ${formatBytes(limit)}`);
  }
}

function assertPackageJsonShape(packageJson) {
  if (Object.hasOwn(packageJson, 'private')) {
    throw new Error('npm package must not include private');
  }
  for (const field of disallowedDependencyFields) {
    if (Object.hasOwn(packageJson, field)) {
      throw new Error(`npm package must not include ${field}`);
    }
  }
  if (JSON.stringify(packageJson).includes('workspace:')) {
    throw new Error('npm package must not include workspace: dependencies');
  }
  if (packageJson.publishConfig?.access !== 'public') {
    throw new Error('npm package publishConfig.access must be public');
  }
  if (packageJson.engines?.node !== '>=20') {
    throw new Error('npm package engines.node must be >=20');
  }
  for (const [binName, target] of Object.entries(requiredNpmBin)) {
    if (packageJson.bin?.[binName] !== target) {
      throw new Error(`npm package bin.${binName} must point to ${target}`);
    }
  }
  const actualBinNames = Object.keys(packageJson.bin || {});
  const expectedBinNames = Object.keys(requiredNpmBin);
  if (JSON.stringify(actualBinNames) !== JSON.stringify(expectedBinNames)) {
    throw new Error(`npm package bin aliases must be exactly ${expectedBinNames.join(', ')} in that order`);
  }
}

function readPackInfo(dryRunInfo) {
  const packInfo = Array.isArray(dryRunInfo) ? dryRunInfo[0] : dryRunInfo;
  if (!packInfo || typeof packInfo !== 'object') {
    throw new Error('npm pack dry-run did not return package info');
  }
  return packInfo;
}

function assertNpmPackageFilePath(filePath) {
  if (filePath.includes('workspace:')) {
    throw new Error(`npm package file path must not include workspace: ${filePath}`);
  }
  for (const pattern of disallowedNpmPackagePathPatterns) {
    if (pattern.test(filePath)) {
      throw new Error(`npm package must not include ${filePath}`);
    }
  }
}

function assertCanvasFigSyncScriptBundled(scriptPath) {
  const source = fs.readFileSync(scriptPath, 'utf8');
  if (/^\s*import\s+[^;]*\s+from\s+['"](?:kiwi-schema|pako)(?:\/[^'"]*)?['"]/mu.test(source)) {
    throw new Error('scripts/canvas-fig-sync.mjs must be bundled and must not import external canvas fig dependencies');
  }
}

export function assertNpmPackageShape({ dryRunInfo, packageDir }) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  const packageJson = readJson(packageJsonPath);
  assertPackageJsonShape(packageJson);

  const packInfo = readPackInfo(dryRunInfo);
  assertBelowLimit('npm package packed size', packInfo.size || 0, npmPackagePackedSizeLimit);
  assertBelowLimit('npm package unpacked size', packInfo.unpackedSize || 0, npmPackageUnpackedSizeLimit);
  if ((packInfo.entryCount || 0) > npmPackageEntryCountLimit) {
    throw new Error(`npm package entry count ${packInfo.entryCount} exceeds limit ${npmPackageEntryCountLimit}`);
  }

  const fileMap = new Map((packInfo.files || []).map((file) => [file.path, file]));
  for (const requiredFile of requiredNpmPackageFiles) {
    if (!fileMap.has(requiredFile)) {
      throw new Error(`npm package missing required file: ${requiredFile}`);
    }
  }
  const binFile = fileMap.get('bin/cli.mjs');
  if (!binFile || (binFile.mode & 0o111) === 0) {
    throw new Error('npm package bin/cli.mjs must be executable');
  }
  assertCanvasFigSyncScriptBundled(path.join(packageDir, 'scripts/canvas-fig-sync.mjs'));
  for (const file of packInfo.files || []) {
    if (file.path === 'package.json') {
      continue;
    }
    assertNpmPackageFilePath(file.path);
  }
  assertNoLocalMachinePathsInDirectory(packageDir, 'npm package');
}

function writeNpmBin() {
  const binPath = path.join(npmPackageDir, 'bin/cli.mjs');
  const content = `#!/usr/bin/env node

import { runCli } from '../dist/server/cli.mjs';

runCli().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
`;
  fs.mkdirSync(path.dirname(binPath), { recursive: true });
  fs.writeFileSync(binPath, content, 'utf8');
  fs.chmodSync(binPath, 0o755);
}

export function createServerBundleArgs(outFile, entryFile) {
  return [
    'build',
    '--target=node',
    '--format=esm',
    '--packages=bundle',
    ...serverBundleExternalPackages.flatMap((packageName) => ['--external', packageName]),
    '--outfile',
    outFile,
    entryFile,
  ];
}

function buildServerBundle() {
  fs.mkdirSync(npmPackageServerDir, { recursive: true });
  const outFile = path.join(npmPackageServerDir, 'cli.mjs');
  run('bun', createServerBundleArgs(
    outFile,
    path.join(makeServerRoot, 'src/server/cli.ts'),
  ));
  sanitizeLocalMachinePathsInFile(outFile);
}

function copyServerConverters() {
  fs.rmSync(npmPackageServerConvertersDir, { recursive: true, force: true });
  fs.mkdirSync(npmPackageServerConvertersDir, { recursive: true });
  for (const entry of fs.readdirSync(path.join(makeServerRoot, 'src/server/converters'), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('-converter.mjs')) {
      continue;
    }
    copyFile(
      path.join(makeServerRoot, 'src/server/converters', entry.name),
      path.join(npmPackageServerConvertersDir, entry.name),
    );
  }
}

function createBunEntrypoint() {
  const entryPath = path.join(tmpDir, 'bun-cli-entry.mjs');
  const cliPath = path.join(makeServerRoot, 'src/server/cli.ts');
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(entryPath, `process.env.AXHUB_MAKE_DISABLE_AUTO_RUN = '1';
const { runCli } = await import(${JSON.stringify(cliPath)});

runCli().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
`, 'utf8');
  return entryPath;
}

function bundleExecutableTarget(target, entryPath) {
  const targetBinDir = path.join(binDir, target.id);
  const executablePath = path.join(targetBinDir, target.executableName);
  fs.mkdirSync(targetBinDir, { recursive: true });
  run('bun', createExecutableBundleArgs(target, executablePath, entryPath));
  if (!target.executableName.endsWith('.exe')) {
    fs.chmodSync(executablePath, 0o755);
  }
  return executablePath;
}

export function createExecutableBundleArgs(target, executablePath, entryPath) {
  return [
    'build',
    '--compile',
    `--target=${target.bunTarget}`,
    ...serverBundleExternalPackages.flatMap((packageName) => ['--external', packageName]),
    '--outfile',
    executablePath,
    entryPath,
  ];
}

function shouldCodesignExecutableTarget(target) {
  return String(target.bunTarget || '').startsWith('bun-darwin-');
}

export function finalizeExecutableBundle(target, executablePath, {
  sanitizeFile = sanitizeLocalMachinePathsInFile,
  runCommand = run,
} = {}) {
  const sanitizeResult = sanitizeFile(executablePath);
  const codesigned = shouldCodesignExecutableTarget(target);
  if (codesigned) {
    runCommand('codesign', ['--force', '--sign', '-', executablePath]);
  }
  return {
    ...sanitizeResult,
    codesigned,
  };
}

function createPlatformArtifact(target, executablePath, sourcePackage, canvasFigSyncScriptPath = bundledCanvasFigSyncPath) {
  const artifactBaseName = `axhub-make-${sourcePackage.version}-${target.id}`;
  const artifactDir = path.join(artifactsDir, artifactBaseName);
  const artifactZip = path.join(artifactsDir, `${artifactBaseName}.zip`);
  fs.rmSync(artifactDir, { recursive: true, force: true });
  fs.rmSync(artifactZip, { force: true });
  fs.mkdirSync(artifactDir, { recursive: true });

  copyFile(executablePath, path.join(artifactDir, target.executableName), target.executableName.endsWith('.exe') ? undefined : 0o755);
  copyDir(releaseAdminDir, path.join(artifactDir, 'admin'));
  copyOpenCodeWebUiToPlatformArtifact({ artifactDir });
  copyFile(canvasFigSyncScriptPath, path.join(artifactDir, 'scripts/canvas-fig-sync.mjs'), 0o755);
  fs.writeFileSync(path.join(artifactDir, 'VERSION'), `${sourcePackage.version}\n`, 'utf8');
  assertNoLocalMachinePathsInDirectory(artifactDir, `${target.id} release artifact directory`);
  assertNoLocalMachinePathsInBinaryFile(path.join(artifactDir, target.executableName), `${target.id} executable`);
  writeChecksums(artifactDir);

  run('zip', ['-qr', artifactZip, '.'], { cwd: artifactDir });
  assertNoLocalMachinePathsInBinaryFile(artifactZip, `${target.id} release zip`);

  return {
    targetId: target.id,
    bunTarget: target.bunTarget,
    bundleDir: artifactDir,
    zipPath: artifactZip,
    executablePath: path.join(artifactDir, target.executableName),
  };
}

function buildSanitizedExecutableTarget(target, entryPath) {
  const executablePath = bundleExecutableTarget(target, entryPath);
  finalizeExecutableBundle(target, executablePath);
  return executablePath;
}

function createNpmPackage(sourcePackage, canvasFigSyncScriptPath = bundledCanvasFigSyncPath) {
  fs.rmSync(npmPackageDir, { recursive: true, force: true });
  fs.mkdirSync(npmPackageDir, { recursive: true });
  writeJson(path.join(npmPackageDir, 'package.json'), createPublishPackageJson(sourcePackage));
  writeNpmBin();
  copyDir(releaseAdminDir, path.join(npmPackageDistDir, 'admin'));
  copyOpenCodeWebUiToNpmPackage();
  copyFile(canvasFigSyncScriptPath, path.join(npmPackageScriptsDir, 'canvas-fig-sync.mjs'), 0o755);
  buildServerBundle();
  copyServerConverters();
}

function packNpmPackage() {
  logStep('Checking npm package contents');
  const dryRun = run('npm', ['pack', '--dry-run', '--json'], { cwd: npmPackageDir, capture: true });
  const dryRunInfo = JSON.parse(dryRun.stdout);
  assertNpmPackageShape({ dryRunInfo, packageDir: npmPackageDir });

  logStep('Creating local npm tarball');
  const pack = run('npm', ['pack', '--pack-destination', releaseRoot], { cwd: npmPackageDir, capture: true });
  const filename = pack.stdout.trim().split('\n').at(-1);
  if (!filename) {
    throw new Error('npm pack did not print a tarball filename');
  }
  const tarballPath = path.join(releaseRoot, filename);
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`npm tarball was not created: ${tarballPath}`);
  }
  assertNoLocalMachinePathsInTarGz(tarballPath, 'npm tarball');
  return { dryRunInfo, tarballPath };
}

export function shouldBuildPlatformArtifacts(options = {}) {
  return !options.skipGithub;
}

export function releaseToolsForOptions(options = {}) {
  return [
    'pnpm',
    'npm',
    'bun',
    ...(shouldBuildPlatformArtifacts(options) ? ['zip'] : []),
  ];
}

export function releaseToolCheckArgs(tool) {
  return tool === 'zip' ? ['-v'] : ['--version'];
}

function prepareRelease(options = {}) {
  const sourcePackage = readJson(makePackageJsonPath);
  if (sourcePackage.name !== '@axhub/make') {
    throw new Error(`Expected root package name to be @axhub/make, got ${sourcePackage.name}`);
  }
  if (!fs.existsSync(canvasFigSyncSource)) {
    throw new Error(`Required release asset is missing: ${canvasFigSyncSource}`);
  }

  logStep('Checking release tools');
  for (const tool of releaseToolsForOptions(options)) {
    assertTool(tool, releaseToolCheckArgs(tool));
  }

  fs.rmSync(releaseRoot, { recursive: true, force: true });
  fs.mkdirSync(releaseRoot, { recursive: true });

  logStep('Typechecking make server');
  run('pnpm', ['--filter', '@axhub/make', 'server:build']);

  logStep('Building admin UI');
  run('pnpm', ['--filter', '@axhub/make', 'admin:build']);

  const builtAdminDir = path.join(makeServerRoot, 'dist/admin');
  if (!fs.existsSync(path.join(builtAdminDir, 'index.html'))) {
    throw new Error(`Admin build output is missing index.html: ${builtAdminDir}`);
  }
  assertAdminBundleCopy(builtAdminDir);
  copyDir(builtAdminDir, releaseAdminDir);
  copyOpenCodeWebUiToRelease();

  logStep('Bundling canvas fig sync script');
  const canvasFigSyncScriptPath = buildCanvasFigSyncBundle();

  logStep('Creating npm package staging directory');
  createNpmPackage(sourcePackage, canvasFigSyncScriptPath);
  const { dryRunInfo, tarballPath } = packNpmPackage();

  let releaseAssets = [];
  if (shouldBuildPlatformArtifacts(options)) {
    logStep('Compiling Bun executables');
    const bunEntry = createBunEntrypoint();
    releaseAssets = executableTargets.map((target) => {
      const executablePath = buildSanitizedExecutableTarget(target, bunEntry);
      return createPlatformArtifact(target, executablePath, sourcePackage, canvasFigSyncScriptPath);
    });
  } else {
    logStep('Skipping platform release artifacts for npm-only release');
  }

  const manifest = {
    packageName: sourcePackage.name,
    version: sourcePackage.version,
    tagName: `make-v${sourcePackage.version}`,
    preparedAt: new Date().toISOString(),
    adminDir: releaseAdminDir,
    opencodeWebUiDir: null,
    npmPackageDir,
    npmTarballPath: tarballPath,
    npmPackDryRun: dryRunInfo,
    releaseAssets,
  };
  writeJson(manifestPath, manifest);
  printArtifacts(manifest);
  return manifest;
}

function prepareTemplateRelease(options = {}) {
  const sourcePackage = readJson(makeClientTemplatePackageJsonPath);
  if (sourcePackage.name !== '@axhub/make-client') {
    throw new Error(`Expected client package name to be @axhub/make-client, got ${sourcePackage.name}`);
  }
  const templateVersion = normalizeTemplateVersion(options.templateVersion || readMakeClientTemplateVersion());
  const versionSync = syncDefaultMakeClientTemplateVersion({ templateVersion });
  if (versionSync.changed) {
    logStep(`Synced DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION to ${templateVersion}`);
  }
  const releaseNotes = readMakeClientTemplateReleaseNotes({ templateVersion });
  const releaseNotesSync = syncDefaultMakeClientTemplateReleaseNotes({
    templateVersion,
    releaseNotes,
  });
  if (releaseNotesSync.changed) {
    logStep(`Synced DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES for ${templateVersion}`);
  }

  fs.rmSync(templateReleaseRoot, { recursive: true, force: true });
  fs.mkdirSync(templateReleaseRoot, { recursive: true });

  logStep('Creating Make client template zip');
  const templateArchive = createMakeClientTemplateZip({ outputDir: templateArtifactsDir });
  const templateMetadata = createTemplateZipMetadata({
    templateVersion,
    githubRepo: process.env.GITHUB_REPOSITORY || 'lintendo/Axhub-Make',
  });
  const latestManifestPath = path.join(templateArtifactsDir, makeClientTemplateLatestManifestName);
  const latestManifest = createMakeClientTemplateLatestManifest({
    templateVersion,
    releaseNotes,
    zipMetadata: templateMetadata,
  });
  writeJson(latestManifestPath, latestManifest);
  const manifest = {
    packageName: sourcePackage.name,
    templateVersion,
    releaseNotes,
    tagName: templateMetadata.tagName,
    preparedAt: new Date().toISOString(),
    templateSourceDir: makeClientTemplateSourceDir,
    templateZip: {
      path: templateArchive.path,
      sha256: templateArchive.sha256,
      ...templateMetadata,
    },
    latestManifest: {
      path: latestManifestPath,
      name: makeClientTemplateLatestManifestName,
      mirrorUrl: `https://gitee.com/axhub/Axhub-Make/releases/download/${makeClientTemplateLatestManifestGiteeTagName}/${makeClientTemplateLatestManifestName}`,
      manifest: latestManifest,
    },
  };
  writeJson(templateManifestPath, manifest);
  printTemplateArtifacts(manifest);
  return manifest;
}

function readPreparedManifest(pathName = manifestPath, command = 'pnpm release:make:prepare') {
  if (!fs.existsSync(pathName)) {
    throw new Error(`Release manifest not found. Run ${command} first.\nMissing: ${pathName}`);
  }
  return readJson(pathName);
}

function assertPreparedManifestCurrent(manifest) {
  const sourcePackage = readJson(makePackageJsonPath);
  if (manifest.packageName !== sourcePackage.name || manifest.version !== sourcePackage.version) {
    throw new Error(
      `Prepared artifacts are stale. Manifest has ${manifest.packageName}@${manifest.version}, `
      + `package.json has ${sourcePackage.name}@${sourcePackage.version}. Run pnpm release:make:prepare.`,
    );
  }
  const requiredPaths = [
    manifest.adminDir,
    manifest.npmPackageDir,
    manifest.npmTarballPath,
    manifest.templateZip?.path,
    ...(manifest.releaseAssets || []).flatMap((asset) => [asset.zipPath, asset.executablePath, asset.bundleDir]),
  ].filter(Boolean);
  for (const requiredPath of requiredPaths) {
    if (!requiredPath || !fs.existsSync(requiredPath)) {
      throw new Error(`Prepared artifact is missing: ${requiredPath}`);
    }
  }
}

function assertPreparedTemplateManifestCurrent(manifest, options = {}) {
  const expectedVersion = normalizeTemplateVersion(options.templateVersion || manifest.templateVersion);
  if (!expectedVersion) {
    throw new Error('Prepared template manifest is missing templateVersion.');
  }
  if (manifest.templateVersion !== expectedVersion || manifest.tagName !== `make-client-template-v${expectedVersion}`) {
    throw new Error(
      `Prepared template artifacts are stale. Manifest has ${manifest.templateVersion || 'unknown'}, `
      + `expected ${expectedVersion}. Run pnpm release:make-client-template:prepare.`,
    );
  }
  if (!manifest.templateZip?.path || !fs.existsSync(manifest.templateZip.path)) {
    throw new Error(`Prepared template zip is missing: ${manifest.templateZip?.path || '(none)'}`);
  }
  if (!manifest.latestManifest?.path || !fs.existsSync(manifest.latestManifest.path)) {
    throw new Error(`Prepared template latest manifest is missing: ${manifest.latestManifest?.path || '(none)'}`);
  }
}

function getCurrentTargetId() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-arm64';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'macos-x64';
  if (process.platform === 'win32' && process.arch === 'x64') return 'windows-x64';
  return null;
}

function installedBinPath(tempInstallDir, binName) {
  const commandName = process.platform === 'win32' ? `${binName}.cmd` : binName;
  return path.join(tempInstallDir, 'node_modules/.bin', commandName);
}

export function createInstalledNpmBinCommand(tempInstallDir, binName, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'win32') {
    const binTarget = requiredNpmBin[binName];
    if (!binTarget) {
      throw new Error(`Unknown npm bin: ${binName}`);
    }
    return {
      command: options.nodeExecutable || process.execPath,
      args: [path.join(tempInstallDir, 'node_modules', '@axhub', 'make', binTarget)],
    };
  }
  return {
    command: installedBinPath(tempInstallDir, binName),
    args: [],
  };
}

export function createNpmExecSmokeArgs(tarballPath) {
  return ['exec', '--yes', `--package=${tarballPath}`, '--', 'make', '--help'];
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpOk(url, child, label) {
  const deadline = Date.now() + 20_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`${label} did not become ready: ${lastError?.message || 'timeout'}`);
}

export function createServerProbeLaunchOptions(params) {
  return {
    args: [
      '--host',
      '127.0.0.1',
      '--port',
      String(params.port),
      '--admin-root',
      params.adminRoot,
    ],
    env: {
      AXHUB_MAKE_CANVAS_FIG_SYNC: params.canvasFigSyncPath,
      ...(params.env || {}),
      AXHUB_MAKE_HOME_DIR: params.makeHomeDir,
    },
  };
}

async function exerciseCommentAssetLifecycle(origin, projectRoot) {
  const projectId = 'release-comment-smoke';
  const documentPath = 'src/resources/prd/order.md';
  const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  writeJson(path.join(projectRoot, '.axhub/make/client.json'), {
    schemaVersion: 1,
    kind: 'axhub-make-client',
    repository: 'https://github.com/lintendo/Axhub-Make/tree/main/client',
    project: { id: projectId, name: 'Release Comment Smoke' },
  });
  writeJson(path.join(projectRoot, '.axhub/make/project.json'), {
    schemaVersion: 1,
    project: { id: projectId, name: 'Release Comment Smoke' },
    resources: { prototypes: [], themes: [] },
    navigation: { prototypes: [] },
    orders: { themes: [] },
  });
  writeJson(path.join(projectRoot, 'package.json'), {
    name: projectId,
    private: true,
    scripts: {
      dev: 'vite',
      'metadata:sync': 'node scripts/sync-project-metadata.mjs',
    },
  });
  fs.mkdirSync(path.dirname(path.join(projectRoot, documentPath)), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, documentPath), '# Order\n', 'utf8');

  const assertOk = async (response, action) => {
    if (!response.ok) {
      throw new Error(`${action} failed with ${response.status}: ${await response.text()}`);
    }
    return response;
  };
  await assertOk(await fetch(`${origin}/api/projects/make/register-existing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root: projectRoot }),
  }), 'Comment asset smoke project registration');
  await assertOk(await fetch(`${origin}/api/projects/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  }), 'Comment asset smoke project activation');

  const commentsUrl = `${origin}/api/document-comments?path=${encodeURIComponent(documentPath)}&projectId=${encodeURIComponent(projectId)}`;
  const storedResponse = await assertOk(await fetch(commentsUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: 'changes',
      document: {
        schemaVersion: 3,
        kind: 'document-edit-comments',
        documentPath,
        comments: [],
        images: [{ id: 'smoke-image', elementKey: 'smoke-image', data: pngDataUrl }],
      },
    }),
  }), 'Comment asset smoke write');
  const storedBody = await storedResponse.json();
  const assetPath = String(storedBody?.document?.images?.[0]?.assetPath || '');
  if (!assetPath) {
    throw new Error('Comment asset smoke write did not return an asset path');
  }

  const hydratedResponse = await assertOk(
    await fetch(`${commentsUrl}&hydrateImages=1`),
    'Comment asset smoke hydration',
  );
  const hydratedBody = await hydratedResponse.json();
  if (hydratedBody?.document?.images?.[0]?.data !== pngDataUrl) {
    throw new Error('Comment asset smoke hydration did not return the stored image');
  }

  await assertOk(await fetch(commentsUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: 'clear',
      document: {
        schemaVersion: 3,
        kind: 'document-edit-comments',
        documentPath,
        comments: [],
        images: [],
      },
    }),
  }), 'Comment asset smoke clear');
  const absoluteAssetPath = path.join(projectRoot, assetPath);
  if (fs.existsSync(absoluteAssetPath)) {
    throw new Error(`Comment asset smoke cleanup did not remove ${absoluteAssetPath}`);
  }
}

async function startAndProbeServer(params) {
  const port = await findFreePort();
  const makeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-release-home-'));
  const projectRoot = params.exerciseCommentAssets
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-release-project-'))
    : null;
  const launch = createServerProbeLaunchOptions({
    ...params,
    port,
    makeHomeDir,
  });
  const child = spawn(params.command, [...(params.commandArgs || []), ...launch.args], {
    cwd: params.cwd || repoRoot,
    env: {
      ...process.env,
      ...launch.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForHttpOk(`http://127.0.0.1:${port}/api/health`, child, params.label);
    const adminResponse = await waitForHttpOk(`http://127.0.0.1:${port}/`, child, params.label);
    const adminHtml = await adminResponse.text();
    if (!adminHtml.includes('<html') && !adminHtml.includes('<!doctype html')) {
      throw new Error(`${params.label} did not serve admin HTML from /`);
    }
    if (includeOpenCodeWebUi) {
      const openCodeResponse = await waitForHttpOk(`http://127.0.0.1:${port}/opencode/`, child, params.label);
      const openCodeHtml = await openCodeResponse.text();
      if (!openCodeHtml.includes('axhub-opencode')) {
        throw new Error(`${params.label} did not serve OpenCode WebUI HTML from /opencode/`);
      }
    }
    if (params.exerciseCommentAssets) {
      if (!projectRoot) throw new Error('Comment asset smoke project root is unavailable');
      await exerciseCommentAssetLifecycle(`http://127.0.0.1:${port}`, projectRoot);
    }
  } finally {
    child.kill();
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 1000);
    });
    fs.rmSync(makeHomeDir, { recursive: true, force: true });
    if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
  }

  if (output.trim()) {
    console.log(output.trim().split('\n').slice(0, 4).join('\n'));
  }
}

async function testPreparedArtifacts() {
  const manifest = readPreparedManifest();
  assertPreparedManifestCurrent(manifest);

  logStep('Testing local npm tarball');
  const tempInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-release-install-'));
  try {
    run('npm', ['init', '-y'], { cwd: tempInstallDir, capture: true });
    run('npm', ['install', manifest.npmTarballPath, '--ignore-scripts'], { cwd: tempInstallDir });

    for (const binName of Object.keys(requiredNpmBin)) {
      const installedBin = createInstalledNpmBinCommand(tempInstallDir, binName, { platform: process.platform });
      run(installedBin.command, [...installedBin.args, '--help'], { cwd: tempInstallDir, capture: true });
    }
    run('npm', createNpmExecSmokeArgs(manifest.npmTarballPath), { cwd: tempInstallDir, capture: true });
    const installedBin = createInstalledNpmBinCommand(tempInstallDir, 'axhub-make', { platform: process.platform });
    await startAndProbeServer({
      label: 'installed npm CLI',
      command: installedBin.command,
      commandArgs: installedBin.args,
      cwd: tempInstallDir,
      adminRoot: manifest.adminDir,
      canvasFigSyncPath: path.join(npmPackageScriptsDir, 'canvas-fig-sync.mjs'),
      exerciseCommentAssets: true,
    });
  } finally {
    fs.rmSync(tempInstallDir, { recursive: true, force: true });
  }

  const currentTargetId = getCurrentTargetId();
  const currentAsset = (manifest.releaseAssets || []).find((asset) => asset.targetId === currentTargetId);
  if (currentAsset) {
    logStep(`Testing current-platform Bun executable (${currentTargetId})`);
    await startAndProbeServer({
      label: `${currentTargetId} Bun executable`,
      command: currentAsset.executablePath,
      cwd: currentAsset.bundleDir,
      adminRoot: path.join(currentAsset.bundleDir, 'admin'),
      canvasFigSyncPath: path.join(currentAsset.bundleDir, 'scripts/canvas-fig-sync.mjs'),
    });
  } else {
    console.log(`Skipping Bun executable smoke test for npm-only or unsupported current platform: ${process.platform}-${process.arch}`);
  }

  printArtifacts(manifest);
}

async function testPreparedTemplateArtifacts(options = {}) {
  const manifest = readPreparedManifest(templateManifestPath, 'pnpm release:make-client-template:prepare');
  assertPreparedTemplateManifestCurrent(manifest, options);

  const entries = listZipEntries(manifest.templateZip.path);
  if (!entries.includes('package.json')) {
    throw new Error('Make client template zip is missing package.json');
  }
  if (entries.some((entry) => entry.startsWith('node_modules/') || entry.startsWith('dist/'))) {
    throw new Error('Make client template zip includes local runtime artifacts');
  }
  const allowedAxhubMakeEntries = new Set(listAllowedMakeClientTemplateMetadataEntries());
  const disallowedAxhubMakeEntries = entries.filter((entry) => (
    entry.startsWith('.axhub/make/')
    && !allowedAxhubMakeEntries.has(entry)
  ));
  if (disallowedAxhubMakeEntries.length > 0) {
    throw new Error(`Make client template zip includes local Make runtime metadata: ${disallowedAxhubMakeEntries.slice(0, 5).join(', ')}`);
  }
  printTemplateArtifacts(manifest);
}

function printArtifacts(manifest) {
  console.log('\nRelease artifacts:');
  console.log(`  npm package: ${manifest.npmPackageDir}`);
  console.log(`  npm tarball: ${manifest.npmTarballPath}`);
  for (const asset of manifest.releaseAssets || []) {
    console.log(`  ${asset.targetId}: ${asset.zipPath}`);
  }
}

function printTemplateArtifacts(manifest) {
  console.log('\nMake client template release artifacts:');
  console.log(`  template version: ${manifest.templateVersion}`);
  console.log(`  template tag: ${manifest.tagName}`);
  console.log(`  make client template: ${manifest.templateZip.path}`);
  if (manifest.latestManifest?.path) {
    console.log(`  make client template latest manifest: ${manifest.latestManifest.path}`);
  }
  console.log(`  make client template mirror upload target: ${manifest.templateZip.mirrorUrl}`);
}

export function publishCommands(manifest, options) {
  const npmArgs = ['publish', manifest.npmPackageDir, '--access', 'public', '--tag', options.npmTag || 'beta'];
  if (options.otp) {
    npmArgs.push('--otp', options.otp);
  }
  const releaseArgs = [
    'release',
    'create',
    manifest.tagName,
    ...(manifest.releaseAssets || []).map((asset) => asset.zipPath),
    '--repo',
    options.githubRepo,
    '--title',
    `@axhub/make ${manifest.version}`,
    '--generate-notes',
  ];
  return { npmArgs, releaseArgs };
}

export function publishTemplateCommands(manifest, options) {
  if (!manifest.templateZip?.path) {
    throw new Error('Template release manifest is missing templateZip.path');
  }
  const releaseArgs = [
    'release',
    'create',
    manifest.tagName,
    manifest.templateZip.path,
    ...(manifest.latestManifest?.path ? [manifest.latestManifest.path] : []),
    '--repo',
    options.githubRepo,
    '--title',
    `Axhub Make Client Template ${manifest.templateVersion}`,
    '--generate-notes',
  ];
  return { releaseArgs };
}

export function assertExternalPublishConfirmed(options = {}) {
  if (!options.confirmPublish) {
    throw new Error('External publishing requires human confirmation. Re-run with --confirm-publish after reviewing the prepared artifacts.');
  }
}

function runRelease(manifest, options) {
  if (!options.skipGithub && !options.githubRepo) {
    throw new Error('Missing --github-repo OWNER/REPO for GitHub Release. Use --skip-github to publish npm only.');
  }

  const { npmArgs, releaseArgs } = publishCommands(manifest, options);

  if (options.dryRun) {
    logStep('Dry-run release commands');
    if (!options.skipNpm) console.log(quoteCommand('npm', npmArgs));
    if (!options.skipGithub) console.log(quoteCommand('gh', releaseArgs));
    return;
  }

  if (!options.skipNpm || !options.skipGithub) {
    assertExternalPublishConfirmed(options);
  }

  if (!options.skipNpm) {
    logStep(`Publishing ${manifest.packageName}@${manifest.version} to npm`);
    run('npm', npmArgs);
  }

  if (!options.skipGithub) {
    logStep(`Creating GitHub Release ${manifest.tagName}`);
    assertTool('gh');
    run('gh', releaseArgs);
  }
}

function runTemplateRelease(manifest, options) {
  if (!options.skipGithub && !options.githubRepo) {
    throw new Error('Missing --github-repo OWNER/REPO for template GitHub Release. Use --skip-github to prepare locally only.');
  }

  const { releaseArgs } = publishTemplateCommands(manifest, options);

  if (options.dryRun) {
    logStep('Dry-run template release commands');
    if (!options.skipGithub) console.log(quoteCommand('gh', releaseArgs));
    return;
  }

  if (!options.skipGithub) {
    assertExternalPublishConfirmed(options);
  }

  if (!options.skipGithub) {
    logStep(`Creating GitHub Release ${manifest.tagName}`);
    assertTool('gh');
    run('gh', releaseArgs);
  }
}

async function main() {
  if (process.env.AXHUB_MAKE_RELEASE_SKIP_MAIN === '1') {
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (options.templateOnly) {
    if (options.testLocal && !options.prepareOnly && !options.dryRun) {
      await testPreparedTemplateArtifacts(options);
      return;
    }

    const manifest = prepareTemplateRelease(options);
    if (options.prepareOnly) {
      return;
    }

    await testPreparedTemplateArtifacts(options);
    assertPreparedTemplateManifestCurrent(manifest, options);
    runTemplateRelease(manifest, options);
    return;
  }

  if (options.testLocal && !options.prepareOnly && !options.dryRun) {
    await testPreparedArtifacts();
    return;
  }

  const manifest = prepareRelease(options);
  if (options.prepareOnly) {
    return;
  }

  await testPreparedArtifacts();
  assertPreparedManifestCurrent(manifest);
  runRelease(manifest, options);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
