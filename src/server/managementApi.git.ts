import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

import { isPathInside, resolveProjectPath } from './projectCore/index.ts';
import { getConfigPath } from './projectCore/paths.ts';

import { readJsonBody, sendFile, sendJson } from './http.ts';
import { buildLocalCommandEnv, runLocalCommand } from './localCommand.ts';
import type { ManagementApiOptions } from './managementApi.ts';

interface GitProjectContext {
  project: {
    id: string;
    root: string;
  };
  metadata: {
    resources: {
      prototypes: any[];
      themes: any[];
    };
    resourceWriteTargets?: Record<string, { type?: string; path?: string } | undefined>;
  };
}

interface GitApiHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
  ) => GitProjectContext | null;
  findProjectResourceByPath: (metadata: GitProjectContext['metadata'], rawPath: string) => any | undefined;
  commandExecutor?: GitWorkspaceCommandExecutor;
}

export type GitWorkspaceCommandExecutor = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

type GitWorkspacePromptScene =
  | 'create-remote'
  | 'auth-failed'
  | 'merge-required'
  | 'conflict-required'
  | 'push-rejected';

type WorkspaceChangeGroupKey = 'prototypes' | 'resources' | 'themes' | 'skills' | 'rules' | 'other';

interface WorkspaceGitRemoteConfig {
  url?: string;
  defaultBranch?: string;
}

interface WorkspaceGitProjectConfig {
  versionCollaboration?: {
    remote?: WorkspaceGitRemoteConfig;
  };
}

interface WorkspaceChangeItem {
  id: string;
  name: string;
  fileCount: number;
}

interface WorkspaceChangeGroup {
  key: WorkspaceChangeGroupKey;
  label: string;
  fileCount: number;
  items: WorkspaceChangeItem[];
}

interface WorkspaceChangedFile {
  status: string;
  file: string;
}

interface WorkspaceVersionCommit {
  hash: string;
  shortHash: string;
  message: string;
  fullMessage?: string;
  author: string;
  email: string;
  timestamp: number;
  date: string;
}

const WORKSPACE_CHANGE_GROUP_ORDER: Array<{ key: WorkspaceChangeGroupKey; label: string }> = [
  { key: 'prototypes', label: '原型' },
  { key: 'resources', label: '资源' },
  { key: 'themes', label: '主题' },
  { key: 'skills', label: '技能' },
  { key: 'rules', label: '规范' },
  { key: 'other', label: '其他' },
];

const DEFAULT_REMOTE_NAME = 'origin';
const GIT_COMMIT_LIST_FORMAT = '%H%x1f%an%x1f%ae%x1f%at%x1f%B%x1e';

function resourceSourcePathForGit(resource: any): string {
  const candidate = String(resource?.absoluteFilePath || resource?.filePath || resource?.path || '').trim();
  if (!candidate) {
    return '';
  }
  return candidate;
}

function normalizeProjectRelativePath(projectRoot: string, rawPath: string): string {
  const resolvedPath = resolveProjectPath(projectRoot, rawPath);
  const relativePath = path.relative(projectRoot, resolvedPath).split(path.sep).join('/');
  if (!relativePath || relativePath.startsWith('../') || relativePath === '..') {
    throw new Error('Invalid path');
  }
  return relativePath;
}

function normalizeGitTargetPath(context: GitProjectContext, rawTargetPath: string, handlers: GitApiHandlers) {
  const projectRoot = context.project.root;
  const trimmedPath = String(rawTargetPath || '').trim();

  if (!trimmedPath) {
    throw new Error('Missing path parameter');
  }

  const resource = handlers.findProjectResourceByPath(context.metadata, trimmedPath);
  const resourceSourcePath = resourceSourcePathForGit(resource);
  if (resourceSourcePath) {
    const sourcePath = normalizeProjectRelativePath(projectRoot, resourceSourcePath);
    const targetPath = sourcePath.replace(/\/index\.(t|j)sx?$/iu, '').replace(/\/+$/u, '');
    const folderPath = path.resolve(projectRoot, targetPath);
    const gitScopePath = sourcePath === targetPath ? sourcePath : targetPath;
    const previewResourceName = String(resource?.name || resource?.id || targetPath).trim();
    return {
      targetPath,
      folderPath,
      gitScopePath,
      versionFileBasePath: gitScopePath,
      previewResourceName,
    };
  }

  let normalizedPath = trimmedPath.replace(/\\/g, '/');
  const sourceRoot = path.resolve(projectRoot, 'src');
  const normalizedProjectRoot = projectRoot.replace(/\\/g, '/').replace(/\/+$/u, '');
  const normalizedSourceRoot = sourceRoot.replace(/\\/g, '/').replace(/\/+$/u, '');

  if (normalizedPath.startsWith(normalizedSourceRoot + '/')) {
    normalizedPath = normalizedPath.slice(normalizedSourceRoot.length + 1);
  } else if (normalizedPath.startsWith(normalizedProjectRoot + '/src/')) {
    normalizedPath = normalizedPath.slice(normalizedProjectRoot.length + '/src/'.length);
  } else {
    const srcMarkerIndex = normalizedPath.lastIndexOf('/src/');
    if (srcMarkerIndex >= 0) {
      normalizedPath = normalizedPath.slice(srcMarkerIndex + '/src/'.length);
    } else if (normalizedPath.startsWith('src/')) {
      normalizedPath = normalizedPath.slice('src/'.length);
    }
  }

  normalizedPath = normalizedPath
    .replace(/^\/+/u, '')
    .replace(/\/index\.(t|j)sx?$/iu, '')
    .replace(/\/+$/u, '');

  const segments = normalizedPath.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid path');
  }

  const targetPath = segments.join('/');
  const folderPath = path.resolve(sourceRoot, targetPath);
  if (!isPathInside(sourceRoot, folderPath) || folderPath === sourceRoot) {
    throw new Error('Invalid path');
  }

  return {
    targetPath,
    folderPath,
    gitScopePath: `src/${targetPath}`,
    versionFileBasePath: targetPath,
    previewResourceName: targetPath.replace(/^prototypes\//u, ''),
  };
}

