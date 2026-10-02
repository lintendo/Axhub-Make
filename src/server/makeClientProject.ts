import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, type Zippable } from 'fflate';

import {
  DEFAULT_MAKE_CLIENT_REPOSITORY,
  fetchHealth,
  getProjectMetadataPath,
  getRuntimeServerInfoPath,
  isMakeStateWritePermissionError,
  isProcessAlive,
  isLiveLocalServerInfo,
  normalizeHealthServerInfo,
  readMakeClientMarker,
  readServerInfo,
  resolveComparableProjectRoot,
  validateMakeClientProject,
  writeMakeClientMarker,
  writeServerInfo,
  type AxhubServerInfo,
  type MakeClientMarker,
} from './projectCore/index.ts';

import { buildLocalCommandEnv, runLocalCommand } from './localCommand.ts';
import type { DiagnosticLog } from './diagnosticLog.ts';
import { extractZipBufferToDirectory } from './zipArchive.ts';
import {
  DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES,
  DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION,
  makeClientTemplateMirrorDownloadUrl,
  makeClientTemplateMirrorManifestUrl,
  makeClientTemplatePrimaryDownloadUrl,
  makeClientTemplatePrimaryManifestUrl,
} from '../common/makeClientTemplate.ts';
import { DOCUMENT_TEMPLATES } from '../common/documentTemplates.ts';
import {
  deriveRegistryProbePackages,
  isRetryableRegistryError,
  registryInstallArgs,
  resolveMakeClientRegistryRoute,
  type MakeClientRegistryRoute,
} from './makeClientRegistryRouting.ts';

export type MakeClientPhase =
  | 'template'
  | 'clone'
  | 'download-template'
  | 'backup'
  | 'overwrite'
  | 'install'
  | 'metadata'
  | 'version'
  | 'dev'
  | 'ready';

export interface MakeClientCommandRunner {
  runCommand?: typeof runLocalCommand;
  spawn: typeof spawn;
}

export interface MakeClientProgressStep {
  id: string;
  label: string;
  durationMs: number;
  status: 'done' | 'failed';
}

export interface MakeClientProgressSnapshot {
  status: 'running' | 'success' | 'failed';
  totalMs: number;
  steps: MakeClientProgressStep[];
}

export interface MakeClientProgressLogger {
  run<T>(id: string, label: string, action: () => Promise<T>): Promise<T>;
  runSync<T>(id: string, label: string, action: () => T): T;
  finish(status: 'success' | 'failed', error?: unknown): void;
  snapshot(): MakeClientProgressSnapshot;
}

export interface MakeClientOrchestrationOptions {
  adminServerInfo?: AxhubServerInfo;
  commandRunner?: MakeClientCommandRunner;
  serverInfoHomeDir?: string;
  devTimeoutMs?: number;
  healthTimeoutMs?: number;
  pollIntervalMs?: number;
  progressLogger?: MakeClientProgressLogger;
  diagnosticLog?: DiagnosticLog;
}

export interface MakeClientDevResult {
  success: true;
  reused: boolean;
  phase: MakeClientPhase;
  runtime: AxhubServerInfo;
  runtimePatched?: boolean;
}

export type MakeClientDependencyInstallMethod = 'skipped' | 'pnpm' | 'npm';

interface MakeClientDevInternalResult extends MakeClientDevResult {
  installMethod: MakeClientDependencyInstallMethod;
}

const MAKE_CLIENT_RUNTIME_PATCH_FILES = [
  'vite-plugins/clientPreviewPlugin.ts',
  'vite-plugins/localEditingApi.ts',
  'vite-plugins/canvasHotUpdateFilter.ts',
  'vite-plugins/utils/moduleSpecifierQuery.ts',
  'vite-plugins/utils/previewTitle.ts',
];

export interface MakeClientDevStatus {
  projectId: string;
  makeClient: boolean;
  running: boolean;
  runtime?: AxhubServerInfo;
  reason?: 'not-make-client' | 'not-running' | 'stale-runtime';
}

export interface MakeClientStopResult {
  success: true;
  projectId: string;
  stopped: boolean;
  runtime?: AxhubServerInfo;
  status: MakeClientDevStatus;
}

export interface MakeClientUpdateBlockedReason {
  code:
    | 'NO_UPDATE_AVAILABLE'
    | 'TEMPLATE_SOURCE_UNAVAILABLE';
  message: string;
}

export type MakeClientUpdateBackupPolicy = 'zip-before-overwrite';

export interface MakeClientUpdateBackupRecord {
  backupRoot: string;
  backupZipPath: string;
  manifestPath: string;
  currentVersion: string;
  targetVersion: string;
  createdAt: string;
  completedAt: string;
  plannedFilesCount: number;
  writtenFilesCount: number;
  restoreAvailable: boolean;
  zipAvailable: boolean;
}

export interface MakeClientUpdateStatus {
  projectId: string;
  projectRoot: string;
  currentVersion: string;
  targetVersion: string;
  releaseNotes?: string;
  metadataSource: MakeClientUpdateMetadataSource;
  metadataError?: string;
  updateAvailable: boolean;
  canApply: boolean;
  backupPolicy: MakeClientUpdateBackupPolicy;
  lastBackup: MakeClientUpdateBackupRecord | null;
  template: {
    version: string;
    sources: MakeClientTemplateSource[];
  };
  blockedReasons: MakeClientUpdateBlockedReason[];
}

export interface MakeClientUpdatePostUpdateWarning {
  error: string;
  code: string;
  phase?: MakeClientPhase;
  details?: Record<string, unknown>;
}

export interface MakeClientUpdateApplyResult {
  success: true;
  projectId: string;
  projectRoot: string;
  currentVersion: string;
  targetVersion: string;
  backupRoot: string;
  backupZipPath: string;
  manifestPath: string;
  backupRecord: MakeClientUpdateBackupRecord;
  plannedFiles: string[];
  writtenFiles: string[];
  templateUrl: string;
  installMethod: MakeClientDependencyInstallMethod;
  metadataSynced: boolean;
  postUpdateWarning?: MakeClientUpdatePostUpdateWarning;
}

export const MAKE_CLIENT_ERROR_STATUS: Record<string, number> = {
  NOT_MAKE_CLIENT_PROJECT: 400,
  MAKE_PROJECT_ID_CONFLICT: 409,
  MAKE_CLIENT_SOURCE_UNAVAILABLE: 502,
  MAKE_CLIENT_TEMPLATE_UNAVAILABLE: 500,
  MAKE_CLIENT_INSTALL_FAILED: 500,
  MAKE_CLIENT_METADATA_SYNC_FAILED: 500,
  MAKE_CLIENT_UPDATE_NOT_AVAILABLE: 409,
  MAKE_CLIENT_GIT_CLONE_FAILED: 409,
  MAKE_CLIENT_DEV_TIMEOUT: 504,
  PNPM_NOT_FOUND: 500,
  INVALID_MAKE_PROJECT_FOLDER_NAME: 400,
  MAKE_PROJECT_TARGET_NOT_EMPTY: 409,
};

export class MakeClientProjectError extends Error {
  code: string;
  status: number;
  phase?: MakeClientPhase;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, options: { status?: number; phase?: MakeClientPhase; details?: Record<string, unknown> } = {}) {
    super(message);
    this.code = code;
    this.status = options.status ?? MAKE_CLIENT_ERROR_STATUS[code] ?? 500;
    this.phase = options.phase;
    this.details = options.details;
  }
}

function defaultCommandRunner(): MakeClientCommandRunner {
  return { runCommand: runLocalCommand, spawn };
}

export const MAKE_CLIENT_TEMPLATE_PATH = 'client';
export const MAKE_CLIENT_TEMPLATE_URL_ENV = 'AXHUB_MAKE_CLIENT_TEMPLATE_URL';
const MAKE_CLIENT_PROGRESS_LOG_ENV = 'AXHUB_MAKE_PROGRESS_LOG';
const SKIP_AUTO_START_SERVER_ENV = 'AXHUB_MAKE_SKIP_AUTO_START_SERVER';
const MAKE_CLIENT_RUNTIME_HEARTBEAT_MAX_AGE_MS = 15_000;
const DEFAULT_MAKE_CLIENT_TEMPLATE_TIMEOUT_MS = 3 * 60_000;
const DEFAULT_MAKE_CLIENT_TEMPLATE_PROBE_TIMEOUT_MS = 2_000;
const MAKE_CLIENT_TEMPLATE_GITHUB_PREFERENCE_WINDOW_MS = 150;
const DEFAULT_MAKE_CLIENT_TEMPLATE_MANIFEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAKE_CLIENT_GIT_CLONE_TIMEOUT_MS = 60_000;
const DEFAULT_MAKE_CLIENT_INSTALL_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_MAKE_CLIENT_DEV_TIMEOUT_MS = 60_000;
const DEFAULT_MAKE_CLIENT_DEV_POLL_INTERVAL_MS = 250;
const DEFAULT_MAKE_CLIENT_DEV_PORT = 51720;
const MAKE_CLIENT_RUNTIME_DISCOVERY_PORT_SPAN = 20;
const MAKE_CLIENT_RUNTIME_DISCOVERY_HEALTH_TIMEOUT_MS = 250;

const TEMPLATE_COPY_IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vite',
  '.local',
  '.opencode',
  '.trae',
  'coverage',
  'tests',
  '.cache',
  'tmp',
  'temp',
]);
const TEMPLATE_COPY_IGNORED_FILES = new Set([
  '.DS_Store',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.admin-server-info.json',
  '.dev-server-info.json',
  'entries.json',
]);
const TEMPLATE_COPY_IGNORED_AXHUB_MAKE_NAMES = new Set([
  'edit-history',
  'exports',
  'sessions',
]);
const TEMPLATE_COPY_ALLOWED_AXHUB_MAKE_FILES = new Set([
  '.axhub/make/client.json',
  '.axhub/make/axhub.config.json',
  '.axhub/make/README.md',
  '.axhub/make/sidebar-tree.json',
]);
const PROJECT_COPY_IGNORED_NAMES = new Set([
  '.git',
  '.git-versions',
  'dist',
  '.vite',
  '.cache',
  '.local',
  'coverage',
  'tmp',
  'temp',
]);
const PROJECT_COPY_IGNORED_FILES = new Set([
  '.DS_Store',
  '.admin-server-info.json',
  '.dev-server-info.json',
]);

export interface MakeClientTemplateSource {
  id: 'env' | 'github' | 'gitee';
  url: string;
  markerRepository: string;
  templateVersion?: string;
}

type MakeClientUpdateMetadataSource = 'online' | 'bundled';

interface MakeClientTemplateLatestManifest {
  schemaVersion: 1;
  version: string;
  releaseNotes: string;
  publishedAt?: string;
  sources: MakeClientTemplateSource[];
}

interface MakeClientUpdateMetadata {
  source: MakeClientUpdateMetadataSource;
  version: string;
  releaseNotes?: string;
  sources: MakeClientTemplateSource[];
  error?: string;
}

type MakeClientTemplateCacheStatus = 'hit' | 'miss' | 'version-mismatch';

interface MakeClientTemplateCacheManifest {
  schemaVersion: 1;
  url: string;
  cachedAt: string;
  templateVersion?: string;
}

export function makeClientTemplateSources(options: { env?: NodeJS.ProcessEnv; version?: string } = {}): MakeClientTemplateSource[] {
  const env = options.env || process.env;
  const overrideUrl = typeof env[MAKE_CLIENT_TEMPLATE_URL_ENV] === 'string'
    ? env[MAKE_CLIENT_TEMPLATE_URL_ENV]?.trim()
    : '';
  if (overrideUrl) {
    return [{
      id: 'env',
      url: overrideUrl,
      markerRepository: overrideUrl,
    }];
  }
  const version = options.version || DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION;
  return [
    {
      id: 'github',
      url: makeClientTemplatePrimaryDownloadUrl(version),
      markerRepository: DEFAULT_MAKE_CLIENT_REPOSITORY,
      templateVersion: version,
    },
    {
      id: 'gitee',
      url: makeClientTemplateMirrorDownloadUrl(version),
      markerRepository: 'https://gitee.com/axhub/Axhub-Make/tree/main/client',
      templateVersion: version,
    },
  ];
}

function makeClientTemplateManifestSources(): string[] {
  return [
    makeClientTemplatePrimaryManifestUrl(),
    makeClientTemplateMirrorManifestUrl(),
  ];
}

export function slugifyMakeClientFolderName(input: string): string {
    return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/[._-]{2,}/gu, '-')
    .replace(/[._-]+$/gu, '')
    .replace(/^[._-]+/gu, '')
    .slice(0, 80);
}

const WINDOWS_RESERVED_FOLDER_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

