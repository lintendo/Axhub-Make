import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const API_PATHS = new Set([
  '/api/text-replace/count',
  '/api/text-replace/replace',
  '/api/hack-css/save',
  '/api/hack-css/clear',
]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_CSS_BYTES = 256 * 1024;
const MAX_REPLACEMENTS = 200;
const MAX_REPLACEMENT_CHARACTERS = 10_000;
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist']);
const resourceOperationQueues = new Map<string, Promise<void>>();

type JsonObject = Record<string, unknown>;
type TextReplacement = {
  searchText: string;
  replaceText: string;
};

class RequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: JsonObject) {
  const serialized = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(Buffer.byteLength(serialized)));
  res.end(serialized);
}

function getRequestPathname(url: string | undefined): string {
  try {
    return new URL(url || '/', 'http://localhost').pathname;
  } catch {
    return '';
  }
}

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function hasTrustedBrowserOrigin(req: IncomingMessage): boolean {
  const origin = getHeaderValue(req.headers.origin).trim();
  if (!origin) return true;
  const directHost = getHeaderValue(req.headers.host).trim().toLowerCase();
  const forwardedHost = getHeaderValue(req.headers['x-forwarded-host'])
    .split(',')[0]?.trim().toLowerCase() || '';
  if (!directHost && !forwardedHost) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    return originHost === directHost || originHost === forwardedHost;
  } catch {
    return false;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<JsonObject> {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    req.resume();
    throw new RequestError(413, '请求内容过大。');
  }

  const chunks: Buffer[] = [];
  let byteLength = 0;
  let exceeded = false;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.length;
    if (byteLength > MAX_BODY_BYTES) {
      exceeded = true;
      continue;
    }
    chunks.push(buffer);
  }
  if (exceeded) {
    throw new RequestError(413, '请求内容过大。');
  }

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Expected an object');
    }
    return value as JsonObject;
  } catch {
    throw new RequestError(400, '请求内容不是有效的 JSON 对象。');
  }
}

function assertUnicodeLength(value: string, fieldName: string) {
  if ([...value].length > MAX_REPLACEMENT_CHARACTERS) {
    throw new RequestError(413, `${fieldName} 不能超过 ${MAX_REPLACEMENT_CHARACTERS} 个字符。`);
  }
}

function normalizeReplacements(value: unknown, requireReplaceText: boolean): TextReplacement[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestError(400, `文本替换项数量必须在 1 到 ${MAX_REPLACEMENTS} 之间。`);
  }
  if (value.length > MAX_REPLACEMENTS) {
    throw new RequestError(413, `文本替换项不能超过 ${MAX_REPLACEMENTS} 个。`);
  }

  const replacements = new Map<string, string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new RequestError(400, '文本替换项格式不正确。');
    }
    const searchText = (item as JsonObject).searchText;
    const rawReplaceText = (item as JsonObject).replaceText;
    if (typeof searchText !== 'string' || !searchText) {
      throw new RequestError(400, '待替换文本不能为空。');
    }
    if (
      (requireReplaceText && typeof rawReplaceText !== 'string')
      || (rawReplaceText !== undefined && typeof rawReplaceText !== 'string')
    ) {
      throw new RequestError(400, '替换文本格式不正确。');
    }
    const replaceText = typeof rawReplaceText === 'string' ? rawReplaceText : '';
    assertUnicodeLength(searchText, '待替换文本');
    assertUnicodeLength(replaceText, '替换文本');

    const existing = replacements.get(searchText);
    if (existing !== undefined && existing !== replaceText) {
      throw new RequestError(400, '相同原文不能对应多个不同的替换结果。');
    }
    replacements.set(searchText, replaceText);
  }

  return [...replacements].map(([searchText, replaceText]) => ({ searchText, replaceText }));
}

function normalizeResourcePath(value: unknown): string[] {
  if (typeof value !== 'string' || value.startsWith('/') || value.endsWith('/')) {
    throw new RequestError(400, '资源路径格式不正确。');
  }
  const parts = value.split('/');
  if (
    parts.length < 2
    || (parts[0] !== 'prototypes' && parts[0] !== 'themes')
    || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))
  ) {
    throw new RequestError(400, '资源路径仅支持 prototypes 或 themes。');
  }
  return parts;
}