function resolveGitVersionFilePath(projectRoot: string, versionId: string, requestedParts: string[]) {
  const gitVersionsRoot = path.resolve(projectRoot, '.git-versions');
  const versionsDir = path.resolve(gitVersionsRoot, versionId);
  if (!isPathInside(gitVersionsRoot, versionsDir) || versionsDir === gitVersionsRoot) {
    return null;
  }

  const directPath = path.resolve(versionsDir, ...requestedParts);
  const legacySrcPath = path.resolve(versionsDir, 'src', ...requestedParts);
  const candidates = [directPath, legacySrcPath].filter((candidate) => isPathInside(versionsDir, candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || null;
}

function decodeGitVersionUrlPathParts(value: string): string[] {
  return value.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

function parseGitPorcelainStatus(stdout: string) {
  return stdout.split('\n').filter(Boolean).map((line) => {
    const match = line.match(/^(.{1,2})\s+(.+)$/u);
    if (match) {
      const file = match[2].split(' -> ').pop() || match[2];
      return {
        status: match[1].trim(),
        file,
      };
    }
    const file = line.slice(2).trim().split(' -> ').pop() || line.slice(2).trim();
    return {
      status: line.slice(0, 2).trim(),
      file,
    };
  });
}

function parseGitNameStatus(stdout: string): WorkspaceChangedFile[] {
  return stdout.split('\n').filter(Boolean).map((line) => {
    const parts = line.split('\t').filter(Boolean);
    const status = parts[0] || '';
    const file = parts.length > 2 ? parts[parts.length - 1] : parts[1] || '';
    return {
      status: status.trim(),
      file: file.trim(),
    };
  }).filter((item) => item.file);
}

function parseWorkspaceVersionCommit(stdout: string): WorkspaceVersionCommit | null {
  const line = stdout.split('\n').find(Boolean);
  if (!line) return null;
  const [hash = '', author = '', email = '', timestamp = '', ...messageParts] = line.split('|');
  const normalizedHash = hash.trim();
  if (!normalizedHash) return null;
  const ms = Number(timestamp) * 1000;
  return {
    hash: normalizedHash,
    shortHash: normalizedHash.slice(0, 7),
    author: author.trim(),
    email: email.trim(),
    timestamp: Number.isFinite(ms) ? ms : 0,
    date: Number.isFinite(ms) ? new Date(ms).toISOString() : '',
    message: messageParts.join('|').trim(),
  };
}

function parseWorkspaceVersionCommitList(stdout: string): WorkspaceVersionCommit[] {
  return stdout.split('\x1e').map((record) => {
    const trimmedRecord = record.trim();
    if (!trimmedRecord) return null;
    const [hash = '', author = '', email = '', timestamp = '', fullMessage = ''] = trimmedRecord.split('\x1f');
    const normalizedHash = hash.trim();
    if (!normalizedHash) return null;
    const ms = Number(timestamp) * 1000;
    const normalizedFullMessage = fullMessage.trim();
    const message = normalizedFullMessage.split('\n').find((line) => line.trim())?.trim() || normalizedHash.slice(0, 7);
    return {
      hash: normalizedHash,
      shortHash: normalizedHash.slice(0, 7),
      author: author.trim(),
      email: email.trim(),
      timestamp: Number.isFinite(ms) ? ms : 0,
      date: Number.isFinite(ms) ? new Date(ms).toISOString() : '',
      message,
      fullMessage: normalizedFullMessage || message,
    };
  }).filter(Boolean) as WorkspaceVersionCommit[];
}

function normalizeGitVersionRef(value: unknown): string {
  const ref = String(value || '').trim();
  return /^[0-9a-f]{7,40}$/iu.test(ref) ? ref : '';
}

function normalizeSlashPath(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function stripIndexEntryPath(value: string): string {
  return normalizeSlashPath(value).replace(/\/index\.(t|j)sx?$/iu, '').replace(/\/+$/, '');
}

function stripWorkspacePrefix(value: string): string {
  return stripIndexEntryPath(value)
    .replace(/^(?:client\/)?src\//u, '')
    .replace(/^client\//u, '');
}

function displayNameFromResource(resource: any, fallback: string): string {
  return String(resource?.title || resource?.displayName || resource?.name || resource?.id || fallback).trim() || fallback;
}

function getWorkspaceResourceSourceCandidates(resource: any): string[] {
  return [
    resource?.absoluteFilePath,
    resource?.filePath,
    resource?.sourcePath,
    resource?.path,
  ]
    .map(stripIndexEntryPath)
    .filter(Boolean);
}

function findResourceBySourcePath(resources: any[], filePath: string): any | null {
  const normalizedFile = stripIndexEntryPath(filePath);
  const normalizedFileWithoutPrefix = stripWorkspacePrefix(filePath);
  for (const resource of resources) {
    const candidates = getWorkspaceResourceSourceCandidates(resource);
    if (candidates.some((candidate) => (
      normalizedFile === candidate
      || normalizedFile.startsWith(`${candidate}/`)
      || normalizedFile.endsWith(`/${candidate}`)
      || normalizedFile.includes(`/${candidate}/`)
      || normalizedFileWithoutPrefix === stripWorkspacePrefix(candidate)
      || normalizedFileWithoutPrefix.startsWith(`${stripWorkspacePrefix(candidate)}/`)
    ))) {
      return resource;
    }
  }
  return null;
}

function getPathSegmentName(filePath: string, marker: string): string {
  const normalized = normalizeSlashPath(filePath);
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return path.basename(stripIndexEntryPath(normalized)) || normalized;
  }
  const rest = normalized.slice(markerIndex + marker.length).split('/').filter(Boolean);
  return rest[0] || path.basename(stripIndexEntryPath(normalized)) || normalized;
}

function getWorkspaceWriteTargetPath(metadata: GitProjectContext['metadata'], type: string): string {
  const target = metadata.resourceWriteTargets?.[type];
  if (!target || target.type !== 'project-relative-path') {
    return '';
  }
  return normalizeSlashPath(target.path || '');
}

function isPathInsideWorkspaceTarget(filePath: string, targetPath: string): boolean {
  if (!targetPath) return false;
  const normalizedFile = normalizeSlashPath(filePath);
  const normalizedTarget = normalizeSlashPath(targetPath);
  return normalizedFile === normalizedTarget
    || normalizedFile.startsWith(`${normalizedTarget}/`)
    || normalizedFile.endsWith(`/${normalizedTarget}`)
    || normalizedFile.includes(`/${normalizedTarget}/`);
}

function pathContainsWorkspaceMarker(filePath: string, marker: string): boolean {
  const normalizedFile = normalizeSlashPath(filePath);
  const normalizedMarker = normalizeSlashPath(marker);
  return normalizedFile === normalizedMarker
    || normalizedFile.startsWith(`${normalizedMarker}/`)
    || normalizedFile.includes(`/${normalizedMarker}/`);
}

function getWorkspaceMarkerForFile(filePath: string, markers: string[]): string {
  return markers.find((marker) => pathContainsWorkspaceMarker(filePath, marker)) || '';
}

function classifyWorkspaceChangedFile(metadata: GitProjectContext['metadata'], changedFile: WorkspaceChangedFile): {
  key: WorkspaceChangeGroupKey;
  id: string;
  name: string;
} {
  const filePath = normalizeSlashPath(changedFile.file);
  const prototypeTarget = getWorkspaceWriteTargetPath(metadata, 'prototypes');
  const themesTarget = getWorkspaceWriteTargetPath(metadata, 'themes');
  const prototype = findResourceBySourcePath(metadata.resources.prototypes || [], filePath);
  const prototypeMarker = getWorkspaceMarkerForFile(filePath, [prototypeTarget, 'src/prototypes', 'prototypes'].filter(Boolean));
  if (prototype || prototypeMarker) {
    const fallback = getPathSegmentName(filePath, prototypeTarget && isPathInsideWorkspaceTarget(filePath, prototypeTarget)
      ? `${prototypeTarget}/`
      : prototypeMarker ? `${prototypeMarker}/` : 'prototypes/');
    return {
      key: 'prototypes',
      id: `prototype:${String(prototype?.id || prototype?.name || fallback)}`,
      name: displayNameFromResource(prototype, fallback),
    };
  }

  const theme = findResourceBySourcePath(metadata.resources.themes || [], filePath);
  const themeMarker = getWorkspaceMarkerForFile(filePath, [themesTarget, 'src/themes', 'themes', 'design-systems'].filter(Boolean));
  if (theme || themeMarker) {
    const fallback = getPathSegmentName(filePath, themesTarget && isPathInsideWorkspaceTarget(filePath, themesTarget)
      ? `${themesTarget}/`
      : themeMarker ? `${themeMarker}/` : 'themes/');
    return {
      key: 'themes',
      id: `theme:${String(theme?.id || theme?.name || fallback)}`,
      name: displayNameFromResource(theme, fallback),
    };
  }

  const resourceMarker = getWorkspaceMarkerForFile(filePath, ['src/resources', 'resources']);
  if (resourceMarker) {
    const fallback = getPathSegmentName(
      filePath,
      `${resourceMarker}/`,
    );
    return {
      key: 'resources',
      id: `resource:${fallback}`,
      name: fallback,
    };
  }

  if (/^(?:apps\/skills\/)?skills\//u.test(filePath) || filePath.includes('/skills/')) {
    const normalized = filePath.replace(/^apps\/skills\/skills\//u, 'skills/');
    return {
      key: 'skills',
      id: `skill:${getPathSegmentName(normalized, 'skills/')}`,
      name: getPathSegmentName(normalized, 'skills/'),
    };
  }

  if (/^(?:\.?agents\/|rules\/|\.rules\/)/u.test(filePath) || /(?:^|\/)AGENTS\.md$/u.test(filePath) || /(?:^|\/)rules\//u.test(filePath)) {
    const name = filePath.includes('/rules/') || filePath.startsWith('rules/')
      ? getPathSegmentName(filePath, 'rules/')
      : path.basename(filePath);
    return {
      key: 'rules',
      id: `rule:${name}`,
      name,
    };
  }

  const fallback = path.basename(stripIndexEntryPath(filePath)) || filePath;
  return {
    key: 'other',
    id: `other:${filePath}`,
    name: fallback,
  };
}

function createWorkspaceChangeSummary(
  metadata: GitProjectContext['metadata'],
  changedFiles: WorkspaceChangedFile[],
): { totalFiles: number; groups: WorkspaceChangeGroup[] } {
  const groupMap = new Map<WorkspaceChangeGroupKey, Map<string, WorkspaceChangeItem>>();
  const fileCountMap = new Map<WorkspaceChangeGroupKey, number>();

  for (const changedFile of changedFiles) {
    const classified = classifyWorkspaceChangedFile(metadata, changedFile);
    fileCountMap.set(classified.key, (fileCountMap.get(classified.key) || 0) + 1);
    const items = groupMap.get(classified.key) || new Map<string, WorkspaceChangeItem>();
    const existing = items.get(classified.id);
    if (existing) {
      existing.fileCount += 1;
    } else {
      items.set(classified.id, {
        id: classified.id,
        name: classified.name,
        fileCount: 1,
      });
    }
    groupMap.set(classified.key, items);
  }

  return {
    totalFiles: changedFiles.length,
    groups: WORKSPACE_CHANGE_GROUP_ORDER
      .map(({ key, label }) => {
        const items = Array.from(groupMap.get(key)?.values() || []);
        return {
          key,
          label,
          fileCount: fileCountMap.get(key) || 0,
          items,
        };
      })
      .filter((group) => group.fileCount > 0),
  };
}

function filterWorkspaceChangedFilesByScope(
  changedFiles: WorkspaceChangedFile[],
  scopePath?: string,
): WorkspaceChangedFile[] {
  const normalizedScopePath = normalizeSlashPath(scopePath);
  if (!normalizedScopePath) {
    return changedFiles;
  }
  return changedFiles.filter((changedFile) => {
    const filePath = normalizeSlashPath(changedFile.file);
    return filePath === normalizedScopePath || filePath.startsWith(`${normalizedScopePath}/`);
  });
}

function readWorkspaceGitProjectConfig(projectRoot: string): WorkspaceGitProjectConfig {
  const configPath = getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeWorkspaceRemoteConfig(projectRoot: string, remote: WorkspaceGitRemoteConfig): WorkspaceGitProjectConfig {
  const configPath = getConfigPath(projectRoot);
  const current = readWorkspaceGitProjectConfig(projectRoot) as Record<string, any>;
  const next = {
    ...current,
    versionCollaboration: {
      ...(current.versionCollaboration && typeof current.versionCollaboration === 'object'
        ? current.versionCollaboration
        : {}),
      remote: {
        url: String(remote.url || '').trim(),
        ...(remote.defaultBranch ? { defaultBranch: remote.defaultBranch } : {}),
      },
    },
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function getConfiguredWorkspaceRemote(projectRoot: string): WorkspaceGitRemoteConfig {
  const config = readWorkspaceGitProjectConfig(projectRoot);
  const remote = config.versionCollaboration?.remote;
  if (!remote || typeof remote !== 'object') {
    return {};
  }
  return {
    url: typeof remote.url === 'string' ? remote.url.trim() : '',
    defaultBranch: typeof remote.defaultBranch === 'string' ? remote.defaultBranch.trim() : '',
  };
}

async function resolveWorkspaceRemote(
  projectRoot: string,
  executor?: GitWorkspaceCommandExecutor,
): Promise<WorkspaceGitRemoteConfig> {
  const configuredRemote = getConfiguredWorkspaceRemote(projectRoot);
  try {
    const detectedRemote = await execGit(['remote', 'get-url', DEFAULT_REMOTE_NAME], projectRoot, executor);
    const detectedUrl = detectedRemote.stdout.trim();
    if (detectedUrl) {
      return {
        ...configuredRemote,
        url: detectedUrl,
      };
    }
  } catch {
    // Keep supporting projects whose remote is only recorded in Make metadata.
  }
  return configuredRemote;
}

async function configureWorkspaceRemote(
  projectRoot: string,
  remote: WorkspaceGitRemoteConfig,
  executor?: GitWorkspaceCommandExecutor,
): Promise<WorkspaceGitRemoteConfig> {
  const remoteUrl = String(remote.url || '').trim();
  const defaultBranch = String(remote.defaultBranch || '').trim();
  const existingRemotes = await execGit(['remote'], projectRoot, executor).catch(() => ({ stdout: '', stderr: '' }));
  if (existingRemotes.stdout.split('\n').map((line) => line.trim()).includes(DEFAULT_REMOTE_NAME)) {
    await execGit(['remote', 'set-url', DEFAULT_REMOTE_NAME, remoteUrl], projectRoot, executor);
  } else {
    await execGit(['remote', 'add', DEFAULT_REMOTE_NAME, remoteUrl], projectRoot, executor);
  }
  writeWorkspaceRemoteConfig(projectRoot, { url: remoteUrl, defaultBranch });
  return {
    url: remoteUrl,
    ...(defaultBranch ? { defaultBranch } : {}),
  };
}

function encodePreviewPathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function appendSearchParams(pathname: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function normalizePreviewResourcePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/u, '')
    .replace(/\/+$/u, '');
}

function buildGitVersionPrototypeUrl(options: {
  versionId: string;
  previewResourceName: string;
  targetPath: string;
  previewGitPath: string;
  projectId: string;
}): string | null {
  const previewName = options.previewResourceName || options.targetPath;
  if (!previewName) return null;
  return appendSearchParams(`/prototypes/${encodePreviewPathSegments(previewName)}`, {
    projectId: options.projectId,
    gitVersion: options.versionId,
    gitPath: normalizePreviewResourcePath(options.previewGitPath),
  });
}

function getPrototypeIndexGitPathCandidates(...paths: string[]): string[] {
  const candidates = new Set<string>();
  for (const rawPath of paths) {
    const normalizedPath = normalizePreviewResourcePath(rawPath);
    if (!normalizedPath) continue;
    const folderPath = normalizedPath.replace(/\/index\.(t|j)sx?$/iu, '');
    candidates.add(`${folderPath}/index.tsx`);
    if (!folderPath.startsWith('src/')) {
      candidates.add(`src/${folderPath}/index.tsx`);
    }
  }
  return Array.from(candidates);
}

async function hasPrototypeAtCommit(
  projectRoot: string,
  commitHash: string,
  candidatePaths: string[],
  executor?: GitWorkspaceCommandExecutor,
): Promise<boolean> {
  for (const candidatePath of candidatePaths) {
    try {
      await execGit(['cat-file', '-e', `${commitHash}:${candidatePath}`], projectRoot, executor);
      return true;
    } catch {
      // Try the next likely prototype entry path.
    }
  }
  return false;
}

async function execGit(
  args: string[],
  cwd: string,
  executor?: GitWorkspaceCommandExecutor,
): Promise<{ stdout: string; stderr: string }> {
  try {
    if (executor) {
      return await executor('git', args, { cwd });
    }
    return await runLocalCommand('git', args, { cwd, maxBuffer: 1024 * 1024 * 10 });
  } catch (error: any) {
    throw new Error(
      decodeCommandOutput(error?.stderr || error?.message || 'Git command failed').trim(),
    );
  }
}

function decodeCommandOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return value == null ? '' : String(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return decodeCommandOutput(error).trim() || fallback;
}

function parseGitNullSeparatedOutput(output: Buffer): string[] {
  return output.toString('utf8').split('\0').filter(Boolean);
}

async function execGitBlob(
  args: string[],
  cwd: string,
  executor?: GitWorkspaceCommandExecutor,
): Promise<Buffer> {
  try {
    if (executor) {
      const result = await executor('git', args, { cwd });
      return Buffer.from(String(result.stdout || ''), 'utf8');
    }
    const result = await execa('git', args, {
      cwd,
      env: buildLocalCommandEnv(),
      encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 10,
      reject: true,
    });
    return Buffer.from(result.stdout as Uint8Array);
  } catch (error: any) {
    throw new Error(
      decodeCommandOutput(error?.stderr || error?.message || 'Git command failed').trim(),
    );
  }
}

async function execGitBinary(
  args: string[],
  cwd: string,
  executor?: GitWorkspaceCommandExecutor,
): Promise<Buffer> {
  try {
    if (executor) {
      const result = await executor('git', args, { cwd });
      return Buffer.from(decodeCommandOutput(result.stdout), 'utf8');
    }
    const result = await execa('git', args, {
      cwd,
      env: buildLocalCommandEnv(),
      encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 10,
      reject: true,
    });
    return Buffer.from(result.stdout as Uint8Array);
  } catch (error: any) {
    throw new Error(
      decodeCommandOutput(error?.stderr || error?.message || 'Git command failed').trim(),
    );
  }
}

async function execWorkspaceCommand(
  command: string,
  args: string[],
  cwd: string,
  executor?: GitWorkspaceCommandExecutor,
): Promise<{ stdout: string; stderr: string }> {
  try {
    if (executor) {
      return await executor(command, args, { cwd });
    }
    return await runLocalCommand(command, args, { cwd, maxBuffer: 1024 * 1024 * 10 });
  } catch (error: any) {
    throw new Error(
      decodeCommandOutput(error?.stderr || error?.message || `${command} command failed`).trim(),
    );
  }
}

async function probeGitAvailability(projectRoot: string, executor?: GitWorkspaceCommandExecutor) {
  try {
    await execGit(['--version'], projectRoot, executor);
  } catch (error: any) {
    return {
      available: false,
      gitAvailable: false,
      isGitRepo: false,
      hasCommits: false,
      code: 'git-unavailable',
      errorCode: 'git-not-available',
      message: error?.message || 'Git is not available',
    };
  }

  try {
    const { stdout } = await execGit(['rev-parse', '--is-inside-work-tree'], projectRoot, executor);
    if (stdout !== 'true') {
      return {
        available: false,
        gitAvailable: true,
        isGitRepo: false,
        hasCommits: false,
        code: 'git-unavailable',
        errorCode: 'git-repository-not-initialized',
        message: 'Current project is not a Git repository',
      };
    }
  } catch {
    return {
      available: false,
      gitAvailable: true,
      isGitRepo: false,
      hasCommits: false,
      code: 'git-unavailable',
      errorCode: 'git-repository-not-initialized',
      message: 'Current project is not a Git repository',
    };
  }

  try {
    await execGit(['rev-parse', '--verify', 'HEAD'], projectRoot, executor);
  } catch {
    return {
      available: false,
      gitAvailable: true,
      isGitRepo: true,
      hasCommits: false,
      code: 'git-unavailable',
      errorCode: 'git-history-not-ready',
      message: 'Current project has no Git commits',
    };
  }

  return {
    available: true,
    gitAvailable: true,
    isGitRepo: true,
    hasCommits: true,
  };
}

async function getWorkspaceCurrentBranch(projectRoot: string, executor?: GitWorkspaceCommandExecutor): Promise<string> {
  const branch = await execGit(['branch', '--show-current'], projectRoot, executor);
  return branch.stdout || 'main';
}

async function getWorkspaceChangedFiles(projectRoot: string, executor?: GitWorkspaceCommandExecutor): Promise<WorkspaceChangedFile[]> {
  const status = await execGit(['status', '--porcelain', '-uall'], projectRoot, executor);
  return parseGitPorcelainStatus(status.stdout);
}

async function getWorkspaceHeadFiles(
  projectRoot: string,
  executor?: GitWorkspaceCommandExecutor,
  ref = 'HEAD',
): Promise<WorkspaceChangedFile[]> {
  const headFiles = await execGit(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', ref], projectRoot, executor);
  return parseGitNameStatus(headFiles.stdout);
}

async function getWorkspaceVersionCommit(
  projectRoot: string,
  ref: string,
  executor?: GitWorkspaceCommandExecutor,
): Promise<WorkspaceVersionCommit | null> {
  try {
    const log = await execGit(['log', '-1', '--pretty=format:%H|%an|%ae|%at|%s', ref], projectRoot, executor);
    return parseWorkspaceVersionCommit(log.stdout);
  } catch {
    return null;
  }
}

async function getWorkspaceVersionChangedFiles(
  projectRoot: string,
  ref: string,
  executor?: GitWorkspaceCommandExecutor,
): Promise<WorkspaceChangedFile[]> {
  const changedFiles = await execGit(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', ref], projectRoot, executor);
  return parseGitNameStatus(changedFiles.stdout);
}

async function getWorkspaceVersionCommitList(
  projectRoot: string,
  range: string,
  executor?: GitWorkspaceCommandExecutor,
  scopePath?: string,
  maxCount?: number,
): Promise<WorkspaceVersionCommit[]> {
  try {
    const args = ['log', `--pretty=format:${GIT_COMMIT_LIST_FORMAT}`, range];
    if (maxCount && maxCount > 0) {
      args.splice(1, 0, `--max-count=${maxCount}`);
    }
    if (scopePath) {
      args.push('--', scopePath);
    }
    const log = await execGit(args, projectRoot, executor);
    return parseWorkspaceVersionCommitList(log.stdout);
  } catch {
    return [];
  }
}

function createUnavailableRemoteComparison(reason: string, branch = '') {
  return {
    available: false,
    ...(branch ? { branch, targetRef: `${DEFAULT_REMOTE_NAME}/${branch}` } : {}),
    reason,
    incoming: { totalFiles: 0, groups: [] },
    outgoing: { totalFiles: 0, groups: [] },
  };
}

async function getWorkspaceRemoteComparison(
  projectRoot: string,
  metadata: GitProjectContext['metadata'],
  remote: WorkspaceGitRemoteConfig,
  localRef: string,
  remoteBranch: string,
  executor?: GitWorkspaceCommandExecutor,
  scopePath?: string,
) {
  if (!remote.url) {
    return createUnavailableRemoteComparison('remote-not-configured');
  }
  if (!remoteBranch) {
    return createUnavailableRemoteComparison('remote-branch-missing');
  }

  const targetRef = `${DEFAULT_REMOTE_NAME}/${remoteBranch}`;
  try {
    await execGit(['rev-parse', '--verify', targetRef], projectRoot, executor);
  } catch {
    const outgoing = filterWorkspaceChangedFilesByScope(await getWorkspaceHeadFiles(projectRoot, executor, localRef), scopePath);
    const localHead = await getWorkspaceVersionCommit(projectRoot, localRef, executor);
    const outgoingCommits = await getWorkspaceVersionCommitList(projectRoot, localRef, executor, scopePath);
    return {
      available: true,
      branch: remoteBranch,
      targetRef,
      reason: 'remote-branch-missing',
      localHead,
      remoteHead: null,
      aheadCount: outgoingCommits.length,
      behindCount: 0,
      incomingCommits: [],
      outgoingCommits,
      incoming: { totalFiles: 0, groups: [] },
      outgoing: createWorkspaceChangeSummary(metadata, outgoing),
    };
  }

  try {
    const incomingRange = `${localRef}..${targetRef}`;
    const outgoingRange = `${targetRef}..${localRef}`;
    const incoming = await execGit(['diff', '--name-status', incomingRange], projectRoot, executor);
    const outgoing = await execGit(['diff', '--name-status', outgoingRange], projectRoot, executor);
    const incomingFiles = filterWorkspaceChangedFilesByScope(parseGitNameStatus(incoming.stdout), scopePath);
    const outgoingFiles = filterWorkspaceChangedFilesByScope(parseGitNameStatus(outgoing.stdout), scopePath);
    const [localHead, remoteHead, incomingCommits, outgoingCommits] = await Promise.all([
      getWorkspaceVersionCommit(projectRoot, localRef, executor),
      getWorkspaceVersionCommit(projectRoot, targetRef, executor),
      getWorkspaceVersionCommitList(projectRoot, incomingRange, executor, scopePath),
      getWorkspaceVersionCommitList(projectRoot, outgoingRange, executor, scopePath),
    ]);
    return {
      available: true,
      branch: remoteBranch,
      targetRef,
      localHead,
      remoteHead,
      aheadCount: outgoingCommits.length,
      behindCount: incomingCommits.length,
      incomingCommits,
      outgoingCommits,
      incoming: createWorkspaceChangeSummary(metadata, incomingFiles),
      outgoing: createWorkspaceChangeSummary(metadata, outgoingFiles),
    };
  } catch (error: any) {
    return createUnavailableRemoteComparison(error?.message || 'remote-comparison-unavailable', remoteBranch);
  }
}

async function getWorkspaceBranchOverview(projectRoot: string, executor?: GitWorkspaceCommandExecutor) {
  let localBranches: string[] = [];
  let remoteBranches: string[] = [];
  try {
    const local = await execGit(['branch', '--format=%(refname:short)'], projectRoot, executor);
    localBranches = local.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    localBranches = [];
  }
  try {
    const remote = await execGit(['branch', '-r', '--format=%(refname:short)'], projectRoot, executor);
    remoteBranches = remote.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    remoteBranches = [];
  }
  return { localBranches, remoteBranches };
}

function buildWorkspacePrompt(params: {
  scene: GitWorkspacePromptScene;
  projectRoot: string;
  currentBranch?: string;
  remote?: WorkspaceGitRemoteConfig;
  repositoryName?: string;
  branchOverview?: { localBranches: string[]; remoteBranches: string[] };
  reason?: string;
}): string {
  const remoteUrl = params.remote?.url || '(未配置)';
  const repositoryName = params.repositoryName || '';
  const branch = params.currentBranch || '(未检测)';
  const reason = params.reason || '需要人工判断';

  if (params.scene === 'create-remote') {
    return [
      '请帮我创建并连接 Axhub Make 项目的在线仓库。',
      '',
      `项目路径：${params.projectRoot}`,
      repositoryName ? `仓库名称：${repositoryName}` : `目标仓库地址：${remoteUrl}`,
      `当前分支：${branch}`,
      '',
      '请根据仓库地址判断平台；如果只有仓库名称，请结合本机登录状态判断平台。如果需要登录、创建仓库、配置 SSH 或凭据，请先给出步骤。',
      '完成后把在线仓库设置为 origin，并推送当前分支。',
    ].join('\n');
  }

  return [
    '请帮我处理 Axhub Make 项目的版本同步问题。',
    '',
    `项目路径：${params.projectRoot}`,
    `当前分支：${branch}`,
    `在线仓库：${remoteUrl}`,
    `阻塞原因：${reason}`,
    '',
    '请先检查 git status、git remote -v、git branch -vv、git fetch 的结果。',
    '不要自动合并，不要强制覆盖。若需要合并或解决冲突，请先解释风险并等待我确认。',
  ].join('\n');
}

function isLikelyGitHubUrl(url: string): boolean {
  return /(?:^https?:\/\/github\.com\/|^git@github\.com:)/iu.test(url);
}

function isLikelyGitLabUrl(url: string): boolean {
  return /(?:gitlab\.com|gitlab)/iu.test(url);
}

function parseRepositoryPathFromGitUrl(url: string): { owner: string; repo: string; host: string } | null {
  const value = String(url || '').trim().replace(/\/+$/u, '');
  if (!value) return null;
  const ssh = value.match(/^git@([^:]+):(.+)$/u);
  if (ssh) {
    const [owner, repo] = ssh[2].replace(/\.git$/u, '').split('/').filter(Boolean).slice(-2);
    return owner && repo ? { host: ssh[1], owner, repo } : null;
  }
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.replace(/^\/+|\/+$/gu, '').replace(/\.git$/u, '').split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return {
      host: parsed.hostname,
      owner: segments[segments.length - 2],
      repo: segments[segments.length - 1],
    };
  } catch {
    return null;
  }
}

function normalizeRepositoryName(value: string): string {
  return String(value || '').trim().replace(/\.git$/u, '').replace(/^\/+|\/+$/gu, '');
}

async function tryCreateRemoteRepository(params: {
  projectRoot: string;
  url?: string;
  repositoryName?: string;
  visibility: 'private' | 'public';
  executor?: GitWorkspaceCommandExecutor;
}): Promise<{ created: boolean; mode: string; message: string }> {
  const repositoryName = normalizeRepositoryName(params.repositoryName || '');
  const parsed = params.url ? parseRepositoryPathFromGitUrl(params.url) : null;

  if (params.url && isLikelyGitHubUrl(params.url) && parsed) {
    const visibilityFlag = params.visibility === 'public' ? '--public' : '--private';
    await execWorkspaceCommand(
      'gh',
      ['repo', 'create', `${parsed.owner}/${parsed.repo}`, visibilityFlag, '--source=.', '--remote=origin', '--confirm'],
      params.projectRoot,
      params.executor,
    );
    return { created: true, mode: 'gh', message: '已通过 GitHub CLI 创建在线仓库' };
  }

  if (params.url && isLikelyGitLabUrl(params.url) && parsed) {
    const visibilityFlag = params.visibility === 'public' ? '--public' : '--private';
    await execWorkspaceCommand(
      'glab',
      ['repo', 'create', `${parsed.owner}/${parsed.repo}`, visibilityFlag, '--remoteName', DEFAULT_REMOTE_NAME, '--yes'],
      params.projectRoot,
      params.executor,
    );
    return { created: true, mode: 'glab', message: '已通过 GitLab CLI 创建在线仓库' };
  }

  if (repositoryName) {
    const visibilityFlag = params.visibility === 'public' ? '--public' : '--private';
    try {
      await execWorkspaceCommand(
        'gh',
        ['repo', 'create', repositoryName, visibilityFlag, '--source=.', '--remote=origin', '--confirm'],
        params.projectRoot,
        params.executor,
      );
      return { created: true, mode: 'gh', message: '已通过 GitHub CLI 创建在线仓库' };
    } catch (githubError: any) {
      try {
        await execWorkspaceCommand(
          'glab',
          ['repo', 'create', repositoryName, visibilityFlag, '--remoteName', DEFAULT_REMOTE_NAME, '--yes'],
          params.projectRoot,
          params.executor,
        );
        return { created: true, mode: 'glab', message: '已通过 GitLab CLI 创建在线仓库' };
      } catch (gitlabError: any) {
        throw new Error(gitlabError?.message || githubError?.message || '无法自动创建在线仓库');
      }
    }
  }

  if (!params.url || !parsed) {
    throw new Error('无法识别仓库地址');
  }

  throw new Error('当前 Git 服务暂不支持自动创建');
}

export function handleGitApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  url: URL,
  handlers: GitApiHandlers,
): boolean {
  if (!pathname.startsWith('/api/git')) {
    return false;
  }

  const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
  if (!context) {
    return true;
  }

  const executor = handlers.commandExecutor || (options as any).gitWorkspaceCommandExecutor;

  const sendPathError = (rawPath: string) => {
    sendJson(res, {
      error: 'Resolved path is outside project root',
      code: 'PATH_OUTSIDE_PROJECT',
      projectId: context.project.id,
      path: rawPath,
    }, { status: 403 });
  };

  const getScopedGitTargetPath = (rawPath: unknown): string => {
    const requestedPath = String(rawPath || '').trim();
    if (!requestedPath) return '';
    return normalizeGitTargetPath(context, requestedPath, handlers).gitScopePath;
  };

  if (pathname.startsWith('/api/git/workspace/')) {
    (async () => {
      const projectRoot = context.project.root;
      const method = req.method;
      const body = method === 'GET' ? {} : await readJsonBody(req);

      if (pathname === '/api/git/workspace/status' && method === 'GET') {
        const requestedVersionRef = normalizeGitVersionRef(url.searchParams.get('gitVersion'));
        let scopedGitPath = '';
        try {
          scopedGitPath = getScopedGitTargetPath(url.searchParams.get('path'));
        } catch {
          sendPathError(String(url.searchParams.get('path') || ''));
          return;
        }
        const availability = await probeGitAvailability(projectRoot, executor);
        if (!availability.available) {
          sendJson(res, {
            ...availability,
            projectId: context.project.id,
            projectRoot,
            remote: getConfiguredWorkspaceRemote(projectRoot),
            isHistoricalVersion: Boolean(requestedVersionRef),
            hasChanges: false,
            changeSummary: { totalFiles: 0, groups: [] },
          });
          return;
        }
        const currentBranch = await getWorkspaceCurrentBranch(projectRoot, executor);
        const branchOverview = await getWorkspaceBranchOverview(projectRoot, executor);
        const requestedBranch = requestedVersionRef
          ? ''
          : String(url.searchParams.get('branch') || '').trim();
        const viewedBranch = requestedBranch || currentBranch;
        if (requestedBranch && !branchOverview.localBranches.includes(viewedBranch)) {
          sendJson(res, {
            error: 'Branch does not exist',
            code: 'BRANCH_NOT_FOUND',
            projectId: context.project.id,
            branchOverview,
          }, { status: 404 });
          return;
        }
        const versionRef = requestedVersionRef || 'HEAD';
        const currentCommit = await getWorkspaceVersionCommit(projectRoot, versionRef, executor);
        if (requestedVersionRef && !currentCommit) {
          sendJson(res, { error: 'Version not found', code: 'VERSION_NOT_FOUND', projectId: context.project.id }, { status: 404 });
          return;
        }
        const recentCommits = requestedVersionRef || scopedGitPath
          ? []
          : await getWorkspaceVersionCommitList(projectRoot, 'HEAD', executor, undefined, 20);
        const changedFiles = requestedVersionRef
          ? await getWorkspaceVersionChangedFiles(projectRoot, requestedVersionRef, executor)
          : await getWorkspaceChangedFiles(projectRoot, executor);
        const scopedChangedFiles = filterWorkspaceChangedFilesByScope(changedFiles, scopedGitPath);
        const remote = await resolveWorkspaceRemote(projectRoot, executor);
        const remoteBranchNames = branchOverview.remoteBranches
          .map((branch) => branch.replace(/^remotes\//u, ''))
          .filter((branch) => branch.startsWith(`${DEFAULT_REMOTE_NAME}/`))
          .map((branch) => branch.slice(`${DEFAULT_REMOTE_NAME}/`.length))
          .filter((branch) => branch && branch !== 'HEAD');
        const requestedRemoteBranch = String(requestedVersionRef ? '' : url.searchParams.get('remoteBranch') || '')
          .trim()
          .replace(/^remotes\//u, '')
          .replace(/^origin\//u, '');
        const viewedRemoteBranch = requestedRemoteBranch
          || (remoteBranchNames.includes(viewedBranch) ? viewedBranch : '');
        const operationRemoteBranch = remote.defaultBranch || currentBranch;
        const remoteComparison = await getWorkspaceRemoteComparison(
          projectRoot,
          context.metadata,
          remote,
          'HEAD',
          operationRemoteBranch,
          executor,
          scopedGitPath,
        );
        let branchView;
        if (!requestedVersionRef) {
          const hasExplicitLocalView = Boolean(requestedBranch || viewedBranch !== currentBranch);
          const hasExplicitRemoteView = Boolean(
            hasExplicitLocalView
            || requestedRemoteBranch
            || viewedRemoteBranch !== operationRemoteBranch,
          );
          const remoteBranchExists = Boolean(
            viewedRemoteBranch && remoteBranchNames.includes(viewedRemoteBranch),
          );
          const viewedRemoteComparison = !remote.url
            ? createUnavailableRemoteComparison('remote-not-configured')
            : !viewedRemoteBranch || !remoteBranchExists
              ? createUnavailableRemoteComparison('remote-branch-missing', viewedRemoteBranch)
              : hasExplicitRemoteView
                ? await getWorkspaceRemoteComparison(
                    projectRoot,
                    context.metadata,
                    remote,
                    viewedBranch,
                    viewedRemoteBranch,
                    executor,
                    scopedGitPath,
                  )
                : remoteComparison;
          branchView = {
            branch: viewedBranch,
            ...(viewedRemoteBranch ? { remoteBranch: viewedRemoteBranch } : {}),
            commit: hasExplicitLocalView
              ? await getWorkspaceVersionCommit(projectRoot, viewedBranch, executor)
              : currentCommit,
            recentCommits: hasExplicitLocalView
              ? await getWorkspaceVersionCommitList(projectRoot, viewedBranch, executor, scopedGitPath, 20)
              : recentCommits,
            remoteComparison: viewedRemoteComparison,
          };
        }
        sendJson(res, {
          ...availability,
          projectId: context.project.id,
          projectRoot,
          currentBranch,
          currentCommit,
          recentCommits,
          isHistoricalVersion: Boolean(requestedVersionRef),
          hasChanges: scopedChangedFiles.length > 0,
          changedFilesCount: scopedChangedFiles.length,
          changeSummary: createWorkspaceChangeSummary(context.metadata, scopedChangedFiles),
          remote,
          branchOverview,
          remoteComparison,
          ...(branchView ? { branchView } : {}),
        });
        return;
      }

      if (pathname === '/api/git/workspace/init' && method === 'POST') {
        try {
          await execGit(['--version'], projectRoot, executor);
        } catch (error: any) {
          sendJson(res, {
            available: false,
            gitAvailable: false,
            isGitRepo: false,
            hasCommits: false,
            code: 'git-unavailable',
            errorCode: 'git-not-available',
            message: error?.message || 'Git is not available',
            projectId: context.project.id,
            projectRoot,
          }, { status: 409 });
          return;
        }
        try {
          await execGit(['rev-parse', '--is-inside-work-tree'], projectRoot, executor);
        } catch {
          await execGit(['init'], projectRoot, executor);
        }
        try {
          await execGit(['config', 'user.email'], projectRoot, executor);
        } catch {
          await execGit(['config', 'user.email', 'axhub-make@example.local'], projectRoot, executor);
        }
        try {
          await execGit(['config', 'user.name'], projectRoot, executor);
        } catch {
          await execGit(['config', 'user.name', 'Axhub Make'], projectRoot, executor);
        }
        let hasHead = true;
        try {
          await execGit(['rev-parse', '--verify', 'HEAD'], projectRoot, executor);
        } catch {
          hasHead = false;
        }
        const changedFiles = await getWorkspaceChangedFiles(projectRoot, executor).catch(() => []);
        if (!hasHead || changedFiles.length > 0) {
          await execGit(['add', '.'], projectRoot, executor);
          await execGit(['commit', '-m', hasHead ? '保存当前版本' : '初始化项目版本'], projectRoot, executor);
        }
        sendJson(res, {
          success: true,
          initialized: true,
          projectId: context.project.id,
          currentBranch: await getWorkspaceCurrentBranch(projectRoot, executor).catch(() => 'main'),
        });
        return;
      }

      const availability = await probeGitAvailability(projectRoot, executor);
      if (!availability.available) {
        sendJson(res, { ...availability, projectId: context.project.id, projectRoot }, { status: 409 });
        return;
      }

      const currentBranch = await getWorkspaceCurrentBranch(projectRoot, executor);
      const remote = await resolveWorkspaceRemote(projectRoot, executor);
      const branchOverview = await getWorkspaceBranchOverview(projectRoot, executor);

      if (pathname === '/api/git/workspace/commit' && method === 'POST') {
        const message = String((body as any)?.message || '').trim();
        let scopedGitPath = '';
        try {
          scopedGitPath = getScopedGitTargetPath((body as any)?.path);
        } catch {
          sendPathError(String((body as any)?.path || ''));
          return;
        }
        if (!message) {
          sendJson(res, { error: 'Missing message parameter' }, { status: 400 });
          return;
        }
        const changedFiles = filterWorkspaceChangedFilesByScope(await getWorkspaceChangedFiles(projectRoot, executor), scopedGitPath);
        if (changedFiles.length === 0) {
          sendJson(res, { error: 'No changes to commit' }, { status: 400 });
          return;
        }
        const addArgs = scopedGitPath ? ['add', '-A', '--', scopedGitPath] : ['add', '.'];
        await execGit(addArgs, projectRoot, executor);
        const commit = await execGit(['commit', '-m', message], projectRoot, executor);
        sendJson(res, { success: true, message: 'Changes committed successfully', output: commit.stdout, projectId: context.project.id });
        return;
      }

      if (pathname === '/api/git/workspace/remote' && method === 'POST') {
        const remoteUrl = String((body as any)?.url || '').trim();
        const defaultBranch = String((body as any)?.defaultBranch || '').trim();
        if (!remoteUrl) {
          sendJson(res, { error: 'Missing url parameter' }, { status: 400 });
          return;
        }
        const configuredRemote = await configureWorkspaceRemote(
          projectRoot,
          { url: remoteUrl, defaultBranch },
          executor,
        );
        sendJson(res, {
          success: true,
          projectId: context.project.id,
          remote: configuredRemote,
        });
        return;
      }

      if (pathname === '/api/git/workspace/fetch' && method === 'POST') {
        try {
          await execGit(['fetch', DEFAULT_REMOTE_NAME, '--prune'], projectRoot, executor);
        } catch (error: any) {
          const prompt = buildWorkspacePrompt({
            scene: 'auth-failed',
            projectRoot,
            currentBranch,
            remote,
            branchOverview,
            reason: error?.message || '无法连接在线仓库',
          });
          sendJson(res, {
            error: error?.message || 'Fetch failed',
            code: 'REMOTE_FETCH_FAILED',
            promptScene: 'auth-failed',
            prompt,
            projectId: context.project.id,
          }, { status: 409 });
          return;
        }
        sendJson(res, {
          success: true,
          projectId: context.project.id,
          branchOverview: await getWorkspaceBranchOverview(projectRoot, executor),
        });
        return;
      }

      if (pathname === '/api/git/workspace/sync-down' && method === 'POST') {
        const changedFiles = await getWorkspaceChangedFiles(projectRoot, executor);
        if (changedFiles.length > 0) {
          const prompt = buildWorkspacePrompt({
            scene: 'merge-required',
            projectRoot,
            currentBranch,
            remote,
            branchOverview,
            reason: '本地还有未提交的变更',
          });
          sendJson(res, {
            error: 'Local changes must be committed before sync',
            code: 'DIRTY_WORKTREE',
            promptScene: 'merge-required',
            prompt,
            projectId: context.project.id,
          }, { status: 409 });
          return;
        }
        try {
          await execGit(['fetch', DEFAULT_REMOTE_NAME, '--prune'], projectRoot, executor);
        } catch (error: any) {
          const prompt = buildWorkspacePrompt({
            scene: 'auth-failed',
            projectRoot,
            currentBranch,
            remote,
            branchOverview,
            reason: error?.message || '无法连接在线仓库',
          });
          sendJson(res, {
            error: error?.message || 'Fetch failed',
            code: 'REMOTE_FETCH_FAILED',
            promptScene: 'auth-failed',
            prompt,
            projectId: context.project.id,
          }, { status: 409 });
          return;
        }
        const remoteBranch = remote.defaultBranch || currentBranch;
        const targetRef = `${DEFAULT_REMOTE_NAME}/${remoteBranch}`;
        try {
          await execGit(['merge', '--ff-only', targetRef], projectRoot, executor);
        } catch (error: any) {
          const prompt = buildWorkspacePrompt({
            scene: 'merge-required',
            projectRoot,
            currentBranch,
            remote,
            branchOverview,
            reason: error?.message || '在线版本无法直接快进同步',
          });
          sendJson(res, {
            error: error?.message || 'Fast-forward sync failed',
            code: 'FAST_FORWARD_REQUIRED',
            promptScene: 'merge-required',
            prompt,
            projectId: context.project.id,
          }, { status: 409 });
          return;
        }
        sendJson(res, { success: true, projectId: context.project.id, currentBranch });
        return;
      }

      if (pathname === '/api/git/workspace/push' && method === 'POST') {
        try {
          await execGit(['push', '-u', DEFAULT_REMOTE_NAME, currentBranch], projectRoot, executor);
          sendJson(res, { success: true, projectId: context.project.id, currentBranch });
        } catch (error: any) {
          const prompt = buildWorkspacePrompt({
            scene: 'push-rejected',
            projectRoot,
            currentBranch,
            remote,
            branchOverview,
            reason: error?.message || '在线同步被拒绝',
          });
          sendJson(res, {
            error: error?.message || 'Push failed',
            code: 'PUSH_REJECTED',
            promptScene: 'push-rejected',
            prompt,
            projectId: context.project.id,
          }, { status: 409 });
        }
        return;
      }

      if (pathname === '/api/git/workspace/create-remote-repository' && method === 'POST') {
        const remoteUrl = String((body as any)?.url || '').trim();
        const repositoryName = normalizeRepositoryName(String((body as any)?.repositoryName || ''));
        const visibility = (body as any)?.visibility === 'public' ? 'public' : 'private';
        if (!remoteUrl && !repositoryName) {
          sendJson(res, { error: 'Missing url or repositoryName parameter' }, { status: 400 });
          return;
        }
        try {
          const created = await tryCreateRemoteRepository({
            projectRoot,
            url: remoteUrl || undefined,
            repositoryName,
            visibility,
            executor,
          });
          let createdRemote = await resolveWorkspaceRemote(projectRoot, executor);
          if (!createdRemote.url && remoteUrl) {
            createdRemote = await configureWorkspaceRemote(projectRoot, { url: remoteUrl }, executor);
          } else if (createdRemote.url) {
            writeWorkspaceRemoteConfig(projectRoot, createdRemote);
          }
          sendJson(res, {
            success: true,
            projectId: context.project.id,
            ...(createdRemote.url ? { remote: createdRemote } : {}),
            ...created,
          });
        } catch (error: any) {
          const prompt = buildWorkspacePrompt({
            scene: 'create-remote',
            projectRoot,
            currentBranch,
            remote: remoteUrl ? { url: remoteUrl } : undefined,
            repositoryName,
            branchOverview,
            reason: error?.message || '无法自动创建在线仓库',
          });
          sendJson(res, {
            error: error?.message || 'Create remote repository failed',
            code: 'CREATE_REMOTE_PROMPT_REQUIRED',
            promptScene: 'create-remote',
            prompt,
            projectId: context.project.id,
          }, { status: 409 });
        }
        return;
      }

      if (pathname === '/api/git/workspace/prompt' && method === 'POST') {
        const scene = String((body as any)?.scene || 'merge-required') as GitWorkspacePromptScene;
        const allowedScenes: GitWorkspacePromptScene[] = [
          'create-remote',
          'auth-failed',
          'merge-required',
          'conflict-required',
          'push-rejected',
        ];
        const promptScene = allowedScenes.includes(scene) ? scene : 'merge-required';
        sendJson(res, {
          success: true,
          scene: promptScene,
          prompt: buildWorkspacePrompt({
            scene: promptScene,
            projectRoot,
            currentBranch,
            remote,
            branchOverview,
            reason: String((body as any)?.reason || '').trim(),
          }),
          projectId: context.project.id,
        });
        return;
      }

      sendJson(res, { error: 'API endpoint not found' }, { status: 404 });
    })().catch((error) => {
      sendJson(res, { error: error?.message || 'Git workspace API failed', projectId: context.project.id }, { status: 500 });
    });
    return true;
  }

  if (pathname.startsWith('/api/git/version-file/') && req.method === 'GET') {
    const parts = decodeGitVersionUrlPathParts(pathname.slice('/api/git/version-file/'.length));
    if (parts.length < 3) {
      sendJson(res, { error: 'Invalid URL format' }, { status: 400 });
      return true;
    }
    const versionId = parts[0];
    const filePath = resolveGitVersionFilePath(context.project.root, versionId, parts.slice(1));
    if (!filePath) {
      sendJson(res, {
        error: 'Resolved path is outside project root',
        code: 'PATH_OUTSIDE_PROJECT',
        projectId: context.project.id,
        path: parts.slice(1).join('/'),
      }, { status: 403 });
      return true;
    }
    if (!sendFile(res, filePath)) {
      sendJson(res, { error: 'File not found in version' }, { status: 404 });
    }
    return true;
  }

  (async () => {
    if (pathname === '/api/git/status' && req.method === 'GET') {
      const availability = await probeGitAvailability(context.project.root);
      if (!availability.available) {
        sendJson(res, { ...availability, projectId: context.project.id, projectRoot: context.project.root });
        return;
      }
      const branch = await execGit(['branch', '--show-current'], context.project.root);
      const status = await execGit(['status', '--porcelain'], context.project.root);
      sendJson(res, {
        ...availability,
        projectId: context.project.id,
        projectRoot: context.project.root,
        currentBranch: branch.stdout || 'main',
        hasChanges: status.stdout.length > 0,
      });
      return;
    }

    const rawTargetPath = req.method === 'GET' ? String(url.searchParams.get('path') || '') : '';
    let body: any = {};
    if (req.method !== 'GET') {
      body = await readJsonBody(req);
    }
    const requestedPath = rawTargetPath || String(body?.path || '');
    let targetPath = '';
    let folderPath = '';
    let gitScopePath = '';
    let versionFileBasePath = '';
    let previewResourceName = '';
    try {
      ({ targetPath, folderPath, gitScopePath, versionFileBasePath, previewResourceName } = normalizeGitTargetPath(context, requestedPath, handlers));
    } catch {
      sendPathError(requestedPath);
      return;
    }

    const availability = await probeGitAvailability(context.project.root);
    if (!availability.available) {
      sendJson(res, {
        ...availability,
        projectId: context.project.id,
        projectRoot: context.project.root,
        commits: [],
        historyReady: false,
        hasUncommitted: false,
        uncommittedFiles: '',
      });
      return;
    }

    if (!fs.existsSync(folderPath) && pathname !== '/api/git/version-file') {
      sendJson(res, { error: 'Folder not found', code: 'SOURCE_PATH_MISSING', projectId: context.project.id }, { status: 404 });
      return;
    }

    if (pathname === '/api/git/history' && req.method === 'GET') {
      const status = await execGit(['status', '--porcelain', '--', gitScopePath], context.project.root);
      const log = await execGit(['log', '-20', '--pretty=format:%H|%an|%ae|%at|%s', '--', gitScopePath], context.project.root);
      const prototypeEntryCandidates = getPrototypeIndexGitPathCandidates(gitScopePath, versionFileBasePath);
      const commits = log.stdout
        ? await Promise.all(log.stdout.split('\n').filter(Boolean).map(async (line) => {
          const [hash = '', author = '', email = '', timestamp = '', ...messageParts] = line.split('|');
          const ms = Number(timestamp) * 1000;
          const hasPrototype = await hasPrototypeAtCommit(context.project.root, hash, prototypeEntryCandidates, executor);
          return {
            hash,
            author,
            email,
            timestamp: ms,
            message: messageParts.join('|'),
            date: new Date(ms).toISOString(),
            hasPrototype,
            prototypeUrl: hasPrototype
              ? buildGitVersionPrototypeUrl({
                versionId: hash.slice(0, 8),
                previewResourceName,
                targetPath,
                previewGitPath: gitScopePath || versionFileBasePath,
                projectId: context.project.id,
              })
              : null,
          };
        })).then((items) => items.filter((commit) => commit.hasPrototype))
        : [];
      sendJson(res, {
        commits,
        hasUncommitted: status.stdout.length > 0,
        uncommittedFiles: status.stdout,
        historyReady: true,
        projectId: context.project.id,
      });
      return;
    }

    if (pathname === '/api/git/diff' && req.method === 'GET') {
      const diff = await execGit(['diff', '--', gitScopePath], context.project.root);
      const status = await execGit(['status', '--porcelain', '--', gitScopePath], context.project.root);
      const changedFiles = parseGitPorcelainStatus(status.stdout);
      sendJson(res, { diff: diff.stdout, changedFiles, projectId: context.project.id });
      return;
    }

    if (pathname === '/api/git/commit' && req.method === 'POST') {
      const message = String(body?.message || '').trim();
      if (!message) {
        sendJson(res, { error: 'Missing message parameter' }, { status: 400 });
        return;
      }
      const status = await execGit(['status', '--porcelain', '--', gitScopePath], context.project.root);
      if (!status.stdout) {
        sendJson(res, { error: 'No changes to commit' }, { status: 400 });
        return;
      }
      await execGit(['add', gitScopePath], context.project.root);
      const commit = await execGit(['commit', '-m', message], context.project.root);
      sendJson(res, { success: true, message: 'Changes committed successfully', output: commit.stdout, projectId: context.project.id });
      return;
    }

    if (pathname === '/api/git/restore' && req.method === 'POST') {
      const commitHash = String(body?.commitHash || '').trim();
      if (!commitHash) {
        sendJson(res, { error: 'Missing commitHash parameter' }, { status: 400 });
        return;
      }
      await execGit(['cat-file', '-t', commitHash], context.project.root);
      await execGit(['checkout', commitHash, '--', gitScopePath], context.project.root);
      sendJson(res, { success: true, message: 'Folder restored successfully', projectId: context.project.id });
      return;
    }

    if (pathname === '/api/git/build-version' && req.method === 'POST') {
      const commitHash = String(body?.commitHash || '').trim();
      if (!commitHash) {
        sendJson(res, { error: 'Missing commitHash parameter' }, { status: 400 });
        return;
      }
      const versionId = commitHash.slice(0, 8);
      const tempDir = path.join(context.project.root, '.git-versions', versionId);
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.mkdirSync(tempDir, { recursive: true });
      try {
        const fileList = await execGitBinary(['ls-tree', '-rz', '--name-only', commitHash], context.project.root, executor);
        for (const file of parseGitNullSeparatedOutput(fileList)) {
          const targetFile = path.join(tempDir, file);
          if (!isPathInside(tempDir, targetFile)) continue;
          fs.mkdirSync(path.dirname(targetFile), { recursive: true });
          const content = await execGitBlob(['show', `${commitHash}:${file}`], context.project.root, executor);
          fs.writeFileSync(targetFile, content);
        }
      } catch (error) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        sendJson(res, {
          error: '这个历史版本文件不完整，无法预览当前原型。',
          detail: getErrorMessage(error, 'Git version snapshot failed'),
          projectId: context.project.id,
        }, { status: 500 });
        return;
      }
      const versionResourceDirs = Array.from(new Set([
        path.join(tempDir, versionFileBasePath),
        path.join(tempDir, 'src', versionFileBasePath),
        path.join(tempDir, gitScopePath),
      ]));
      const hasPrototype = versionResourceDirs.some((resourceDir) => fs.existsSync(path.join(resourceDir, 'index.tsx')));
      sendJson(res, {
        success: true,
        versionId,
        hasPrototype,
        prototypeUrl: hasPrototype
          ? buildGitVersionPrototypeUrl({
            versionId,
            previewResourceName,
            targetPath,
            previewGitPath: gitScopePath || versionFileBasePath,
            projectId: context.project.id,
          })
          : null,
        projectId: context.project.id,
      });
      return;
    }

    if (pathname.startsWith('/api/git/version-file/') && req.method === 'GET') {
      const parts = decodeGitVersionUrlPathParts(pathname.slice('/api/git/version-file/'.length));
      if (parts.length < 3) {
        sendJson(res, { error: 'Invalid URL format' }, { status: 400 });
        return;
      }
      const versionId = parts[0];
      const filePath = resolveGitVersionFilePath(context.project.root, versionId, parts.slice(1));
      if (!filePath) {
        sendPathError(parts.slice(1).join('/'));
        return;
      }
      if (!sendFile(res, filePath)) {
        sendJson(res, { error: 'File not found in version' }, { status: 404 });
      }
      return;
    }

    sendJson(res, { error: 'API endpoint not found' }, { status: 404 });
  })().catch((error) => {
    sendJson(res, { error: error?.message || 'Git API failed', projectId: context.project.id }, { status: 500 });
  });

  return true;
}