function formatLocalDateStamp(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function normalizeSuggestedFolderBase(projectName: string, now = new Date()): string {
  const baseName = slugifyMakeClientFolderName(projectName);
  const safeBaseName = baseName && !WINDOWS_RESERVED_FOLDER_NAMES.test(baseName)
    ? baseName
    : `make-project-${formatLocalDateStamp(now)}`;
  return safeBaseName.slice(0, 64);
}

export function suggestMakeClientFolderName(params: {
  parentRoot?: string;
  projectName?: string;
  now?: Date;
}): string {
  const baseName = normalizeSuggestedFolderBase(String(params.projectName || ''), params.now);
  const parentRoot = String(params.parentRoot || '').trim();
  if (!parentRoot) {
    return baseName;
  }
  const resolvedParentRoot = path.resolve(parentRoot);
  if (!fs.existsSync(resolvedParentRoot) || !fs.statSync(resolvedParentRoot).isDirectory()) {
    throw new MakeClientProjectError('INVALID_MAKE_PROJECT_FOLDER_NAME', 'Parent folder does not exist', { status: 400 });
  }
  if (!fs.existsSync(path.join(resolvedParentRoot, baseName))) {
    return baseName;
  }
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${baseName}-${index}`;
    if (!fs.existsSync(path.join(resolvedParentRoot, candidate))) {
      return candidate;
    }
  }
  throw new MakeClientProjectError('MAKE_PROJECT_TARGET_NOT_EMPTY', 'No available Make project folder name', { status: 409 });
}

export function assertSafeMakeClientFolderName(input: string): string {
  const raw = String(input || '').trim();
  if (
    !raw
    || raw === '.'
    || raw === '..'
    || raw.includes('/')
    || raw.includes('\\')
    || path.isAbsolute(raw)
    || /^[a-z]:/iu.test(raw)
    || /[<>:"|?*\u0000-\u001f]/u.test(raw)
    || /[ .]$/u.test(String(input || ''))
    || WINDOWS_RESERVED_FOLDER_NAMES.test(raw)
  ) {
    throw new MakeClientProjectError(
      'INVALID_MAKE_PROJECT_FOLDER_NAME',
      'Invalid Make project folder name',
      { status: 400 },
    );
  }
  return raw.slice(0, 80);
}

async function runMakeClientCommand(
  runner: MakeClientCommandRunner,
  command: string,
  args: string[],
  cwd: string,
  phase: MakeClientPhase,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const runCommand = runner.runCommand || runLocalCommand;
  try {
    await runCommand(command, args, {
      cwd,
      maxBuffer: 1024 * 1024 * 20,
      ...(typeof options.timeoutMs === 'number' ? { timeoutMs: options.timeoutMs } : {}),
    });
  } catch (error: any) {
    const output = String(error?.stderr || error?.stdout || error?.message || '').trim();
    const errorCode = String(error?.code || '');
    const code = command === 'pnpm' && /ENOENT|not found|command not found/iu.test(output || errorCode)
      ? 'PNPM_NOT_FOUND'
      : phase === 'template'
        ? 'MAKE_CLIENT_TEMPLATE_UNAVAILABLE'
        : phase === 'install'
          ? 'MAKE_CLIENT_INSTALL_FAILED'
          : 'MAKE_CLIENT_METADATA_SYNC_FAILED';
    throw new MakeClientProjectError(code, output || error?.message || 'Make client command failed', {
      phase,
      ...(errorCode ? { details: { commandErrorCode: errorCode } } : {}),
    });
  }
}

function shouldSkipTemplateCopyEntry(entryName: string, relativePath = entryName): boolean {
  if (TEMPLATE_COPY_IGNORED_NAMES.has(entryName) || TEMPLATE_COPY_IGNORED_FILES.has(entryName)) {
    return true;
  }
  const normalizedRelativePath = relativePath.split(path.sep).join('/');
  if (
    normalizedRelativePath.startsWith('.axhub/make/')
    && !TEMPLATE_COPY_ALLOWED_AXHUB_MAKE_FILES.has(normalizedRelativePath)
  ) {
    return true;
  }
  if (
    normalizedRelativePath.startsWith('.axhub/make/')
    && TEMPLATE_COPY_IGNORED_AXHUB_MAKE_NAMES.has(entryName)
  ) {
    return true;
  }
  if (entryName.endsWith('.tsbuildinfo')) {
    return true;
  }
  if (/^\.env\./u.test(entryName)) {
    return true;
  }
  return false;
}

function copyMakeClientTemplateDirectory(sourceRoot: string, targetRoot: string): void {
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new MakeClientProjectError(
      'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
      'Make client template is missing',
      { status: 500, phase: 'template', details: { templateRoot: sourceRoot } },
    );
  }

  const copyRecursive = (sourceDir: string, targetDir: string, relativeDir = '') => {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (shouldSkipTemplateCopyEntry(entry.name, relativePath)) {
        continue;
      }
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(sourcePath, targetPath, relativePath);
        continue;
      }
      if (entry.isFile()) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  };

  try {
    copyRecursive(sourceRoot, targetRoot);
  } catch (error: any) {
    if (error instanceof MakeClientProjectError) {
      throw error;
    }
    throw new MakeClientProjectError(
      'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
      error?.message || 'Failed to copy embedded Make client template',
      { status: 500, phase: 'template', details: { templateRoot: sourceRoot, targetRoot } },
    );
  }
}

function shouldSkipProjectCopyEntry(entryName: string): boolean {
  return entryName === 'node_modules'
    || PROJECT_COPY_IGNORED_NAMES.has(entryName)
    || PROJECT_COPY_IGNORED_FILES.has(entryName)
    || entryName.endsWith('.tsbuildinfo');
}

function copyFileSystemEntry(sourcePath: string, targetPath: string): void {
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
    dereference: false,
  });
}

function copyMakeClientProjectDirectory(sourceRoot: string, targetRoot: string): { copiedNodeModules: boolean } {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (shouldSkipProjectCopyEntry(entry.name)) {
      continue;
    }
    copyFileSystemEntry(path.join(sourceRoot, entry.name), path.join(targetRoot, entry.name));
  }

  const sourceNodeModules = path.join(sourceRoot, 'node_modules');
  const targetNodeModules = path.join(targetRoot, 'node_modules');
  if (!hasInstalledMakeClientDependencies(sourceRoot) || !fs.existsSync(sourceNodeModules)) {
    return { copiedNodeModules: false };
  }
  try {
    copyFileSystemEntry(sourceNodeModules, targetNodeModules);
    return { copiedNodeModules: true };
  } catch {
    fs.rmSync(targetNodeModules, { recursive: true, force: true });
    return { copiedNodeModules: false };
  }
}

function rewriteCopiedAbsolutePath(value: string, sourceRoot: string, targetRoot: string): string {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return value;
  }
  const normalized = value.replace(/\\/gu, path.sep);
  if (!path.isAbsolute(normalized)) {
    return value;
  }
  const resolved = path.resolve(normalized);
  if (!isInsideRoot(sourceRoot, resolved)) {
    return value;
  }
  return path.join(targetRoot, path.relative(sourceRoot, resolved));
}

function rewriteCopiedMetadataValue(value: unknown, sourceRoot: string, targetRoot: string): unknown {
  if (typeof value === 'string') {
    return rewriteCopiedAbsolutePath(value, sourceRoot, targetRoot);
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteCopiedMetadataValue(item, sourceRoot, targetRoot));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      next[key] = rewriteCopiedMetadataValue(item, sourceRoot, targetRoot);
    }
    return next;
  }
  return value;
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function rewriteCopiedProjectMetadata(params: {
  sourceRoot: string;
  targetRoot: string;
  projectId: string;
  projectName: string;
}): void {
  const metadataPath = getProjectMetadataPath(params.targetRoot);
  const rawMetadata = readJsonRecord(metadataPath);
  const rewritten = rewriteCopiedMetadataValue(rawMetadata, params.sourceRoot, params.targetRoot);
  const metadata = rewritten && typeof rewritten === 'object' && !Array.isArray(rewritten)
    ? rewritten as Record<string, unknown>
    : {};
  const project = metadata.project && typeof metadata.project === 'object' && !Array.isArray(metadata.project)
    ? metadata.project as Record<string, unknown>
    : {};
  metadata.schemaVersion = 1;
  metadata.project = {
    ...project,
    id: params.projectId,
    name: params.projectName,
  };
  writeJsonFile(metadataPath, metadata);
}

function rewriteProjectMetadataIdentity(projectRoot: string, projectId: string, projectName: string): void {
  const metadataPath = getProjectMetadataPath(projectRoot);
  const rawMetadata = readJsonRecord(metadataPath);
  const metadata = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
    ? rawMetadata as Record<string, unknown>
    : {};
  const project = metadata.project && typeof metadata.project === 'object' && !Array.isArray(metadata.project)
    ? metadata.project as Record<string, unknown>
    : {};
  metadata.schemaVersion = 1;
  metadata.project = {
    ...project,
    id: projectId,
    name: projectName,
  };
  writeJsonFile(metadataPath, metadata);
}

function buildMakeClientGitClonePrompt(params: {
  gitUrl: string;
  projectRoot: string;
  projectName: string;
  errorMessage: string;
}): string {
  return [
    '请帮我克隆并接入 Axhub Make 客户端项目。',
    '',
    `Git 地址：${params.gitUrl}`,
    `目标目录：${params.projectRoot}`,
    `项目名称：${params.projectName || path.basename(params.projectRoot)}`,
    '',
    '请先确认 Git 是否可用，并根据这个地址判断需要 HTTPS 登录、SSH key、访问令牌或仓库权限。',
    '如果需要授权，请引导我完成授权；如果 clone 成功，请确认项目目录里存在 .axhub/make/client.json，并运行 npm install --include=dev 与 npm run metadata:sync。',
    '如果仓库不是 Axhub Make 客户端项目，请说明需要补齐 .axhub/make/client.json、package.json scripts.dev 和 metadata:sync 后再回到 Axhub Make 选择已有项目。',
    '',
    '错误摘要：',
    params.errorMessage || 'Git clone failed',
  ].join('\n');
}

function attachMakeClientGitClonePrompt(
  error: unknown,
  params: {
    gitUrl: string;
    projectRoot: string;
    projectName: string;
  },
): unknown {
  const errorMessage = commandErrorMessage(error);
  const promptDetails = {
    gitUrl: params.gitUrl,
    projectRoot: params.projectRoot,
    promptScene: 'git-clone',
    prompt: buildMakeClientGitClonePrompt({
      ...params,
      errorMessage,
    }),
  };
  if (error instanceof MakeClientProjectError) {
    error.phase = error.phase || 'clone';
    error.details = {
      ...(error.details || {}),
      ...promptDetails,
    };
    return error;
  }
  return new MakeClientProjectError(
    'MAKE_CLIENT_GIT_CLONE_FAILED',
    errorMessage || 'Git clone failed',
    {
      status: 409,
      phase: 'clone',
      details: promptDetails,
    },
  );
}

function templateErrorMessage(error: unknown): string {
  const looseError = error as { stderr?: unknown; stdout?: unknown; message?: unknown } | null;
  return String(looseError?.stderr || looseError?.stdout || looseError?.message || 'Remote template download failed').trim();
}

function extractTemplateZip(zipBuffer: Uint8Array, destinationRoot: string): void {
  extractZipBufferToDirectory(zipBuffer, destinationRoot, {
    stripSingleRoot: true,
    emptyArchiveMessage: 'Make client template zip is empty',
    unsafePathMessage: (entryName) => `unsafe template zip path: ${entryName}`,
  });
}

async function downloadTemplateZip(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_MAKE_CLIENT_TEMPLATE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Make client template zip is empty');
    }
    return new Uint8Array(arrayBuffer);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Template zip download timed out after ${DEFAULT_MAKE_CLIENT_TEMPLATE_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeManifestTemplateSource(source: unknown, fallbackVersion: string): MakeClientTemplateSource | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  const record = source as Record<string, unknown>;
  const id = stringValue(record.id);
  if (id !== 'github' && id !== 'gitee') {
    return null;
  }
  const url = stringValue(record.url);
  const markerRepository = stringValue(record.markerRepository);
  if (!url || !markerRepository) {
    return null;
  }
  const templateVersion = stringValue(record.templateVersion) || fallbackVersion;
  return {
    id,
    url,
    markerRepository,
    ...(templateVersion ? { templateVersion } : {}),
  };
}

function normalizeMakeClientTemplateLatestManifest(raw: unknown): MakeClientTemplateLatestManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Make client template manifest must be a JSON object');
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error('Make client template manifest schemaVersion must be 1');
  }
  const version = stringValue(record.version);
  const releaseNotes = stringValue(record.releaseNotes);
  if (!version) {
    throw new Error('Make client template manifest version is required');
  }
  if (!releaseNotes) {
    throw new Error('Make client template manifest releaseNotes is required');
  }
  const sources = (Array.isArray(record.sources) ? record.sources : [])
    .map((source) => normalizeManifestTemplateSource(source, version))
    .filter((source): source is MakeClientTemplateSource => Boolean(source));
  if (sources.length === 0) {
    throw new Error('Make client template manifest sources are required');
  }
  const publishedAt = stringValue(record.publishedAt);
  return {
    schemaVersion: 1,
    version,
    releaseNotes,
    ...(publishedAt ? { publishedAt } : {}),
    sources,
  };
}

async function downloadMakeClientTemplateLatestManifest(url: string): Promise<MakeClientTemplateLatestManifest> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_MAKE_CLIENT_TEMPLATE_MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`);
    }
    return normalizeMakeClientTemplateLatestManifest(await response.json());
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Template manifest download timed out after ${DEFAULT_MAKE_CLIENT_TEMPLATE_MANIFEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function bundledMakeClientUpdateMetadata(error?: string): MakeClientUpdateMetadata {
  const version = DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION;
  return {
    source: 'bundled',
    version,
    ...(DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES ? { releaseNotes: DEFAULT_MAKE_CLIENT_TEMPLATE_RELEASE_NOTES } : {}),
    sources: makeClientTemplateSources({ version }),
    ...(error ? { error } : {}),
  };
}

async function resolveMakeClientUpdateMetadata(): Promise<MakeClientUpdateMetadata> {
  if (process.env[MAKE_CLIENT_TEMPLATE_URL_ENV]?.trim()) {
    return bundledMakeClientUpdateMetadata();
  }

  const failures: string[] = [];
  for (const manifestUrl of makeClientTemplateManifestSources()) {
    try {
      const manifest = await downloadMakeClientTemplateLatestManifest(manifestUrl);
      return {
        source: 'online',
        version: manifest.version,
        releaseNotes: manifest.releaseNotes,
        sources: manifest.sources,
      };
    } catch (error) {
      failures.push(`${manifestUrl}: ${templateErrorMessage(error)}`);
    }
  }
  return bundledMakeClientUpdateMetadata(failures.join('\n'));
}

function makeClientTemplateCacheRoot(): string {
  return path.join(os.tmpdir(), 'axhub-make', 'make-client-template-cache');
}

function makeClientTemplateCachePath(url: string): string {
  const key = crypto.createHash('sha256').update(url).digest('hex');
  return path.join(makeClientTemplateCacheRoot(), `${key}.zip`);
}

function makeClientTemplateCacheManifestPath(cachePath: string): string {
  return `${cachePath}.json`;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readTemplateCacheManifest(cachePath: string): MakeClientTemplateCacheManifest | null {
  const manifestPath = makeClientTemplateCacheManifestPath(cachePath);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const record = raw as Record<string, unknown>;
    if (record.schemaVersion !== 1) {
      return null;
    }
    const url = stringValue(record.url);
    const cachedAt = stringValue(record.cachedAt);
    if (!url || !cachedAt) {
      return null;
    }
    const templateVersion = stringValue(record.templateVersion);
    return {
      schemaVersion: 1,
      url,
      cachedAt,
      ...(templateVersion ? { templateVersion } : {}),
    };
  } catch {
    return null;
  }
}

function writeTemplateCacheManifest(cachePath: string, params: { url: string; templateVersion?: string }): void {
  const manifest: MakeClientTemplateCacheManifest = {
    schemaVersion: 1,
    url: params.url,
    cachedAt: new Date().toISOString(),
    ...(params.templateVersion ? { templateVersion: params.templateVersion } : {}),
  };
  fs.writeFileSync(makeClientTemplateCacheManifestPath(cachePath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function getTemplateCacheStatus(
  cachePath: string,
  params: { url: string; templateVersion?: string },
): MakeClientTemplateCacheStatus {
  if (!fs.existsSync(cachePath)) {
    return 'miss';
  }
  if (!params.templateVersion) {
    return 'hit';
  }
  const manifest = readTemplateCacheManifest(cachePath);
  return manifest?.url === params.url && manifest.templateVersion === params.templateVersion
    ? 'hit'
    : 'version-mismatch';
}

async function readTemplateZipWithCache(
  source: MakeClientTemplateSource,
): Promise<{ zipBuffer: Uint8Array; cache: { status: MakeClientTemplateCacheStatus; path: string } }> {
  const { url, templateVersion } = source;
  const cachePath = makeClientTemplateCachePath(url);
  const status = getTemplateCacheStatus(cachePath, { url, templateVersion });
  if (status === 'hit') {
    return {
      zipBuffer: new Uint8Array(fs.readFileSync(cachePath)),
      cache: { status, path: cachePath },
    };
  }

  const zipBuffer = await downloadTemplateZip(url);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, zipBuffer);
    fs.renameSync(tempPath, cachePath);
    writeTemplateCacheManifest(cachePath, { url, templateVersion });
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
  return {
    zipBuffer,
    cache: { status, path: cachePath },
  };
}

function commandErrorMessage(error: unknown): string {
  const looseError = error as { stderr?: unknown; stdout?: unknown; message?: unknown } | null;
  return String(looseError?.stderr || looseError?.stdout || looseError?.message || 'Command failed').trim();
}

function nonInteractiveGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
  };
}

function shouldLogMakeClientProgress(): boolean {
  return process.env.NODE_ENV !== 'test' || process.env[MAKE_CLIENT_PROGRESS_LOG_ENV] === '1';
}

function formatMakeClientProgressValue(value: string): string {
  return JSON.stringify(value);
}

function formatMakeClientProgressError(error: unknown): string {
  const message = commandErrorMessage(error).replace(/\s+/gu, ' ').trim();
  return formatMakeClientProgressValue(message.length > 160 ? `${message.slice(0, 160)}...` : message);
}

function createMakeClientProgressLogger(scope: 'create' | 'dev', params: {
  projectRoot: string;
  projectId?: string;
}): MakeClientProgressLogger {
  const enabled = shouldLogMakeClientProgress();
  const startedAt = Date.now();
  const steps: MakeClientProgressStep[] = [];
  let finished = false;
  let status: MakeClientProgressSnapshot['status'] = 'running';
  let totalMs: number | null = null;
  const prefix = `[make-client:${scope}]`;
  const context = [
    params.projectId ? `project=${formatMakeClientProgressValue(params.projectId)}` : '',
    `root=${formatMakeClientProgressValue(params.projectRoot)}`,
  ].filter(Boolean).join(' ');

  const log = (message: string) => {
    if (enabled) {
      console.info(`${prefix} ${message}${context ? ` ${context}` : ''}`);
    }
  };

  const recordStep = <T>(id: string, label: string, action: () => T): T => {
    const stepStartedAt = Date.now();
    log(`step=start id=${id} label=${label}`);
    try {
      const result = action();
      const durationMs = Date.now() - stepStartedAt;
      steps.push({ id, label, durationMs, status: 'done' });
      log(`step=done id=${id} label=${label} durationMs=${durationMs}`);
      return result;
    } catch (error) {
      const durationMs = Date.now() - stepStartedAt;
      steps.push({ id, label, durationMs, status: 'failed' });
      log(`step=failed id=${id} label=${label} durationMs=${durationMs} error=${formatMakeClientProgressError(error)}`);
      throw error;
    }
  };

  log('start');

  return {
    async run<T>(id: string, label: string, action: () => Promise<T>): Promise<T> {
      const stepStartedAt = Date.now();
      log(`step=start id=${id} label=${label}`);
      try {
        const result = await action();
        const durationMs = Date.now() - stepStartedAt;
        steps.push({ id, label, durationMs, status: 'done' });
        log(`step=done id=${id} label=${label} durationMs=${durationMs}`);
        return result;
      } catch (error) {
        const durationMs = Date.now() - stepStartedAt;
        steps.push({ id, label, durationMs, status: 'failed' });
        log(`step=failed id=${id} label=${label} durationMs=${durationMs} error=${formatMakeClientProgressError(error)}`);
        throw error;
      }
    },
    runSync: recordStep,
    snapshot() {
      return {
        status,
        totalMs: totalMs ?? Date.now() - startedAt,
        steps: steps.map((step) => ({ ...step })),
      };
    },
    finish(nextStatus: 'success' | 'failed', error?: unknown) {
      if (finished) {
        return;
      }
      finished = true;
      totalMs = Date.now() - startedAt;
      status = nextStatus;
      const summary = steps
        .map((step) => `${step.id}=${step.durationMs}${step.status === 'failed' ? ':failed' : ''}`)
        .join(' ');
      const errorText = nextStatus === 'failed' && error ? ` error=${formatMakeClientProgressError(error)}` : '';
      log(`summary status=${nextStatus} totalMs=${totalMs}${summary ? ` ${summary}` : ''}${errorText}`);
    },
  };
}

function makeClientDevSpawnError(error: unknown, command: string, args: string[]): MakeClientProjectError {
  return new MakeClientProjectError(
    'MAKE_CLIENT_DEV_FAILED',
    commandErrorMessage(error),
    {
      status: 500,
      phase: 'dev',
      details: {
        command,
        args,
        error: commandErrorMessage(error),
      },
    },
  );
}

function writeDiagnosticLogLines(log: DiagnosticLog | undefined, prefix: string, chunk: unknown): void {
  if (!log) {
    return;
  }
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  const normalized = text.replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  const effectiveLines = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
  for (const line of effectiveLines) {
    log.write(`${prefix} ${line}`);
  }
}

function attachMakeClientDevDiagnostics(
  child: ReturnType<typeof spawn>,
  options: {
    command: string;
    args: string[];
    projectRoot: string;
    diagnosticLog?: DiagnosticLog;
  },
): void {
  const log = options.diagnosticLog;
  if (!log) {
    return;
  }
  const context = `root=${JSON.stringify(options.projectRoot)} command=${JSON.stringify([options.command, ...options.args].join(' '))}`;
  log.write(`[make-client:dev] spawned ${context}`);
  child.stdout?.on('data', (chunk) => {
    writeDiagnosticLogLines(log, `[make-client:dev:stdout] ${context}`, chunk);
  });
  child.stderr?.on('data', (chunk) => {
    writeDiagnosticLogLines(log, `[make-client:dev:stderr] ${context}`, chunk);
  });
  child.once?.('error', (error) => {
    log.write(`[make-client:dev:error] ${context} error=${commandErrorMessage(error)}`);
  });
  child.once?.('exit', (code, signal) => {
    log.write(`[make-client:dev:exit] ${context} code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function resolveProjectRegistryRoute(
  runner: MakeClientCommandRunner,
  projectRoot: string,
): Promise<MakeClientRegistryRoute> {
  const runCommand = runner.runCommand || runLocalCommand;
  const route = await resolveMakeClientRegistryRoute({
    cwd: projectRoot,
    npmCommand: npmCommand(),
    probePackages: deriveRegistryProbePackages(readJsonRecord(path.join(projectRoot, 'package.json'))),
    runCommand: (command, args, options) => runCommand(command, args, {
      ...options,
      maxBuffer: 1024 * 1024,
    }),
  });
  if (shouldLogMakeClientProgress()) {
    if (route.mode === 'automatic') {
      const timings = route.probes
        .map((probe) => `${probe.id}=${probe.ok ? `${probe.durationMs}ms` : 'failed'}`)
        .join(' ');
      console.info(`[make-client:registry] mode=automatic selected=${route.selected.id} reason=${route.reason} ${timings}`);
    } else {
      console.info(`[make-client:registry] mode=configured reason=${route.reason}`);
    }
  }
  return route;
}

function registryCandidates(route: MakeClientRegistryRoute): Array<string | undefined> {
  return route.mode === 'automatic'
    ? [route.selected.url, route.alternate.url]
    : [undefined];
}

async function runMakeClientInstallWithRegistryRoute(params: {
  args: string[];
  method: 'npm' | 'pnpm';
  projectRoot: string;
  route: MakeClientRegistryRoute;
  runner: MakeClientCommandRunner;
}): Promise<void> {
  const command = params.method === 'npm' ? npmCommand() : 'pnpm';
  const candidates = registryCandidates(params.route);
  let lastError: unknown;
  for (let index = 0; index < candidates.length; index += 1) {
    const registryUrl = candidates[index];
    try {
      await runMakeClientCommand(
        params.runner,
        command,
        registryInstallArgs(params.args, registryUrl),
        params.projectRoot,
        'install',
        { timeoutMs: DEFAULT_MAKE_CLIENT_INSTALL_TIMEOUT_MS },
      );
      return;
    } catch (error) {
      lastError = error;
      if (params.method === 'npm' && isNpmArboristNullPropertyError(error)) {
        try {
          await runMakeClientCommand(
            params.runner,
            command,
            registryInstallArgs([...params.args, '--legacy-peer-deps'], registryUrl),
            params.projectRoot,
            'install',
            { timeoutMs: DEFAULT_MAKE_CLIENT_INSTALL_TIMEOUT_MS },
          );
          return;
        } catch (legacyError) {
          lastError = legacyError;
        }
      }
      const hasAlternate = index + 1 < candidates.length;
      if (!hasAlternate || !isRetryableRegistryError(lastError)) {
        throw lastError;
      }
      if (shouldLogMakeClientProgress() && params.route.mode === 'automatic') {
        console.info(
          `[make-client:registry] retry method=${params.method} from=${index === 0 ? params.route.selected.id : params.route.alternate.id}`,
        );
      }
    }
  }
  throw lastError;
}

function viteBinPath(projectRoot: string): string {
  const binName = process.platform === 'win32' ? 'vite.cmd' : 'vite';
  return path.join(projectRoot, 'node_modules', '.bin', binName);
}

function viteNodeEntrypoint(projectRoot: string): string {
  const viteRoot = path.join(projectRoot, 'node_modules', 'vite');
  const packagePath = path.join(viteRoot, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const bin = pkg?.bin;
    const viteBin = typeof bin === 'string'
      ? bin
      : typeof bin?.vite === 'string'
        ? bin.vite
        : 'bin/vite.js';
    return path.join(viteRoot, viteBin);
  } catch {
    return path.join(viteRoot, 'bin', 'vite.js');
  }
}

function hasInstalledMakeClientDependencies(projectRoot: string): boolean {
  return fs.existsSync(viteBinPath(projectRoot))
    || fs.existsSync(path.join(projectRoot, 'node_modules', 'vite'));
}

async function ensureMakeClientDependencies(
  runner: MakeClientCommandRunner,
  projectRoot: string,
): Promise<MakeClientDependencyInstallMethod> {
  if (hasInstalledMakeClientDependencies(projectRoot)) {
    return 'skipped';
  }

  const registryRoute = await resolveProjectRegistryRoute(runner, projectRoot);
  try {
    await runMakeClientInstallWithRegistryRoute({
      args: ['install', '--include=dev'],
      method: 'npm',
      projectRoot,
      route: registryRoute,
      runner,
    });
    return 'npm';
  } catch (npmError) {
    try {
      await runMakeClientInstallWithRegistryRoute({
        args: ['install', '--prod=false'],
        method: 'pnpm',
        projectRoot,
        route: registryRoute,
        runner,
      });
      return 'pnpm';
    } catch (pnpmError) {
      throw new MakeClientProjectError(
        'MAKE_CLIENT_INSTALL_FAILED',
        [
          `${npmCommand()} install failed: ${commandErrorMessage(npmError)}`,
          `pnpm install failed: ${commandErrorMessage(pnpmError)}`,
        ].join('\n'),
        {
          status: 500,
          phase: 'install',
          details: {
            npm: commandErrorMessage(npmError),
            pnpm: commandErrorMessage(pnpmError),
          },
        },
      );
    }
  }
}

function isNpmArboristNullPropertyError(error: unknown): boolean {
  return /Cannot read (?:properties|property) of null \(reading '[^']+'\)/iu.test(commandErrorMessage(error));
}

function resolveMakeClientDevCommand(installMethod: MakeClientDependencyInstallMethod, projectRoot: string): { command: string; args: string[] } {
  const viteEntrypoint = viteNodeEntrypoint(projectRoot);
  if (fs.existsSync(viteEntrypoint)) {
    return { command: process.execPath, args: [viteEntrypoint] };
  }
  throw new MakeClientProjectError(
    'MAKE_CLIENT_INSTALL_FAILED',
    'Make client vite dependency is missing after install',
    { status: 500, phase: 'install', details: { viteEntrypoint, installMethod } },
  );
}

async function resolveMakeClientDevCommandForProject(
  runner: MakeClientCommandRunner,
  installMethod: MakeClientDependencyInstallMethod,
  projectRoot: string,
): Promise<{ command: string; args: string[] }> {
  void runner;
  return resolveMakeClientDevCommand(installMethod, projectRoot);
}

interface ExtractedMakeClientTemplateSource {
  cache: { status: MakeClientTemplateCacheStatus; path: string };
  index: number;
  source: MakeClientTemplateSource;
  templateRoot: string;
}

interface MakeClientTemplateProbe {
  durationMs: number;
  index: number;
  ok: boolean;
  source: MakeClientTemplateSource;
}

interface MakeClientTemplateFailure {
  cache: { status: MakeClientTemplateCacheStatus; path: string } | null;
  error: string;
  url: string;
}

function removeTemplateCache(cachePath: string): void {
  fs.rmSync(cachePath, { force: true });
  fs.rmSync(makeClientTemplateCacheManifestPath(cachePath), { force: true });
}

function logSelectedMakeClientTemplate(source: MakeClientTemplateSource, cache: { status: MakeClientTemplateCacheStatus; path: string }): void {
  if (shouldLogMakeClientProgress()) {
    console.info(`[make-client:template] selected=${source.id} cache=${cache.status}`);
  }
}

async function probeMakeClientTemplateSource(source: MakeClientTemplateSource, index: number): Promise<MakeClientTemplateProbe> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_MAKE_CLIENT_TEMPLATE_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, { method: 'HEAD', signal: controller.signal });
    return {
      durationMs: Date.now() - startedAt,
      index,
      ok: response.ok,
      source,
    };
  } catch {
    return {
      durationMs: Date.now() - startedAt,
      index,
      ok: false,
      source,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function rankMakeClientTemplateSources(sources: MakeClientTemplateSource[]): Promise<MakeClientTemplateProbe[]> {
  if (sources.length <= 1) {
    return sources.map((source, index) => ({ durationMs: 0, index, ok: true, source }));
  }

  const probes = await Promise.all(sources.map((source, index) => probeMakeClientTemplateSource(source, index)));
  const healthy = probes.filter((probe) => probe.ok);
  const fastestHealthyDuration = healthy.reduce(
    (fastest, probe) => Math.min(fastest, probe.durationMs),
    Number.POSITIVE_INFINITY,
  );
  const githubIsClose = healthy.some(
    (probe) => probe.source.id === 'github'
      && probe.durationMs <= fastestHealthyDuration + MAKE_CLIENT_TEMPLATE_GITHUB_PREFERENCE_WINDOW_MS,
  );
  const compareByProbe = (left: MakeClientTemplateProbe, right: MakeClientTemplateProbe) => {
    if (githubIsClose && left.source.id === 'github' && right.source.id !== 'github') {
      return -1;
    }
    if (githubIsClose && right.source.id === 'github' && left.source.id !== 'github') {
      return 1;
    }
    return left.durationMs - right.durationMs || left.index - right.index;
  };

  return [
    ...healthy.sort(compareByProbe),
    ...probes.filter((probe) => !probe.ok).sort((left, right) => left.index - right.index),
  ];
}

function cacheFailure(
  failures: Array<MakeClientTemplateFailure | undefined>,
  index: number,
  source: MakeClientTemplateSource,
  cache: { status: MakeClientTemplateCacheStatus; path: string } | null,
  error: unknown,
): void {
  failures[index] = {
    url: source.url,
    cache,
    error: templateErrorMessage(error),
  };
}

async function extractFirstValidMakeClientTemplate(params: {
  failurePhase: MakeClientPhase;
  sources: MakeClientTemplateSource[];
  tempParent: string;
}): Promise<ExtractedMakeClientTemplateSource> {
  const failures: Array<MakeClientTemplateFailure | undefined> = [];

  // Cache hits are already local, so validate them before doing any remote probes.
  for (const [index, source] of params.sources.entries()) {
    const cachePath = makeClientTemplateCachePath(source.url);
    const status = getTemplateCacheStatus(cachePath, source);
    if (status !== 'hit') {
      continue;
    }
    const templateRoot = path.join(params.tempParent, `source-${index}`);
    const cache = { status, path: cachePath };
    try {
      extractTemplateZip(new Uint8Array(fs.readFileSync(cachePath)), templateRoot);
      logSelectedMakeClientTemplate(source, cache);
      return { cache, index, source, templateRoot };
    } catch (error) {
      cacheFailure(failures, index, source, cache, error);
      removeTemplateCache(cachePath);
      fs.rmSync(templateRoot, { recursive: true, force: true });
    }
  }

  const rankedSources = await rankMakeClientTemplateSources(params.sources);
  for (const { index, source } of rankedSources) {
    const templateRoot = path.join(params.tempParent, `source-${index}`);
    let cache: { status: MakeClientTemplateCacheStatus; path: string } | null = null;
    try {
      const cached = await readTemplateZipWithCache(source);
      cache = cached.cache;
      extractTemplateZip(cached.zipBuffer, templateRoot);
      logSelectedMakeClientTemplate(source, cache);
      return { cache, index, source, templateRoot };
    } catch (error) {
      cacheFailure(failures, index, source, cache, error);
      if (cache) {
        removeTemplateCache(cache.path);
      }
      fs.rmSync(templateRoot, { recursive: true, force: true });
    }
  }

  throw new MakeClientProjectError(
    'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
    'Failed to download Make client template from all remote sources',
    {
      status: 500,
      phase: params.failurePhase,
      details: { sources: failures.filter((failure): failure is MakeClientTemplateFailure => Boolean(failure)) },
    },
  );
}

async function fetchMakeClientTemplateFromRemote(
  runner: MakeClientCommandRunner,
  targetRoot: string,
): Promise<{ markerRepository: string; templateUrl: string; templateVersion?: string }> {
  void runner;
  const templateMetadata = await resolveMakeClientUpdateMetadata();
  const templateSources = compareTemplateVersions(
    templateMetadata.version,
    DEFAULT_MAKE_CLIENT_TEMPLATE_VERSION,
  ) >= 0
    ? templateMetadata.sources
    : makeClientTemplateSources();
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-client-template-'));

  try {
    const winner = await extractFirstValidMakeClientTemplate({
      failurePhase: 'template',
      sources: templateSources,
      tempParent,
    });
    try {
      copyMakeClientTemplateDirectory(winner.templateRoot, targetRoot);
    } catch (error) {
      fs.rmSync(targetRoot, { recursive: true, force: true });
      throw new MakeClientProjectError(
        'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
        templateErrorMessage(error),
        {
          status: 500,
          phase: 'template',
          details: { source: winner.source.url },
        },
      );
    }
    return {
      markerRepository: winner.source.markerRepository,
      templateUrl: winner.source.url,
      ...(winner.source.templateVersion ? { templateVersion: winner.source.templateVersion } : {}),
    };
  } finally {
    fs.rmSync(tempParent, { recursive: true, force: true });
  }
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveEmbeddedMakeClientRuntimeFile(relativePath: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client', ...relativePath.split('/'));
}

function hasMakeClientRuntimePatchSurface(projectRoot: string): boolean {
  return MAKE_CLIENT_RUNTIME_PATCH_FILES.some((relativePath) => {
    const targetPath = path.resolve(projectRoot, ...relativePath.split('/'));
    return isInsideRoot(projectRoot, targetPath) && fs.existsSync(targetPath);
  });
}

function syncMakeClientRuntimePatchFiles(projectRoot: string): { patched: boolean; files: string[] } {
  if (!hasMakeClientRuntimePatchSurface(projectRoot)) {
    return { patched: false, files: [] };
  }
  const writtenFiles: string[] = [];
  for (const relativePath of MAKE_CLIENT_RUNTIME_PATCH_FILES) {
    const sourcePath = resolveEmbeddedMakeClientRuntimeFile(relativePath);
    const targetPath = path.resolve(projectRoot, ...relativePath.split('/'));
    if (!isInsideRoot(projectRoot, targetPath) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }
    const source = fs.readFileSync(sourcePath);
    const target = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
      ? fs.readFileSync(targetPath)
      : null;
    if (target && Buffer.compare(source, target) === 0) {
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, source);
    writtenFiles.push(relativePath);
  }
  return { patched: writtenFiles.length > 0, files: writtenFiles };
}

function readJsonRecord(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readMakeClientPackageVersion(projectRoot: string): string {
  const pkg = readJsonRecord(path.join(projectRoot, 'package.json'));
  return stringValue(pkg.version);
}

function readMakeClientCurrentTemplateVersion(projectRoot: string, marker?: MakeClientMarker | null): string {
  return stringValue(marker?.templateVersion) || readMakeClientPackageVersion(projectRoot);
}

function parseVersionParts(value: string): { parts: number[]; prerelease: string } | null {
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([^+]+))?(?:\+.*)?$/u);
  if (!match) {
    return null;
  }
  return {
    parts: [match[1], match[2] || '0', match[3] || '0'].map((part) => Number(part)),
    prerelease: match[4] || '',
  };
}

function compareTemplateVersions(currentVersion: string, targetVersion: string): number {
  const current = parseVersionParts(currentVersion);
  const target = parseVersionParts(targetVersion);
  if (current && target) {
    for (let index = 0; index < Math.max(current.parts.length, target.parts.length); index += 1) {
      const diff = (current.parts[index] || 0) - (target.parts[index] || 0);
      if (diff !== 0) {
        return diff;
      }
    }
    if (current.prerelease && !target.prerelease) {
      return -1;
    }
    if (!current.prerelease && target.prerelease) {
      return 1;
    }
    if (current.prerelease || target.prerelease) {
      return current.prerelease.localeCompare(target.prerelease);
    }
    return 0;
  }
  return currentVersion.localeCompare(targetVersion);
}

function isTemplateUpdateAvailable(currentVersion: string, targetVersion: string): boolean {
  if (!currentVersion) {
    return true;
  }
  return compareTemplateVersions(currentVersion, targetVersion) < 0;
}

async function runGit(
  runner: MakeClientCommandRunner,
  projectRoot: string,
  args: string[],
): Promise<string> {
  const runCommand = runner.runCommand || runLocalCommand;
  const result = await runCommand('git', args, {
    cwd: projectRoot,
    maxBuffer: 1024 * 1024 * 10,
  });
  return String(result.stdout || '').trim();
}

function makeClientUpdateBackupsRoot(projectRoot: string): string {
  return path.join(projectRoot, '.axhub', 'make', 'backups');
}

function buildMakeClientUpdateBlockedReasons(params: {
  updateAvailable: boolean;
  templateSources: MakeClientTemplateSource[];
}): MakeClientUpdateBlockedReason[] {
  const reasons: MakeClientUpdateBlockedReason[] = [];
  if (!params.updateAvailable) {
    reasons.push({ code: 'NO_UPDATE_AVAILABLE', message: '当前客户端模板已是最新版本' });
  }
  if (params.templateSources.length === 0) {
    reasons.push({ code: 'TEMPLATE_SOURCE_UNAVAILABLE', message: '没有可用的 Make 客户端模板源' });
  }
  return reasons;
}

async function collectRemoteMakeClientUpdateTemplateFiles(
  targetVersion: string,
  sources?: MakeClientTemplateSource[],
): Promise<string[]> {
  const extractedTemplate = await extractMakeClientUpdateTemplate(targetVersion, sources);
  try {
    return collectMakeClientUpdateTemplateFiles(extractedTemplate.templateRoot);
  } finally {
    fs.rmSync(extractedTemplate.tempParent, { recursive: true, force: true });
  }
}

export async function getMakeClientUpdateStatus(
  projectId: string,
  projectRoot: string,
  options: { commandRunner?: MakeClientCommandRunner } = {},
): Promise<MakeClientUpdateStatus> {
  const root = path.resolve(projectRoot);
  const marker = validateExistingMakeClientProject(root);
  const currentVersion = readMakeClientCurrentTemplateVersion(root, marker);
  const metadata = await resolveMakeClientUpdateMetadata();
  const targetVersion = metadata.version;
  const templateSources = metadata.sources;
  const updateAvailable = isTemplateUpdateAvailable(currentVersion, targetVersion);
  const blockedReasons = buildMakeClientUpdateBlockedReasons({
    updateAvailable,
    templateSources,
  });
  return {
    projectId,
    projectRoot: root,
    currentVersion,
    targetVersion,
    ...(metadata.releaseNotes ? { releaseNotes: metadata.releaseNotes } : {}),
    metadataSource: metadata.source,
    ...(metadata.error ? { metadataError: metadata.error } : {}),
    updateAvailable,
    canApply: blockedReasons.length === 0,
    backupPolicy: 'zip-before-overwrite',
    lastBackup: readLatestMakeClientUpdateBackupRecord(root),
    template: {
      version: targetVersion,
      sources: templateSources,
    },
    blockedReasons,
  };
}

function assertMakeClientUpdateCanApply(status: MakeClientUpdateStatus): void {
  const blockingReason = status.blockedReasons[0];
  if (blockingReason) {
    throw new MakeClientProjectError('MAKE_CLIENT_UPDATE_NOT_AVAILABLE', blockingReason.message, { status: 409, phase: 'version' });
  }
}

async function extractMakeClientUpdateTemplate(
  targetVersion: string,
  sources?: MakeClientTemplateSource[],
): Promise<{
  tempParent: string;
  templateRoot: string;
  source: MakeClientTemplateSource;
}> {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-make-client-update-template-'));
  try {
    const winner = await extractFirstValidMakeClientTemplate({
      failurePhase: 'download-template',
      sources: sources?.length ? sources : makeClientTemplateSources({ version: targetVersion }),
      tempParent,
    });
    return {
      tempParent,
      templateRoot: winner.templateRoot,
      source: winner.source,
    };
  } catch (error) {
    fs.rmSync(tempParent, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreMakeClientTemplateFile(
  projectRoot: string,
  relativePath: string,
): Promise<{ restored: true; version: string; sourceUrl: string }> {
  const root = path.resolve(projectRoot);
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath || normalizedPath !== relativePath.replace(/\\/gu, '/')) {
    throw new MakeClientProjectError(
      'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
      'Invalid Make client template file path',
      { status: 400, phase: 'template' },
    );
  }
  const targetPath = path.resolve(root, ...normalizedPath.split('/'));
  if (!isInsideRoot(root, targetPath)) {
    throw new MakeClientProjectError(
      'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
      'Unsafe Make client template file path',
      { status: 400, phase: 'template' },
    );
  }
  if (fs.existsSync(targetPath)) {
    throw new MakeClientProjectError(
      'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
      'Make client template file already exists',
      { status: 409, phase: 'template' },
    );
  }

  const metadata = await resolveMakeClientUpdateMetadata();
  const extractedTemplate = await extractMakeClientUpdateTemplate(metadata.version, metadata.sources);
  try {
    const sourcePath = path.resolve(extractedTemplate.templateRoot, ...normalizedPath.split('/'));
    if (
      !isInsideRoot(extractedTemplate.templateRoot, sourcePath)
      || !fs.existsSync(sourcePath)
      || !fs.statSync(sourcePath).isFile()
    ) {
      throw new MakeClientProjectError(
        'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
        `Official Make client template file is missing: ${normalizedPath}`,
        { status: 502, phase: 'template' },
      );
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    return {
      restored: true,
      version: metadata.version,
      sourceUrl: extractedTemplate.source.url,
    };
  } finally {
    fs.rmSync(extractedTemplate.tempParent, { recursive: true, force: true });
  }
}

function shouldSkipMakeClientUpdateEntry(relativePath: string, entryName: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  if (
    entryName === '.git'
    || entryName === 'node_modules'
    || entryName === 'dist'
    || entryName === '.local'
    || entryName === '.vite'
    || entryName === '.cache'
    || entryName === 'tmp'
    || entryName === 'temp'
  ) {
    return true;
  }
  if (normalized === '.axhub/make/client.json') {
    return true;
  }
  if (normalized === '.axhub/make/sidebar-tree.json') {
    return true;
  }
  if (
    normalized.startsWith('.axhub/make/sessions/')
    || normalized.startsWith('.axhub/make/exports/')
    || normalized.startsWith('.axhub/make/edit-history/')
    || normalized.startsWith('.axhub/make/backups/')
    || normalized.startsWith('.axhub/make/comments/')
    || normalized.startsWith('.axhub/make/comment-assets/')
  ) {
    return true;
  }
  if (normalized === 'src/resources' || normalized.startsWith('src/resources/')) {
    return true;
  }
  if (entryName.endsWith('.tsbuildinfo')) {
    return true;
  }
  return false;
}

function collectMakeClientUpdateTemplateFiles(templateRoot: string): string[] {
  const files: string[] = [];
  const walk = (sourceDir: string, relativeDir = '') => {
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (shouldSkipMakeClientUpdateEntry(relativePath, entry.name)) {
        continue;
      }
      const sourcePath = path.join(sourceDir, entry.name);
      if (entry.isDirectory()) {
        walk(sourcePath, relativePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(normalizeRelativePath(relativePath));
      }
    }
  };
  walk(templateRoot);
  files.push('.axhub/make/client.json');
  return Array.from(new Set(files)).sort();
}

function createMakeClientUpdateBackupRoot(projectRoot: string): string {
  const stamp = new Date().toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\..*$/u, '')
    .replace('T', '-');
  return path.join(makeClientUpdateBackupsRoot(projectRoot), `client-update-${stamp}-${process.pid}`);
}

function backupExistingMakeClientUpdateFiles(projectRoot: string, backupRoot: string, plannedFiles: string[]): void {
  const originalRoot = path.join(backupRoot, 'original');
  fs.mkdirSync(originalRoot, { recursive: true });
  for (const relativePath of plannedFiles) {
    const sourcePath = path.resolve(projectRoot, ...relativePath.split('/'));
    if (!isInsideRoot(projectRoot, sourcePath) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }
    const backupPath = path.resolve(originalRoot, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(sourcePath, backupPath);
  }
}

function writeMakeClientUpdateManifest(
  backupRoot: string,
  manifest: Record<string, unknown>,
): string {
  fs.mkdirSync(backupRoot, { recursive: true });
  const manifestPath = path.join(backupRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

function buildMakeClientUpdateBackupZipEntries(sourceRoot: string, currentDir = sourceRoot, relativeDir = ''): Zippable {
  const entries: Zippable = {};
  if (!fs.existsSync(currentDir)) return entries;
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    const sourcePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(entries, buildMakeClientUpdateBackupZipEntries(sourceRoot, sourcePath, relativePath));
      continue;
    }
    if (entry.isFile()) {
      entries[relativePath.split(path.sep).join('/')] = new Uint8Array(fs.readFileSync(sourcePath));
    }
  }
  return entries;
}

function createMakeClientUpdateBackupZip(backupRoot: string): string {
  const zipPath = path.join(backupRoot, 'client-update-backup.zip');
  fs.rmSync(zipPath, { force: true });
  const entries: Zippable = {};
  const manifestPath = path.join(backupRoot, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    entries['manifest.json'] = new Uint8Array(fs.readFileSync(manifestPath));
  }
  Object.assign(entries, buildMakeClientUpdateBackupZipEntries(path.join(backupRoot, 'original'), path.join(backupRoot, 'original'), 'original'));
  fs.writeFileSync(zipPath, Buffer.from(zipSync(entries, { level: 6 })));
  return zipPath;
}

function makeClientUpdateBackupRecordFromManifest(backupRoot: string): MakeClientUpdateBackupRecord | null {
  const manifestPath = path.join(backupRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const currentVersion = typeof manifest.currentVersion === 'string' ? manifest.currentVersion : '';
    const targetVersion = typeof manifest.targetVersion === 'string' ? manifest.targetVersion : '';
    const createdAt = typeof manifest.createdAt === 'string' ? manifest.createdAt : '';
    const completedAt = typeof manifest.completedAt === 'string' ? manifest.completedAt : '';
    if (!currentVersion || !targetVersion || !createdAt || !completedAt) return null;
    const plannedFiles = Array.isArray(manifest.plannedFiles) ? manifest.plannedFiles : [];
    const writtenFiles = Array.isArray(manifest.writtenFiles) ? manifest.writtenFiles : [];
    const backupZipPath = typeof manifest.backupZipPath === 'string'
      ? manifest.backupZipPath
      : path.join(backupRoot, 'client-update-backup.zip');
    return {
      backupRoot,
      backupZipPath,
      manifestPath,
      currentVersion,
      targetVersion,
      createdAt,
      completedAt,
      plannedFilesCount: plannedFiles.length,
      writtenFilesCount: writtenFiles.length,
      restoreAvailable: fs.existsSync(path.join(backupRoot, 'original')),
      zipAvailable: fs.existsSync(backupZipPath),
    };
  } catch {
    return null;
  }
}

function readLatestMakeClientUpdateBackupRecord(projectRoot: string): MakeClientUpdateBackupRecord | null {
  const backupsRoot = makeClientUpdateBackupsRoot(projectRoot);
  if (!fs.existsSync(backupsRoot)) return null;
  const records = fs.readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('client-update-'))
    .map((entry) => makeClientUpdateBackupRecordFromManifest(path.join(backupsRoot, entry.name)))
    .filter((record): record is MakeClientUpdateBackupRecord => Boolean(record))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  return records[0] || null;
}

function writeMakeClientUpdateTemplateFiles(params: {
  projectRoot: string;
  templateRoot: string;
  plannedFiles: string[];
  marker: MakeClientMarker;
  source: MakeClientTemplateSource;
  targetVersion: string;
}): string[] {
  const preservedDocumentTemplatePaths = new Set<string>(DOCUMENT_TEMPLATES.map((template) => template.path));
  const writtenFiles: string[] = [];
  for (const relativePath of params.plannedFiles) {
    if (relativePath === '.axhub/make/client.json') {
      writeMakeClientMarker(params.projectRoot, {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: params.source.markerRepository,
        templateUrl: params.source.url,
        templateVersion: params.source.templateVersion || params.targetVersion,
        project: {
          id: params.marker.project.id,
          name: params.marker.project.name,
        },
      });
      writtenFiles.push(relativePath);
      continue;
    }

    const sourcePath = path.resolve(params.templateRoot, ...relativePath.split('/'));
    const targetPath = path.resolve(params.projectRoot, ...relativePath.split('/'));
    if (!isInsideRoot(params.templateRoot, sourcePath) || !isInsideRoot(params.projectRoot, targetPath)) {
      throw new MakeClientProjectError(
        'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
        `Unsafe Make client update path: ${relativePath}`,
        { status: 500, phase: 'overwrite' },
      );
    }
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }
    if (preservedDocumentTemplatePaths.has(relativePath) && fs.existsSync(targetPath)) {
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    writtenFiles.push(relativePath);
  }
  return writtenFiles;
}

function hasPnpmLockfile(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'));
}

function hasNpmLockfile(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, 'package-lock.json'))
    || fs.existsSync(path.join(projectRoot, 'npm-shrinkwrap.json'));
}

function readPackageManagerName(projectRoot: string): string {
  const packageManager = String(readJsonRecord(path.join(projectRoot, 'package.json')).packageManager || '').trim();
  const match = packageManager.match(/^([a-z][a-z0-9-]*)@/iu);
  return (match?.[1] || '').toLowerCase();
}

function preferredMakeClientInstallMethods(projectRoot: string): Array<'pnpm' | 'npm'> {
  const packageManagerName = readPackageManagerName(projectRoot);
  if (packageManagerName === 'pnpm' || hasPnpmLockfile(projectRoot) && !hasNpmLockfile(projectRoot)) {
    return ['pnpm', 'npm'];
  }
  return ['npm', 'pnpm'];
}

async function installMakeClientDependenciesWithMethod(
  runner: MakeClientCommandRunner,
  projectRoot: string,
  method: 'pnpm' | 'npm',
  registryRoute: MakeClientRegistryRoute,
): Promise<'pnpm' | 'npm'> {
  if (method === 'pnpm') {
    await runMakeClientInstallWithRegistryRoute({
      args: ['install', '--prod=false'],
      method,
      projectRoot,
      route: registryRoute,
      runner,
    });
    return 'pnpm';
  }
  await runMakeClientInstallWithRegistryRoute({
    args: ['install', '--include=dev'],
    method,
    projectRoot,
    route: registryRoute,
    runner,
  });
  return 'npm';
}

async function installMakeClientDependenciesForUpdate(
  runner: MakeClientCommandRunner,
  projectRoot: string,
): Promise<'pnpm' | 'npm'> {
  const errors: Partial<Record<'pnpm' | 'npm', string>> = {};
  const registryRoute = await resolveProjectRegistryRoute(runner, projectRoot);
  for (const method of preferredMakeClientInstallMethods(projectRoot)) {
    try {
      return await installMakeClientDependenciesWithMethod(runner, projectRoot, method, registryRoute);
    } catch (error) {
      errors[method] = commandErrorMessage(error);
    }
  }
  throw new MakeClientProjectError(
    'MAKE_CLIENT_INSTALL_FAILED',
    [
      errors.npm ? `${npmCommand()} install failed: ${errors.npm}` : '',
      errors.pnpm ? `pnpm install failed: ${errors.pnpm}` : '',
    ].filter(Boolean).join('\n') || 'Make client dependency install failed',
    {
      status: 500,
      phase: 'install',
      details: {
        ...(errors.npm ? { npm: errors.npm } : {}),
        ...(errors.pnpm ? { pnpm: errors.pnpm } : {}),
      },
    },
  );
}

async function syncMakeClientMetadataWithNpm(
  runner: MakeClientCommandRunner,
  projectRoot: string,
): Promise<void> {
  await runMakeClientCommand(runner, npmCommand(), ['run', 'metadata:sync'], projectRoot, 'metadata');
}

function makeClientUpdatePostUpdateWarning(error: unknown): MakeClientUpdatePostUpdateWarning {
  if (error instanceof MakeClientProjectError) {
    return {
      error: error.message,
      code: error.code,
      ...(error.phase ? { phase: error.phase } : {}),
      ...(error.details ? { details: error.details } : {}),
    };
  }
  const looseError = error as { message?: string; code?: string; phase?: MakeClientPhase; details?: Record<string, unknown> } | null;
  return {
    error: looseError?.message || commandErrorMessage(error) || 'Make client post-update task failed',
    code: looseError?.code || 'MAKE_CLIENT_POST_UPDATE_FAILED',
    ...(looseError?.phase ? { phase: looseError.phase } : {}),
    ...(looseError?.details ? { details: looseError.details } : {}),
  };
}

function hasWrittenMakeClientTargetVersion(projectRoot: string, targetVersion: string, writtenFiles: string[]): boolean {
  if (!writtenFiles.includes('.axhub/make/client.json')) {
    return false;
  }
  const marker = readMakeClientMarker(projectRoot);
  return marker?.templateVersion === targetVersion;
}

function finalizeMakeClientUpdateBackup(params: {
  backupRoot: string;
  projectId: string;
  projectRoot: string;
  currentVersion: string;
  targetVersion: string;
  backupPolicy: MakeClientUpdateBackupPolicy;
  plannedFiles: string[];
  writtenFiles: string[];
  templateUrl: string;
  installMethod: MakeClientDependencyInstallMethod;
  metadataSynced: boolean;
  createdAt: string;
  postUpdateWarning?: MakeClientUpdatePostUpdateWarning;
}): {
  backupZipPath: string;
  manifestPath: string;
  backupRecord: MakeClientUpdateBackupRecord;
} {
  const completedAt = new Date().toISOString();
  let backupZipPath = path.join(params.backupRoot, 'client-update-backup.zip');
  let manifestPath = writeMakeClientUpdateManifest(params.backupRoot, {
    projectId: params.projectId,
    projectRoot: params.projectRoot,
    currentVersion: params.currentVersion,
    targetVersion: params.targetVersion,
    backupPolicy: params.backupPolicy,
    plannedFiles: params.plannedFiles,
    writtenFiles: params.writtenFiles,
    templateUrl: params.templateUrl,
    installMethod: params.installMethod,
    metadataSynced: params.metadataSynced,
    backupZipPath,
    createdAt: params.createdAt,
    completedAt,
    ...(params.postUpdateWarning ? { postUpdateWarning: params.postUpdateWarning } : {}),
  });
  backupZipPath = createMakeClientUpdateBackupZip(params.backupRoot);
  manifestPath = writeMakeClientUpdateManifest(params.backupRoot, {
    projectId: params.projectId,
    projectRoot: params.projectRoot,
    currentVersion: params.currentVersion,
    targetVersion: params.targetVersion,
    backupPolicy: params.backupPolicy,
    plannedFiles: params.plannedFiles,
    writtenFiles: params.writtenFiles,
    templateUrl: params.templateUrl,
    installMethod: params.installMethod,
    metadataSynced: params.metadataSynced,
    backupZipPath,
    createdAt: params.createdAt,
    completedAt,
    ...(params.postUpdateWarning ? { postUpdateWarning: params.postUpdateWarning } : {}),
  });
  const backupRecord = makeClientUpdateBackupRecordFromManifest(params.backupRoot);
  if (!backupRecord) {
    throw new MakeClientProjectError(
      'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
      'Make client update backup manifest is incomplete',
      { status: 500, phase: 'backup' },
    );
  }
  return {
    backupZipPath,
    manifestPath,
    backupRecord,
  };
}

function attachMakeClientUpdateContext(
  error: unknown,
  context: Partial<Omit<MakeClientUpdateApplyResult, 'success' | 'metadataSynced' | 'installMethod'>> & {
    installMethod?: MakeClientDependencyInstallMethod;
    metadataSynced?: boolean;
  },
): never {
  if (error instanceof MakeClientProjectError) {
    Object.assign(error, { updateContext: context });
    throw error;
  }
  const wrapped = new MakeClientProjectError(
    'MAKE_CLIENT_TEMPLATE_UNAVAILABLE',
    error instanceof Error ? error.message : 'Make client update failed',
    { status: 500, phase: 'overwrite' },
  );
  Object.assign(wrapped, { updateContext: context });
  throw wrapped;
}

export async function applyMakeClientUpdate(
  projectId: string,
  projectRoot: string,
  options: { commandRunner?: MakeClientCommandRunner } = {},
): Promise<MakeClientUpdateApplyResult> {
  const root = path.resolve(projectRoot);
  const runner = options.commandRunner || defaultCommandRunner();
  const marker = validateExistingMakeClientProject(root);
  const status = await getMakeClientUpdateStatus(projectId, root, { commandRunner: runner });
  assertMakeClientUpdateCanApply(status);

  let extractedTemplate: Awaited<ReturnType<typeof extractMakeClientUpdateTemplate>> | null = null;
  let backupRoot = '';
  let backupZipPath = '';
  let manifestPath = '';
  let plannedFiles: string[] = [];
  let writtenFiles: string[] = [];
  let templateUrl = '';
  let installMethod: MakeClientDependencyInstallMethod = 'skipped';
  const updateContext = () => ({
    projectId,
    projectRoot: root,
    currentVersion: status.currentVersion,
    targetVersion: status.targetVersion,
    backupRoot,
    backupZipPath,
    manifestPath,
    plannedFiles,
    writtenFiles,
    templateUrl,
    installMethod,
    metadataSynced: false,
  });

  try {
    extractedTemplate = await extractMakeClientUpdateTemplate(status.targetVersion, status.template.sources);
    templateUrl = extractedTemplate.source.url;
    plannedFiles = collectMakeClientUpdateTemplateFiles(extractedTemplate.templateRoot);
    const packageRelativePath = 'package.json';
    const templatePackagePath = path.join(extractedTemplate.templateRoot, packageRelativePath);
    const projectPackagePath = path.join(root, packageRelativePath);
    const packageChanged = fs.existsSync(templatePackagePath)
      && fs.readFileSync(templatePackagePath, 'utf8') !== (fs.existsSync(projectPackagePath) ? fs.readFileSync(projectPackagePath, 'utf8') : '');

    backupRoot = createMakeClientUpdateBackupRoot(root);
    backupExistingMakeClientUpdateFiles(root, backupRoot, plannedFiles);
    const createdAt = new Date().toISOString();
    manifestPath = writeMakeClientUpdateManifest(backupRoot, {
      projectId,
      projectRoot: root,
      currentVersion: status.currentVersion,
      targetVersion: status.targetVersion,
      backupPolicy: status.backupPolicy,
      plannedFiles,
      templateUrl,
      createdAt,
    });

    writtenFiles = writeMakeClientUpdateTemplateFiles({
      projectRoot: root,
      templateRoot: extractedTemplate.templateRoot,
      plannedFiles,
      marker,
      source: extractedTemplate.source,
      targetVersion: status.targetVersion,
    });

    let metadataSynced = false;
    let postUpdateWarning: MakeClientUpdatePostUpdateWarning | undefined;
    try {
      if (packageChanged || !hasInstalledMakeClientDependencies(root)) {
        installMethod = await installMakeClientDependenciesForUpdate(runner, root);
      }
      await syncMakeClientMetadataWithNpm(runner, root);
      metadataSynced = true;
    } catch (postUpdateError) {
      if (!hasWrittenMakeClientTargetVersion(root, status.targetVersion, writtenFiles)) {
        throw postUpdateError;
      }
      postUpdateWarning = makeClientUpdatePostUpdateWarning(postUpdateError);
    }

    const finalizedBackup = finalizeMakeClientUpdateBackup({
      backupRoot,
      projectId,
      projectRoot: root,
      currentVersion: status.currentVersion,
      targetVersion: status.targetVersion,
      backupPolicy: status.backupPolicy,
      plannedFiles,
      writtenFiles,
      templateUrl,
      installMethod,
      metadataSynced,
      createdAt,
      ...(postUpdateWarning ? { postUpdateWarning } : {}),
    });
    backupZipPath = finalizedBackup.backupZipPath;
    manifestPath = finalizedBackup.manifestPath;

    return {
      success: true,
      projectId,
      projectRoot: root,
      currentVersion: status.currentVersion,
      targetVersion: status.targetVersion,
      backupRoot,
      backupZipPath,
      manifestPath,
      backupRecord: finalizedBackup.backupRecord,
      plannedFiles,
      writtenFiles,
      templateUrl,
      installMethod,
      metadataSynced,
      ...(postUpdateWarning ? { postUpdateWarning } : {}),
    };
  } catch (error) {
    attachMakeClientUpdateContext(error, updateContext());
  } finally {
    if (extractedTemplate) {
      fs.rmSync(extractedTemplate.tempParent, { recursive: true, force: true });
    }
  }
}

function isSameProjectRuntime(info: AxhubServerInfo | null, projectRoot: string): info is AxhubServerInfo {
  return isLiveLocalServerInfo(info, projectRoot);
}

function clearRuntimeServerInfo(projectRoot: string): void {
  fs.rmSync(getRuntimeServerInfoPath(projectRoot), { force: true });
}

function isLiveMakeClientRuntime(info: AxhubServerInfo | null, projectRoot: string): info is AxhubServerInfo {
  return isLiveLocalServerInfo(info, projectRoot, { maxAgeMs: MAKE_CLIENT_RUNTIME_HEARTBEAT_MAX_AGE_MS });
}

function isSameProjectHealthRuntime(info: AxhubServerInfo | null, projectRoot: string): info is AxhubServerInfo {
  return Boolean(info && resolveComparableProjectRoot(info.projectRoot) === resolveComparableProjectRoot(projectRoot));
}

function isWrongRuntimeHealth(health: unknown, projectRoot: string): boolean {
  if (!health || typeof health !== 'object') {
    return false;
  }
  const role = (health as { role?: unknown }).role;
  if (typeof role === 'string' && role !== 'runtime') {
    return true;
  }
  const runtime = normalizeHealthServerInfo(health);
  if (!runtime) {
    return false;
  }
  return resolveComparableProjectRoot(runtime.projectRoot) !== resolveComparableProjectRoot(projectRoot);
}

async function discoverMakeClientRuntime(projectRoot: string, options: { healthTimeoutMs?: number } = {}): Promise<AxhubServerInfo | null> {
  for (let port = DEFAULT_MAKE_CLIENT_DEV_PORT; port <= DEFAULT_MAKE_CLIENT_DEV_PORT + MAKE_CLIENT_RUNTIME_DISCOVERY_PORT_SPAN; port += 1) {
    const origin = `http://localhost:${port}`;
    const health = await fetchHealth(origin, options.healthTimeoutMs ?? MAKE_CLIENT_RUNTIME_DISCOVERY_HEALTH_TIMEOUT_MS);
    const runtime = normalizeHealthServerInfo(health);
    if (!isSameProjectHealthRuntime(runtime, projectRoot)) {
      continue;
    }
    return writeServerInfo(projectRoot, 'runtime', {
      ...runtime,
      origin: runtime.origin || origin,
      projectRoot,
      timestamp: new Date().toISOString(),
    });
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRuntimeInfo(
  projectRoot: string,
  timeoutMs: number,
  pollIntervalMs: number,
  options: { ignoredRuntime?: AxhubServerInfo | null; healthTimeoutMs?: number } = {},
): Promise<AxhubServerInfo | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const runtime = readServerInfo(projectRoot, 'runtime');
    const isIgnoredRuntime = Boolean(options.ignoredRuntime && runtime
      && runtime.pid === options.ignoredRuntime.pid
      && runtime.port === options.ignoredRuntime.port
      && runtime.origin === options.ignoredRuntime.origin
      && runtime.startedAt === options.ignoredRuntime.startedAt);
    if (isSameProjectRuntime(runtime, projectRoot) && !isIgnoredRuntime) {
      return runtime;
    }
    await sleep(pollIntervalMs);
  }
  return null;
}

function ensureAdminServerInfo(
  projectRoot: string,
  adminServerInfo?: AxhubServerInfo,
  options: { homeDir?: string } = {},
): void {
  if (!adminServerInfo) {
    return;
  }
  writeServerInfo(projectRoot, 'admin', {
    ...adminServerInfo,
    projectRoot,
  }, options);
}

function tryEnsureAdminServerInfo(
  projectRoot: string,
  adminServerInfo?: AxhubServerInfo,
  options: { homeDir?: string } = {},
): void {
  try {
    ensureAdminServerInfo(projectRoot, adminServerInfo, options);
  } catch (error: any) {
    if (!isMakeStateWritePermissionError(error)) {
      throw error;
    }
  }
}

function ensureMakeClientScripts(projectRoot: string): void {
  const packagePath = path.join(projectRoot, 'package.json');
  let pkg: any = null;
  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    throw new MakeClientProjectError(
      'NOT_MAKE_CLIENT_PROJECT',
      'Make client package.json is missing or invalid',
      { status: 400 },
    );
  }
  if (!pkg?.scripts?.dev || !pkg?.scripts?.['metadata:sync']) {
    throw new MakeClientProjectError(
      'NOT_MAKE_CLIENT_PROJECT',
      'Make client project must define dev and metadata:sync scripts',
      { status: 400 },
    );
  }
}

export function validateExistingMakeClientProject(projectRoot: string): MakeClientMarker {
  try {
    const marker = validateMakeClientProject(projectRoot);
    ensureMakeClientScripts(projectRoot);
    return marker;
  } catch (error: any) {
    if (error instanceof MakeClientProjectError) {
      throw error;
    }
    if (String(error?.message || '').includes('Invalid make client project id')) {
      throw new MakeClientProjectError('NOT_MAKE_CLIENT_PROJECT', error.message, { status: 400 });
    }
    throw new MakeClientProjectError('NOT_MAKE_CLIENT_PROJECT', error?.message || 'Not a Make client project', { status: 400 });
  }
}

export async function getMakeClientDevStatus(
  projectId: string,
  projectRoot: string,
  options: { healthTimeoutMs?: number } = {},
): Promise<MakeClientDevStatus> {
  const root = path.resolve(projectRoot);
  const marker = readMakeClientMarker(root);
  if (!marker) {
    return {
      projectId,
      makeClient: false,
      running: false,
      reason: 'not-make-client',
    };
  }

  const runtime = readServerInfo(root, 'runtime');
  if (!runtime) {
    const discoveredRuntime = await discoverMakeClientRuntime(root, options);
    if (discoveredRuntime) {
      return {
        projectId,
        makeClient: true,
        running: true,
        runtime: discoveredRuntime,
      };
    }
    return {
      projectId,
      makeClient: true,
      running: false,
      reason: 'not-running',
    };
  }
  if (isLiveMakeClientRuntime(runtime, root)) {
    return {
      projectId,
      makeClient: true,
      running: true,
      runtime,
    };
  }

  const discoveredRuntime = await discoverMakeClientRuntime(root, options);
  if (discoveredRuntime) {
    return {
      projectId,
      makeClient: true,
      running: true,
      runtime: discoveredRuntime,
    };
  }

  clearRuntimeServerInfo(root);
  return {
    projectId,
    makeClient: true,
    running: false,
    reason: 'stale-runtime',
  };
}

export async function stopMakeClientDevServer(
  projectId: string,
  projectRoot: string,
): Promise<MakeClientStopResult> {
  const root = path.resolve(projectRoot);
  const marker = readMakeClientMarker(root);
  if (!marker) {
    return {
      success: true,
      projectId,
      stopped: false,
      status: {
        projectId,
        makeClient: false,
        running: false,
        reason: 'not-make-client',
      },
    };
  }

  const runtime = readServerInfo(root, 'runtime');
  if (!runtime || !isSameProjectRuntime(runtime, root) || !isProcessAlive(runtime.pid)) {
    clearRuntimeServerInfo(root);
    return {
      success: true,
      projectId,
      stopped: false,
      status: {
        projectId,
        makeClient: true,
        running: false,
        reason: 'not-running',
      },
    };
  }

  const health = await fetchHealth(runtime.origin, MAKE_CLIENT_RUNTIME_DISCOVERY_HEALTH_TIMEOUT_MS);
  if (isWrongRuntimeHealth(health, root)) {
    clearRuntimeServerInfo(root);
    return {
      success: true,
      projectId,
      stopped: false,
      runtime,
      status: {
        projectId,
        makeClient: true,
        running: false,
        reason: 'stale-runtime',
      },
    };
  }

  try {
    process.kill(runtime.pid, 'SIGTERM');
  } catch (error: any) {
    if (String(error?.code || '') !== 'ESRCH') {
      throw error;
    }
  }
  clearRuntimeServerInfo(root);
  return {
    success: true,
    projectId,
    stopped: true,
    runtime,
    status: {
      projectId,
      makeClient: true,
      running: false,
      reason: 'not-running',
    },
  };
}

async function ensureMakeClientDevServerInternal(
  projectRoot: string,
  options: MakeClientOrchestrationOptions = {},
  installDependencies?: (runner: MakeClientCommandRunner, root: string) => Promise<MakeClientDependencyInstallMethod>,
): Promise<MakeClientDevInternalResult> {
  const root = path.resolve(projectRoot);
  const progressLogger = options.progressLogger || createMakeClientProgressLogger('dev', { projectRoot: root });
  const shouldFinishProgress = !options.progressLogger;
  try {
    validateExistingMakeClientProject(root);
    const runtimePatch = progressLogger.runSync('runtime-patch', '同步客户端运行时补丁', () => syncMakeClientRuntimePatchFiles(root));
    if (runtimePatch.patched) {
      clearRuntimeServerInfo(root);
    }
    tryEnsureAdminServerInfo(root, options.adminServerInfo, { homeDir: options.serverInfoHomeDir });

    const existingRuntime = readServerInfo(root, 'runtime');
    if (!runtimePatch.patched && isLiveMakeClientRuntime(existingRuntime, root)) {
      progressLogger.runSync('reuse-runtime', '复用已启动客户端', () => undefined);
      const result = {
        success: true as const,
        reused: true,
        phase: 'ready' as const,
        runtime: existingRuntime,
        installMethod: 'skipped' as const,
        ...(runtimePatch.patched ? { runtimePatched: true as const } : {}),
      };
      if (shouldFinishProgress) progressLogger.finish('success');
      return result;
    }

    const discoveredRuntime = runtimePatch.patched ? null : await discoverMakeClientRuntime(root, options);
    if (discoveredRuntime) {
      progressLogger.runSync('reuse-runtime', '复用已发现客户端', () => undefined);
      const result = {
        success: true as const,
        reused: true,
        phase: 'ready' as const,
        runtime: discoveredRuntime,
        installMethod: 'skipped' as const,
        ...(runtimePatch.patched ? { runtimePatched: true as const } : {}),
      };
      if (shouldFinishProgress) progressLogger.finish('success');
      return result;
    }

    const runner = options.commandRunner || defaultCommandRunner();
    const dependencyInstaller = installDependencies || ensureMakeClientDependencies;
    const installMethod = await progressLogger.run('install', '安装依赖', () => dependencyInstaller(runner, root));
    const devCommand = await progressLogger.run('resolve-dev', '解析启动命令', () => resolveMakeClientDevCommandForProject(runner, installMethod, root));
    const runtime = await progressLogger.run('dev', '启动客户端', async () => {
      let child: ReturnType<typeof spawn>;
      try {
        child = runner.spawn(devCommand.command, devCommand.args, {
          cwd: root,
          detached: true,
          env: {
            ...buildLocalCommandEnv(),
            [SKIP_AUTO_START_SERVER_ENV]: '1',
          },
          stdio: options.diagnosticLog ? ['ignore', 'pipe', 'pipe'] : 'ignore',
        });
        attachMakeClientDevDiagnostics(child, {
          command: devCommand.command,
          args: devCommand.args,
          projectRoot: root,
          diagnosticLog: options.diagnosticLog,
        });
      } catch (error) {
        throw makeClientDevSpawnError(error, devCommand.command, devCommand.args);
      }
      const spawnError = new Promise<never>((_resolve, reject) => {
        child.once?.('error', (error) => {
          reject(makeClientDevSpawnError(error, devCommand.command, devCommand.args));
        });
      });
      child.unref?.();
      const nextRuntime = await Promise.race([
        waitForRuntimeInfo(root, options.devTimeoutMs ?? DEFAULT_MAKE_CLIENT_DEV_TIMEOUT_MS, options.pollIntervalMs ?? DEFAULT_MAKE_CLIENT_DEV_POLL_INTERVAL_MS, {
          healthTimeoutMs: options.healthTimeoutMs,
          ignoredRuntime: existingRuntime,
        }),
        spawnError,
      ]);
      if (!nextRuntime) {
        throw new MakeClientProjectError(
          'MAKE_CLIENT_DEV_TIMEOUT',
          'Make client dev server did not become ready in time',
          { status: 504, phase: 'dev' },
        );
      }
      return nextRuntime;
    });
    const result = {
      success: true as const,
      reused: false,
      phase: 'ready' as const,
      runtime,
      installMethod,
      ...(runtimePatch.patched ? { runtimePatched: true as const } : {}),
    };
    if (shouldFinishProgress) progressLogger.finish('success');
    return result;
  } catch (error) {
    if (shouldFinishProgress) progressLogger.finish('failed', error);
    throw error;
  }
}

export async function ensureMakeClientDevServer(
  projectRoot: string,
  options: MakeClientOrchestrationOptions = {},
): Promise<MakeClientDevResult> {
  const result = await ensureMakeClientDevServerInternal(projectRoot, options);
  return {
    success: result.success,
    reused: result.reused,
    phase: result.phase,
    runtime: result.runtime,
  };
}

export async function copyMakeClientProject(
  params: {
    sourceProjectRoot: string;
    parentRoot: string;
    folderName: string;
    projectName?: string;
  },
  options: MakeClientOrchestrationOptions = {},
): Promise<{
  projectRoot: string;
  marker: MakeClientMarker;
  dev: MakeClientDevResult;
  progress: MakeClientProgressSnapshot;
  copiedDependencies: boolean;
  installMethod: MakeClientDependencyInstallMethod;
}> {
  const sourceRoot = path.resolve(params.sourceProjectRoot);
  const sourceMarker = validateExistingMakeClientProject(sourceRoot);
  const parentRoot = path.resolve(params.parentRoot);
  if (!fs.existsSync(parentRoot) || !fs.statSync(parentRoot).isDirectory()) {
    throw new MakeClientProjectError('INVALID_MAKE_PROJECT_FOLDER_NAME', 'Parent folder does not exist', { status: 400 });
  }
  const folderName = assertSafeMakeClientFolderName(params.folderName);
  const projectRoot = path.join(parentRoot, folderName);
  if (fs.existsSync(projectRoot)) {
    throw new MakeClientProjectError('MAKE_PROJECT_TARGET_NOT_EMPTY', 'Target folder already exists', { status: 409 });
  }
  if (isInsideRoot(sourceRoot, projectRoot)) {
    throw new MakeClientProjectError(
      'INVALID_MAKE_PROJECT_FOLDER_NAME',
      'Target folder must not be inside the source project',
      { status: 400 },
    );
  }

  const runner = options.commandRunner || defaultCommandRunner();
  const progressLogger = options.progressLogger || createMakeClientProgressLogger('create', {
    projectRoot,
    projectId: folderName,
  });
  const shouldFinishProgress = !options.progressLogger;
  const projectName = typeof params.projectName === 'string'
    ? params.projectName.trim()
    : sourceMarker.project.name;
  let marker: MakeClientMarker = sourceMarker;
  let copiedProjectFiles = false;
  let copiedDependencies = false;

  try {
    progressLogger.runSync('copy-project', '复制项目', () => {
      copyMakeClientProjectDirectory(sourceRoot, projectRoot);
      copiedProjectFiles = true;
    });
    marker = progressLogger.runSync('write-project', '写入项目', () => {
      const nextMarker = writeMakeClientMarker(projectRoot, {
        ...sourceMarker,
        project: {
          id: folderName,
          name: projectName,
        },
      });
      rewriteCopiedProjectMetadata({
        sourceRoot,
        targetRoot: projectRoot,
        projectId: folderName,
        projectName,
      });
      ensureMakeClientScripts(projectRoot);
      return nextMarker;
    });

    const installDependenciesForCopy = async (
      dependencyRunner: MakeClientCommandRunner,
      root: string,
    ): Promise<MakeClientDependencyInstallMethod> => {
      const targetNodeModules = path.join(root, 'node_modules');
      if (fs.existsSync(targetNodeModules)) {
        if (fs.existsSync(viteNodeEntrypoint(root))) {
          copiedDependencies = true;
          return 'skipped';
        }
        fs.rmSync(targetNodeModules, { recursive: true, force: true });
      }
      copiedDependencies = false;
      return ensureMakeClientDependencies(dependencyRunner, root);
    };

    const internalDev = await ensureMakeClientDevServerInternal(projectRoot, {
      ...options,
      commandRunner: runner,
      progressLogger,
    }, installDependenciesForCopy);
    const dev: MakeClientDevResult = {
      success: internalDev.success,
      reused: internalDev.reused,
      phase: internalDev.phase,
      runtime: internalDev.runtime,
    };
    if (shouldFinishProgress) progressLogger.finish('success');
    return {
      projectRoot,
      marker,
      dev,
      progress: progressLogger.snapshot(),
      copiedDependencies,
      installMethod: internalDev.installMethod,
    };
  } catch (error) {
    if (!copiedProjectFiles) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    if (shouldFinishProgress) progressLogger.finish('failed', error);
    if (error && typeof error === 'object') {
      Object.assign(error, { progress: progressLogger.snapshot() });
    }
    throw error;
  }
}

export async function cloneMakeClientProject(
  params: {
    parentRoot: string;
    folderName: string;
    projectName?: string;
    gitUrl: string;
  },
  options: MakeClientOrchestrationOptions = {},
): Promise<{
  projectRoot: string;
  marker: MakeClientMarker;
  dev: MakeClientDevResult;
  progress: MakeClientProgressSnapshot;
  prompt?: string;
}> {
  const parentRoot = path.resolve(params.parentRoot);
  if (!fs.existsSync(parentRoot) || !fs.statSync(parentRoot).isDirectory()) {
    throw new MakeClientProjectError('INVALID_MAKE_PROJECT_FOLDER_NAME', 'Parent folder does not exist', { status: 400 });
  }
  const folderName = assertSafeMakeClientFolderName(params.folderName);
  const gitUrl = String(params.gitUrl || '').trim();
  if (!gitUrl) {
    throw new MakeClientProjectError(
      'MAKE_CLIENT_GIT_CLONE_FAILED',
      'Missing Git URL',
      { status: 400, phase: 'clone' },
    );
  }
  const projectRoot = path.join(parentRoot, folderName);
  if (fs.existsSync(projectRoot)) {
    throw new MakeClientProjectError('MAKE_PROJECT_TARGET_NOT_EMPTY', 'Target folder already exists', { status: 409 });
  }

  const runner = options.commandRunner || defaultCommandRunner();
  const runCommand = runner.runCommand || runLocalCommand;
  const progressLogger = options.progressLogger || createMakeClientProgressLogger('create', {
    projectRoot,
    projectId: folderName,
  });
  const shouldFinishProgress = !options.progressLogger;
  let clonedProject = false;
  const clonePromptParams = {
    gitUrl,
    projectRoot,
    projectName: params.projectName || folderName,
  };

  try {
    await progressLogger.run('clone', '克隆项目', async () => {
      try {
        await runCommand('git', ['clone', gitUrl, projectRoot], {
          cwd: parentRoot,
          maxBuffer: 1024 * 1024 * 20,
          timeoutMs: DEFAULT_MAKE_CLIENT_GIT_CLONE_TIMEOUT_MS,
          env: nonInteractiveGitEnv(),
        });
        clonedProject = true;
      } catch (error) {
        const errorMessage = commandErrorMessage(error);
        throw new MakeClientProjectError(
          'MAKE_CLIENT_GIT_CLONE_FAILED',
          errorMessage || 'Git clone failed',
          {
            status: 409,
            phase: 'clone',
            details: {
              gitUrl: clonePromptParams.gitUrl,
              projectRoot: clonePromptParams.projectRoot,
              promptScene: 'git-clone',
              prompt: buildMakeClientGitClonePrompt({
                ...clonePromptParams,
                errorMessage,
              }),
            },
          },
        );
      }
    });

    const sourceMarker = progressLogger.runSync('write-project', '写入项目', () => {
      const marker = validateExistingMakeClientProject(projectRoot);
      const projectName = typeof params.projectName === 'string'
        ? params.projectName.trim()
        : marker.project.name;
      const nextMarker = writeMakeClientMarker(projectRoot, {
        ...marker,
        repository: gitUrl,
        project: {
          id: folderName,
          name: projectName,
        },
      });
      rewriteProjectMetadataIdentity(projectRoot, folderName, projectName);
      ensureMakeClientScripts(projectRoot);
      return nextMarker;
    });

    const dev = await ensureMakeClientDevServer(projectRoot, {
      ...options,
      commandRunner: runner,
      progressLogger,
    });
    if (shouldFinishProgress) progressLogger.finish('success');
    return {
      projectRoot,
      marker: sourceMarker,
      dev,
      progress: progressLogger.snapshot(),
    };
  } catch (error) {
    if (!clonedProject || error instanceof MakeClientProjectError && error.phase === 'clone') {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    if (shouldFinishProgress) progressLogger.finish('failed', error);
    const thrownError = clonedProject
      ? attachMakeClientGitClonePrompt(error, clonePromptParams)
      : error;
    if (error && typeof error === 'object') {
      Object.assign(error, { progress: progressLogger.snapshot() });
    }
    if (thrownError && typeof thrownError === 'object') {
      Object.assign(thrownError, { progress: progressLogger.snapshot() });
    }
    throw thrownError;
  }
}

export async function createBlankMakeClientProject(
  params: {
    parentRoot: string;
    folderName: string;
    projectName?: string;
  },
  options: MakeClientOrchestrationOptions = {},
): Promise<{ projectRoot: string; marker: MakeClientMarker; dev: MakeClientDevResult; progress: MakeClientProgressSnapshot }> {
  const parentRoot = path.resolve(params.parentRoot);
  if (!fs.existsSync(parentRoot) || !fs.statSync(parentRoot).isDirectory()) {
    throw new MakeClientProjectError('INVALID_MAKE_PROJECT_FOLDER_NAME', 'Parent folder does not exist', { status: 400 });
  }
  const folderName = assertSafeMakeClientFolderName(params.folderName);
  const projectRoot = path.join(parentRoot, folderName);
  if (fs.existsSync(projectRoot)) {
    throw new MakeClientProjectError('MAKE_PROJECT_TARGET_NOT_EMPTY', 'Target folder already exists', { status: 409 });
  }

  const runner = options.commandRunner || defaultCommandRunner();
  const progressLogger = options.progressLogger || createMakeClientProgressLogger('create', {
    projectRoot,
    projectId: folderName,
  });
  const shouldFinishProgress = !options.progressLogger;
  try {
    const templateSource = await progressLogger.run('download-template', '下载模板', () => fetchMakeClientTemplateFromRemote(runner, projectRoot));
    const marker = progressLogger.runSync('write-project', '写入项目', () => {
      const existingMarker = readMakeClientMarker(projectRoot);
      const nextMarker = writeMakeClientMarker(projectRoot, {
        schemaVersion: 1,
        kind: 'axhub-make-client',
        repository: templateSource.markerRepository,
        templateUrl: templateSource.templateUrl,
        ...(templateSource.templateVersion ? { templateVersion: templateSource.templateVersion } : {}),
        project: {
          id: folderName,
          name: typeof params.projectName === 'string'
            ? params.projectName.trim()
            : typeof existingMarker?.project.name === 'string'
              ? existingMarker.project.name.trim()
              : '',
        },
      });
      ensureMakeClientScripts(projectRoot);
      return nextMarker;
    });
    const dev = await ensureMakeClientDevServer(projectRoot, {
      ...options,
      commandRunner: runner,
      progressLogger,
    });
    if (shouldFinishProgress) progressLogger.finish('success');
    return { projectRoot, marker, dev, progress: progressLogger.snapshot() };
  } catch (error) {
    if (shouldFinishProgress) progressLogger.finish('failed', error);
    if (error && typeof error === 'object') {
      Object.assign(error, { progress: progressLogger.snapshot() });
    }
    throw error;
  }
}

export function makeClientErrorPayload(error: unknown, extra: Record<string, unknown> = {}) {
  if (error instanceof MakeClientProjectError) {
    const progress = (error as MakeClientProjectError & { progress?: unknown }).progress;
    return {
      error: error.message,
      code: error.code,
      ...(error.phase ? { phase: error.phase } : {}),
      ...(error.details ? { details: error.details } : {}),
      ...(progress ? { progress } : {}),
      ...extra,
    };
  }
  const looseError = error as { message?: string; code?: string; phase?: MakeClientPhase; details?: Record<string, unknown> } | null;
  if (looseError?.code) {
    return {
      error: looseError.message || 'Make client operation failed',
      code: looseError.code,
      ...(looseError.phase ? { phase: looseError.phase } : {}),
      ...(looseError.details ? { details: looseError.details } : {}),
      ...extra,
    };
  }
  return {
    error: error instanceof Error ? error.message : 'Make client operation failed',
    code: 'MAKE_CLIENT_OPERATION_FAILED',
    ...extra,
  };
}