async function resolveResourceDirectory(projectRoot: string, value: unknown): Promise<string> {
  const parts = normalizeResourcePath(value);
  const srcRoot = path.resolve(projectRoot, 'src');
  try {
    const srcStat = await fs.promises.lstat(srcRoot);
    if (srcStat.isSymbolicLink() || !srcStat.isDirectory()) {
      throw new RequestError(400, '项目 src 必须是真实目录。');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RequestError(404, '项目 src 目录不存在。');
    }
    throw error;
  }
  const resourceDirectory = path.resolve(srcRoot, ...parts);
  const relative = path.relative(srcRoot, resourceDirectory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new RequestError(400, '资源路径超出项目目录。');
  }

  let currentPath = srcRoot;
  for (const part of parts) {
    currentPath = path.join(currentPath, part);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.lstat(currentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new RequestError(404, '资源目录不存在。');
      }
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new RequestError(400, '资源路径必须指向项目内的真实目录。');
    }
  }
  return resourceDirectory;
}

function shouldExcludeDirectory(name: string): boolean {
  return name.startsWith('.') || name.endsWith('.assets') || EXCLUDED_DIRECTORIES.has(name);
}

function shouldIncludeSourceFile(name: string): boolean {
  return !name.startsWith('.')
    && !/\.spec\.[^.]+$/u.test(name)
    && !/\.local\.[^.]+$/u.test(name)
    && SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!shouldExcludeDirectory(entry.name)) {
        files.push(...await collectSourceFiles(entryPath));
      }
      continue;
    }
    if (entry.isFile() && shouldIncludeSourceFile(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createReplacementPattern(replacements: TextReplacement[]): RegExp {
  const alternatives = replacements
    .map(({ searchText }) => searchText)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);
  return new RegExp(alternatives.join('|'), 'g');
}

async function readSourceFiles(resourceDirectory: string) {
  const filePaths = await collectSourceFiles(resourceDirectory);
  return Promise.all(filePaths.map(async (filePath) => ({
    filePath,
    content: await fs.promises.readFile(filePath, 'utf8'),
  })));
}

async function runResourceOperation<T>(resourceDirectory: string, operation: () => Promise<T>): Promise<T> {
  const previous = resourceOperationQueues.get(resourceDirectory) ?? Promise.resolve();
  const result = previous.then(operation);
  const completion = result.then(() => undefined, () => undefined);
  resourceOperationQueues.set(resourceDirectory, completion);
  try {
    return await result;
  } finally {
    if (resourceOperationQueues.get(resourceDirectory) === completion) {
      resourceOperationQueues.delete(resourceDirectory);
    }
  }
}

function countMatches(
  sources: Array<{ filePath: string; content: string }>,
  replacements: TextReplacement[],
) {
  const counts = Object.fromEntries(replacements.map(({ searchText }) => [searchText, 0])) as Record<string, number>;
  const pattern = createReplacementPattern(replacements);
  for (const { content } of sources) {
    content.replace(pattern, (matched) => {
      counts[matched] += 1;
      return matched;
    });
  }
  return {
    counts,
    totalCount: Object.values(counts).reduce((total, count) => total + count, 0),
  };
}

function stripTemporaryStyleHackHeader(content: string): string {
  const normalized = content.trim();
  if (!normalized.startsWith('/*')) return normalized;
  const commentEnd = normalized.indexOf('*/');
  if (commentEnd < 0) return normalized;
  const leadingComment = normalized.slice(0, commentEnd + 2);
  return leadingComment.includes('AXHUB TEMPORARY STYLE HACK')
    ? normalized.slice(commentEnd + 2).trim()
    : normalized;
}

function mergeHackCss(previousContent: string | null, incomingContent: string): string {
  if (previousContent === null) return incomingContent;
  const incomingRules = stripTemporaryStyleHackHeader(incomingContent);
  if (!incomingRules || previousContent.trimEnd().endsWith(incomingRules)) {
    return previousContent;
  }
  return `${previousContent.trimEnd()}\n\n${incomingRules}\n`;
}

async function writeFilesAtomically(changes: Array<{
  filePath: string;
  content: string;
  originalContent: string;
}>) {
  const staged: Array<{ filePath: string; tempPath: string }> = [];
  try {
    for (const [index, change] of changes.entries()) {
      const stat = await fs.promises.lstat(change.filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new RequestError(409, '源文件在保存过程中发生变化，未写入任何修改。');
      }
      const tempPath = `${change.filePath}.axhub-${process.pid}-${index}-${randomUUID()}.tmp`;
      await fs.promises.writeFile(tempPath, change.content, { encoding: 'utf8', mode: stat.mode });
      staged.push({ filePath: change.filePath, tempPath });
    }
    for (const change of changes) {
      const stat = await fs.promises.lstat(change.filePath);
      const currentContent = stat.isSymbolicLink() || !stat.isFile()
        ? null
        : await fs.promises.readFile(change.filePath, 'utf8');
      if (currentContent !== change.originalContent) {
        throw new RequestError(409, '源文件在保存过程中发生变化，未写入任何修改。');
      }
    }
    for (const { filePath, tempPath } of staged) {
      await fs.promises.rename(tempPath, filePath);
    }
  } finally {
    await Promise.all(staged.map(({ tempPath }) => fs.promises.rm(tempPath, { force: true }).catch(() => undefined)));
  }
}

async function writeFileAtomically(filePath: string, content: string) {
  const tempPath = `${filePath}.axhub-${process.pid}-${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(tempPath, content, 'utf8');
    await fs.promises.rename(tempPath, filePath);
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function handleTextReplace(pathname: string, body: JsonObject, projectRoot: string) {
  const resourceDirectory = await resolveResourceDirectory(projectRoot, body.path);
  const isCountRequest = pathname.endsWith('/count');
  const replacements = normalizeReplacements(body.replacements, !isCountRequest);
  return runResourceOperation(resourceDirectory, async () => {
    const sources = await readSourceFiles(resourceDirectory);
    const countResult = countMatches(sources, replacements);
    if (Object.values(countResult.counts).some((count) => count <= 0)) {
      throw new RequestError(409, '至少一组原文本已发生变化，未写入任何修改。');
    }
    if (isCountRequest) {
      return { success: true, ...countResult };
    }
    if (countResult.totalCount <= 0) {
      throw new RequestError(409, '原文本已发生变化，未替换任何内容。');
    }

    const replacementMap = new Map(replacements.map(({ searchText, replaceText }) => [searchText, replaceText]));
    const pattern = createReplacementPattern(replacements);
    const changes = sources.flatMap(({ filePath, content }) => {
      const nextContent = content.replace(pattern, (matched) => replacementMap.get(matched) ?? matched);
      return nextContent === content
        ? []
        : [{ filePath, content: nextContent, originalContent: content }];
    });
    await writeFilesAtomically(changes);
    return { success: true, changedFiles: changes.length, ...countResult };
  });
}

async function handleHackCss(pathname: string, body: JsonObject, projectRoot: string) {
  const resourceDirectory = await resolveResourceDirectory(projectRoot, body.path);
  return runResourceOperation(resourceDirectory, async () => {
    const hackCssPath = path.join(resourceDirectory, 'hack.css');
    if (pathname.endsWith('/clear')) {
      let changed = true;
      try {
        const stat = await fs.promises.lstat(hackCssPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new RequestError(400, 'hack.css 必须是资源目录内的普通文件。');
        }
        await fs.promises.unlink(hackCssPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          changed = false;
        } else {
          throw error;
        }
      }
      return { success: true, changed };
    }

    const content = typeof body.content === 'string' ? body.content : body.css;
    if (typeof content !== 'string') {
      throw new RequestError(400, '强制样式内容格式不正确。');
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_CSS_BYTES) {
      throw new RequestError(413, '强制样式内容不能超过 256 KiB。');
    }
    let previousContent: string | null = null;
    try {
      const stat = await fs.promises.lstat(hackCssPath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new RequestError(400, 'hack.css 必须是资源目录内的普通文件。');
      }
      previousContent = await fs.promises.readFile(hackCssPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const nextContent = mergeHackCss(previousContent, content);
    if (Buffer.byteLength(nextContent, 'utf8') > MAX_CSS_BYTES) {
      throw new RequestError(413, '累计强制样式内容不能超过 256 KiB。');
    }
    const changed = previousContent !== nextContent;
    if (changed) {
      await writeFileAtomically(hackCssPath, nextContent);
    }
    return { success: true, changed };
  });
}

async function processRequest(
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
) {
  try {
    if (req.method !== 'POST') {
      throw new RequestError(405, '该接口仅支持 POST 请求。');
    }
    if (!hasTrustedBrowserOrigin(req)) {
      throw new RequestError(403, '拒绝来自其它站点的本地保存请求。');
    }
    const body = await readJsonBody(req);
    const result = pathname.startsWith('/api/text-replace/')
      ? await handleTextReplace(pathname, body, projectRoot)
      : await handleHackCss(pathname, body, projectRoot);
    sendJson(res, 200, result);
  } catch (error) {
    const statusCode = error instanceof RequestError ? error.statusCode : 500;
    if (!(error instanceof RequestError)) {
      console.error('[Axhub local editing API]', error);
    }
    const message = error instanceof RequestError ? error.message : '本地保存失败，请检查项目文件权限后重试。';
    sendJson(res, statusCode, { success: false, error: message });
  }
}

export function handleLocalEditingApi(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  const pathname = getRequestPathname(req.url);
  if (!isLocalEditingApiRequest(req.url)) return false;
  void processRequest(pathname, req, res, projectRoot);
  return true;
}

export function isLocalEditingApiRequest(url: string | undefined): boolean {
  return API_PATHS.has(getRequestPathname(url));
}
