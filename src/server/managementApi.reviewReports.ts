import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { isPathInside, type ProjectMetadata, type RegisteredProject } from './projectCore/index.ts';

import {
  getRequestUrl,
  readJsonBody,
  sendCorsJson,
  sendCorsPreflight,
  sendJson,
} from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';
import {
  getPrototypeDir,
  getPrototypeReviewsDir as getReviewsDir,
  readPrototypeReviewLanSubmitEnabled,
  writePrototypeReviewLanSubmitConfig,
} from './reviewLanSubmitConfig.ts';

interface ReviewReportsProjectContext {
  project: RegisteredProject;
  metadata: ProjectMetadata;
  metadataStore: {
    getMetadata: () => ProjectMetadata;
    saveMetadata: (metadata: ProjectMetadata) => ProjectMetadata;
  };
}

interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
}

interface ReviewReportsApiHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
    body?: unknown,
  ) => ReviewReportsProjectContext | null;
  createProjectContextFromBody: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    body: unknown,
  ) => ReviewReportsProjectContext | null;
  createProjectContextFromMultipartParts: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    parts: MultipartPart[],
  ) => ReviewReportsProjectContext | null;
  readMultipartParts: (req: IncomingMessage) => Promise<MultipartPart[]>;
  readProjectConfig: (projectRoot: string) => any;
}

interface ReviewReportSummary {
  id: string;
  title: string;
  reviewer: string;
  createdAt: string;
  score?: number;
  source?: string;
  path: string;
}

interface ReviewReportDetail extends ReviewReportSummary {
  markdown: string;
}

interface ParsedMarkdownMeta {
  frontmatter: Record<string, string>;
  body: string;
  title?: string;
}

const REVIEW_REPORT_FILE_EXTENSIONS = new Set(['.md', '.markdown']);
const FRONTMATTER_KEYS = [
  'title',
  'reviewer',
  'createdAt',
  'source',
  'score',
  'axhubReportId',
  'axhubPayloadHash',
];
const FRONTMATTER_FIELD_PATTERN = new RegExp(
  `(?:^|\\s)(${FRONTMATTER_KEYS.join('|')})\\s*:\\s*("[^"]*"|'[^']*'|.+?)(?=\\s+(?:${FRONTMATTER_KEYS.join('|')})\\s*:|$)`,
  'giu',
);
const REVIEW_REPORT_SECTION_HEADINGS = new Map<string, number>([
  ['UI Review', 1],
  ['UI 评审', 1],
  ['Prototype Review', 1],
  ['原型评审', 1],
  ['总体点评', 2],
  ['评分依据', 2],
  ['P0-P3 优先级问题', 2],
  ['核心元件', 2],
  ['完整性与项目对齐', 2],
  ['业务逻辑连贯性', 2],
  ['状态、异常、边界与恢复', 2],
  ['响应式与可访问性', 2],
  ['证据与评估说明', 2],
]);
const REVIEW_REPORT_HEADING_TITLES = new Map<string, string>([
  ['UI Review', 'UI 评审'],
  ['UI 评审', 'UI 评审'],
  ['Prototype Review', '原型评审'],
  ['原型评审', '原型评审'],
]);
function isSafePathName(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.includes('\0')) return false;
  if (trimmed.includes('/') || trimmed.includes('\\')) return false;
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) return false;
  if (path.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) return false;
  return true;
}

function stripFrontmatterQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\([\\"])/gu, '$1');
  }
  return trimmed.replace(/^'|'$/gu, '');
}

function parseFrontmatterFields(value: string): Record<string, string> {
  const frontmatter: Record<string, string> = {};
  for (const match of value.matchAll(FRONTMATTER_FIELD_PATTERN)) {
    const key = match[1];
    const rawValue = match[2] || '';
    frontmatter[key] = stripFrontmatterQuotes(rawValue);
  }
  return frontmatter;
}

function isLooseFrontmatterFieldLine(value: string): boolean {
  return new RegExp(`^\\s*(?:${FRONTMATTER_KEYS.join('|')})\\s*:`, 'iu').test(value);
}

function parseFrontmatter(content: string): ParsedMarkdownMeta {
  const match = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  let body = content;
  if (match) {
    const frontmatter = parseFrontmatterFields(match[1]);
    body = content.slice(match[0].length);
    const title = body.match(/^#\s+(.+)$/mu)?.[1]?.trim();
    return { frontmatter, body, title };
  }

  const looseMatch = content.match(/^\s*---\s*\r?\n/u);
  if (looseMatch) {
    const lines = content.slice(looseMatch[0].length).split(/\r?\n/u);
    const metadataLines: string[] = [];
    let bodyStartIndex = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (isLooseFrontmatterFieldLine(line)) {
        metadataLines.push(line);
        bodyStartIndex = index + 1;
        continue;
      }
      bodyStartIndex = index;
      break;
    }
    if (metadataLines.length > 0) {
      const frontmatter = parseFrontmatterFields(metadataLines.join('\n'));
      body = lines.slice(bodyStartIndex).join('\n');
      const title = body.match(/^#\s+(.+)$/mu)?.[1]?.trim();
      return { frontmatter, body, title };
    }
  }

  const title = body.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  return { frontmatter: {}, body, title };
}

function titleFromFileName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName))
    .replace(/[-_]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\b\w/gu, (value) => value.toUpperCase())
    || 'Review Report';
}

function toIsoDate(value: string | undefined, fallback: Date): string {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback.toISOString();
}

function parseReviewScore(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = Number(value.trim());
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
    return null;
  }
  return Math.round(normalized);
}

function normalizeReportMarkdownBody(value: string): string {
  const lines = value.replace(/^(?:[ \t]*\r?\n)+/u, '').split(/\r?\n/u);
  let inCodeFence = false;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^```/u.test(trimmed)) {
      inCodeFence = !inCodeFence;
      return line;
    }
    if (inCodeFence || !trimmed) {
      return line;
    }
    const explicitHeadingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/u);
    if (explicitHeadingMatch) {
      const normalizedTitle = REVIEW_REPORT_HEADING_TITLES.get(explicitHeadingMatch[2].trim());
      return normalizedTitle ? `${explicitHeadingMatch[1]} ${normalizedTitle}` : line;
    }
    const headingLevel = REVIEW_REPORT_SECTION_HEADINGS.get(trimmed);
    if (headingLevel) {
      return `${'#'.repeat(headingLevel)} ${REVIEW_REPORT_HEADING_TITLES.get(trimmed) || trimmed}`;
    }
    if (/^P[0-3]\s*[-：:]\s+/u.test(trimmed)) {
      return `### ${trimmed}`;
    }
    return line;
  }).join('\n');
}

function normalizeReviewReportTitle(params: {
  id: string;
  title: string;
  source?: string;
}): string {
  if (params.id === 'ui-review') {
    return 'UI 评审';
  }
  if (params.id === 'prototype-review') {
    return '原型评审';
  }
  if (params.source === 'ai-review') {
    if (/\bui\s+review\b/iu.test(params.title) || /UI\s*评审|设计评审/u.test(params.title)) {
      return 'UI 评审';
    }
    if (/\bprototype\s+review\b/iu.test(params.title) || /需求评审|原型评审/u.test(params.title)) {
      return '原型评审';
    }
  }
  return params.title;
}

function createProjectRelativePath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

function readReportFile(projectRoot: string, filePath: string): ReviewReportDetail | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!REVIEW_REPORT_FILE_EXTENSIONS.has(ext)) {
    return null;
  }
  const markdown = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(markdown);
  const stat = fs.statSync(filePath);
  const id = path.basename(filePath, ext);
  const source = parsed.frontmatter.source;
  const rawTitle = parsed.frontmatter.title || parsed.title || titleFromFileName(path.basename(filePath));
  const title = normalizeReviewReportTitle({ id, title: rawTitle, source });
  const reviewer = parsed.frontmatter.reviewer || 'AI';
  const createdAt = toIsoDate(parsed.frontmatter.createdAt, stat.mtime);
  const score = parseReviewScore(parsed.frontmatter.score);
  return {
    id,
    title,
    reviewer,
    createdAt,
    ...(score !== null ? { score } : {}),
    ...(source ? { source } : {}),
    path: createProjectRelativePath(projectRoot, filePath),
    markdown: normalizeReportMarkdownBody(parsed.body),
  };
}

function toReportSummary(report: ReviewReportDetail): ReviewReportSummary {
  const { markdown: _markdown, ...summary } = report;
  return summary;
}

function listReports(projectRoot: string, prototypeDir: string): ReviewReportSummary[] {
  const reports: ReviewReportDetail[] = [];
  const reviewsDir = getReviewsDir(prototypeDir);
  if (fs.existsSync(reviewsDir)) {
    for (const entry of fs.readdirSync(reviewsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !REVIEW_REPORT_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      const report = readReportFile(projectRoot, path.join(reviewsDir, entry.name));
      if (report) {
        reports.push(report);
      }
    }
  }

  return reports
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map(toReportSummary);
}

function findReportFile(prototypeDir: string, reportId: string): { filePath: string } | null {
  const trimmed = String(reportId || '').trim();
  if (!isSafePathName(trimmed)) {
    return null;
  }
  const reviewsDir = getReviewsDir(prototypeDir);
  for (const ext of REVIEW_REPORT_FILE_EXTENSIONS) {
    const candidate = path.join(reviewsDir, `${trimmed}${ext}`);
    if (fs.existsSync(candidate)) {
      return { filePath: candidate };
    }
  }
  return null;
}

function getMultipartTextField(parts: MultipartPart[], name: string): string {
  return parts.find((part) => part.name === name && !part.filename)?.data.toString('utf8').trim() || '';
}

function getPrimaryMultipartFile(parts: MultipartPart[]): MultipartPart | null {
  return parts.find((part) => part.name === 'file' && part.filename)
    || parts.find((part) => part.filename)
    || null;
}

function toKebabBaseName(input: string): string {
  const normalized = String(input || '')
    .trim()
    .replace(/\.[^.]+$/u, '')
    .replace(/[^a-z0-9]+/giu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase();
  return normalized || `review-${Date.now()}`;
}

function createUniqueReportFilePath(reviewsDir: string, baseName: string): string {
  let candidate = path.join(reviewsDir, `${baseName}.md`);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(reviewsDir, `${baseName}-${index}.md`);
    index += 1;
  }
  return candidate;
}

function escapeFrontmatterValue(value: string): string {
  return value
    .replace(/\r?\n/gu, ' ')
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .trim();
}

function createStoredMarkdown(params: {
  title: string;
  reviewer: string;
  createdAt: string;
  source: string;
  score?: number;
  content: string;
}): string {
  const parsed = parseFrontmatter(params.content);
  const body = parsed.body.replace(/^\s*/u, '');
  const normalizedBody = body.endsWith('\n') ? body : `${body}\n`;
  return [
    '---',
    `title: "${escapeFrontmatterValue(params.title)}"`,
    `reviewer: "${escapeFrontmatterValue(params.reviewer)}"`,
    `createdAt: ${params.createdAt}`,
    `source: "${escapeFrontmatterValue(params.source)}"`,
    typeof params.score === 'number' ? `score: ${params.score}` : null,
    '---',
    '',
    normalizedBody,
  ].filter((line): line is string => line !== null).join('\n');
}

function saveReviewReport(projectRoot: string, prototypeDir: string, params: {
  title?: string;
  reviewer?: string;
  score?: number;
  source: string;
  content: string;
  fileName?: string;
}): ReviewReportDetail {
  const parsed = parseFrontmatter(params.content);
  const title = String(params.title || parsed.frontmatter.title || parsed.title || titleFromFileName(params.fileName || '')).trim();
  const reviewer = String(params.reviewer || parsed.frontmatter.reviewer || 'AI').trim() || 'AI';
  const parsedScore = typeof params.score === 'number' ? params.score : parseReviewScore(parsed.frontmatter.score);
  const createdAt = new Date().toISOString();
  const baseName = toKebabBaseName(title || params.fileName || 'review-report');
  const reviewsDir = getReviewsDir(prototypeDir);
  fs.mkdirSync(reviewsDir, { recursive: true });
  const targetPath = createUniqueReportFilePath(reviewsDir, baseName);
  fs.writeFileSync(targetPath, createStoredMarkdown({
    title,
    reviewer,
    createdAt,
    source: params.source,
    ...(parsedScore !== null && parsedScore >= 0 && parsedScore <= 100 ? { score: parsedScore } : {}),
    content: params.content,
  }), 'utf8');
  const report = readReportFile(projectRoot, targetPath);
  if (!report) {
    throw new Error('Failed to save review report');
  }
  return report;
}

function getPrototypeContext(res: ServerResponse, context: ReviewReportsProjectContext, prototypeId: string): string | null {
  const prototypeDir = getPrototypeDir(context.project.root, prototypeId);
  if (!prototypeDir) {
    sendJson(res, {
      error: 'Invalid prototype id',
      code: 'INVALID_PROTOTYPE_ID',
      prototypeId,
    }, { status: 400 });
    return null;
  }
  if (!fs.existsSync(prototypeDir) || !fs.statSync(prototypeDir).isDirectory()) {
    sendJson(res, {
      error: 'Prototype not found',
      code: 'PROTOTYPE_NOT_FOUND',
      prototypeId,
    }, { status: 404 });
    return null;
  }
  return prototypeDir;
}

function getRequiredPrototypeId(res: ServerResponse, value: unknown): string | null {
  const prototypeId = String(value || '').trim();
  if (!prototypeId) {
    sendJson(res, {
      error: 'Missing prototype id',
      code: 'MISSING_PROTOTYPE_ID',
    }, { status: 400 });
    return null;
  }
  return prototypeId;
}

function getRequiredReportId(res: ServerResponse, value: unknown, send = sendJson): string | null {
  const reportId = String(value || '').trim();
  if (!reportId) {
    send(res, {
      error: 'Missing report id',
      code: 'MISSING_REPORT_ID',
    }, { status: 400 });
    return null;
  }
  if (!isSafePathName(reportId)) {
    send(res, { error: 'Invalid report id', code: 'INVALID_REPORT_ID' }, { status: 400 });
    return null;
  }
  return reportId;
}

function createLanSubmitConfig(context: ReviewReportsProjectContext, prototypeId: string, prototypeDir: string) {
  return {
    projectId: context.project.id,
    prototypeId,
    lanSubmitEnabled: readPrototypeReviewLanSubmitEnabled(prototypeDir),
    projectLanAllowed: true,
    submitUrl: '/api/review-reports/submit',
  };
}

async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  handlers: ReviewReportsApiHandlers,
): Promise<void> {
  const parts = await handlers.readMultipartParts(req);
  const context = handlers.createProjectContextFromMultipartParts(req, res, options, parts);
  if (!context) return;
  const prototypeId = getMultipartTextField(parts, 'prototypeId');
  const prototypeDir = getPrototypeContext(res, context, prototypeId);
  if (!prototypeDir) return;

  const filePart = getPrimaryMultipartFile(parts);
  if (!filePart?.filename) {
    sendJson(res, { error: 'Missing report file', code: 'MISSING_REPORT_FILE' }, { status: 400 });
    return;
  }
  const ext = path.extname(filePart.filename).toLowerCase();
  if (!REVIEW_REPORT_FILE_EXTENSIONS.has(ext)) {
    sendJson(res, { error: 'Only Markdown reports are supported', code: 'INVALID_REPORT_FILE_TYPE' }, { status: 400 });
    return;
  }

  const report = saveReviewReport(context.project.root, prototypeDir, {
    title: getMultipartTextField(parts, 'title'),
    reviewer: getMultipartTextField(parts, 'reviewer'),
    source: 'upload',
    content: filePart.data.toString('utf8'),
    fileName: filePart.filename,
  });
  sendJson(res, { projectId: context.project.id, prototypeId, report }, { status: 201 });
}

async function handleSubmit(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  handlers: ReviewReportsApiHandlers,
): Promise<void> {
  const body = await readJsonBody<Record<string, unknown>>(req);
  const requestUrl = getRequestUrl(req);
  const effectiveBody = {
    ...body,
    projectId: body.projectId || requestUrl.searchParams.get('projectId') || undefined,
    prototypeId: body.prototypeId || requestUrl.searchParams.get('prototypeId') || undefined,
  };
  const context = handlers.createProjectContextFromBody(req, res, options, effectiveBody);
  if (!context) return;

  const prototypeId = String(effectiveBody.prototypeId || '').trim();
  const prototypeDir = getPrototypeContext(res, context, prototypeId);
  if (!prototypeDir) return;
  if (!readPrototypeReviewLanSubmitEnabled(prototypeDir)) {
    sendCorsJson(res, {
      error: 'LAN review submission is disabled',
      code: 'LAN_REVIEW_SUBMIT_DISABLED',
      projectId: context.project.id,
      prototypeId,
    }, { status: 403 });
    return;
  }

  const content = String(body.content || body.markdown || '').trim();
  if (!content) {
    sendCorsJson(res, { error: 'Missing report content', code: 'MISSING_REPORT_CONTENT' }, { status: 400 });
    return;
  }
  const submittedScore = parseReviewScore(
    typeof body.score === 'string' || typeof body.score === 'number'
      ? String(body.score)
      : undefined,
  );
  const report = saveReviewReport(context.project.root, prototypeDir, {
    title: String(body.title || '').trim(),
    reviewer: String(body.reviewer || '').trim(),
    ...(submittedScore !== null ? { score: submittedScore } : {}),
    source: String(body.source || 'lan-api').trim() || 'lan-api',
    content: `${content}\n`,
  });
  sendCorsJson(res, { projectId: context.project.id, prototypeId, report: toReportSummary(report) }, { status: 201 });
}

export function handleReviewReportsApi(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  url: URL,
  handlers: ReviewReportsApiHandlers,
): boolean {
  if (pathname === '/api/review-reports/submit' && req.method === 'OPTIONS') {
    sendCorsPreflight(res);
    return true;
  }

  if (pathname === '/api/review-reports/exists' && req.method === 'OPTIONS') {
    sendCorsPreflight(res);
    return true;
  }

  if (pathname === '/api/review-reports/lan-submit-config' && req.method === 'GET') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    const prototypeId = getRequiredPrototypeId(res, url.searchParams.get('prototypeId'));
    if (!prototypeId) return true;
    const prototypeDir = getPrototypeContext(res, context, prototypeId);
    if (!prototypeDir) return true;
    sendJson(res, createLanSubmitConfig(context, prototypeId, prototypeDir));
    return true;
  }

  if (pathname === '/api/review-reports/lan-submit-config' && req.method === 'PUT') {
    readJsonBody(req).then((body) => {
      const context = handlers.createProjectContextFromBody(req, res, options, body);
      if (!context) return;
      const prototypeId = getRequiredPrototypeId(res, (body as Record<string, unknown>)?.prototypeId);
      if (!prototypeId) return;
      const prototypeDir = getPrototypeContext(res, context, prototypeId);
      if (!prototypeDir) return;
      writePrototypeReviewLanSubmitConfig(prototypeDir, (body as Record<string, unknown>)?.lanSubmitEnabled === true);
      sendJson(res, createLanSubmitConfig(context, prototypeId, prototypeDir));
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
  }

  if (pathname === '/api/review-reports/upload' && req.method === 'POST') {
    handleUpload(req, res, options, handlers).catch((error) => {
      sendJson(res, { error: error.message || 'Upload review report failed' }, { status: 400 });
    });
    return true;
  }

  if (pathname === '/api/review-reports/submit' && req.method === 'POST') {
    handleSubmit(req, res, options, handlers).catch((error) => {
      sendCorsJson(res, { error: error.message || 'Submit review report failed' }, { status: 400 });
    });
    return true;
  }

  if (pathname === '/api/review-reports/exists' && req.method === 'GET') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    const prototypeId = getRequiredPrototypeId(res, url.searchParams.get('prototypeId'));
    if (!prototypeId) return true;
    const prototypeDir = getPrototypeContext(res, context, prototypeId);
    if (!prototypeDir) return true;
    if (!readPrototypeReviewLanSubmitEnabled(prototypeDir)) {
      sendCorsJson(res, {
        error: 'LAN review submission is disabled',
        code: 'LAN_REVIEW_SUBMIT_DISABLED',
        projectId: context.project.id,
        prototypeId,
      }, { status: 403 });
      return true;
    }
    const reportId = getRequiredReportId(res, url.searchParams.get('reportId'), sendCorsJson);
    if (!reportId) return true;
    const reportFile = findReportFile(prototypeDir, reportId);
    sendCorsJson(res, {
      projectId: context.project.id,
      prototypeId,
      reportId,
      exists: Boolean(reportFile && isPathInside(context.project.root, reportFile.filePath)),
    });
    return true;
  }

  if (pathname === '/api/review-reports' && req.method === 'GET') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    const prototypeId = String(url.searchParams.get('prototypeId') || '').trim();
    const prototypeDir = getPrototypeContext(res, context, prototypeId);
    if (!prototypeDir) return true;
    sendJson(res, {
      projectId: context.project.id,
      prototypeId,
      reports: listReports(context.project.root, prototypeDir),
    });
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/review-reports\/([^/]+)$/u);
  if (detailMatch && req.method === 'DELETE') {
    readJsonBody(req).then((body) => {
      const effectiveBody = {
        ...(body && typeof body === 'object' ? body as Record<string, unknown> : {}),
        projectId: (body as Record<string, unknown> | null | undefined)?.projectId || url.searchParams.get('projectId') || undefined,
        prototypeId: (body as Record<string, unknown> | null | undefined)?.prototypeId || url.searchParams.get('prototypeId') || undefined,
      };
      const context = handlers.createProjectContextFromBody(req, res, options, effectiveBody);
      if (!context) return;
      const prototypeId = getRequiredPrototypeId(res, effectiveBody.prototypeId);
      if (!prototypeId) return;
      const prototypeDir = getPrototypeContext(res, context, prototypeId);
      if (!prototypeDir) return;
      const reportId = decodeURIComponent(detailMatch[1]);
      if (!getRequiredReportId(res, reportId)) return;
      const reportFile = findReportFile(prototypeDir, reportId);
      if (!reportFile || !isPathInside(context.project.root, reportFile.filePath)) {
        sendJson(res, { error: 'Review report not found', code: 'REVIEW_REPORT_NOT_FOUND' }, { status: 404 });
        return;
      }
      fs.unlinkSync(reportFile.filePath);
      sendJson(res, {
        projectId: context.project.id,
        prototypeId,
        reportId,
        deleted: true,
      });
    }).catch((error) => sendJson(res, { error: error.message || 'Delete review report failed' }, { status: 400 }));
    return true;
  }

  if (detailMatch && req.method === 'GET') {
    const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
    if (!context) return true;
    const prototypeId = String(url.searchParams.get('prototypeId') || '').trim();
    const prototypeDir = getPrototypeContext(res, context, prototypeId);
    if (!prototypeDir) return true;
    const reportId = decodeURIComponent(detailMatch[1]);
    if (!getRequiredReportId(res, reportId)) return true;
    const reportFile = findReportFile(prototypeDir, reportId);
    if (!reportFile || !isPathInside(context.project.root, reportFile.filePath)) {
      sendJson(res, { error: 'Review report not found', code: 'REVIEW_REPORT_NOT_FOUND' }, { status: 404 });
      return true;
    }
    const report = readReportFile(context.project.root, reportFile.filePath);
    if (!report) {
      sendJson(res, { error: 'Review report not found', code: 'REVIEW_REPORT_NOT_FOUND' }, { status: 404 });
      return true;
    }
    sendJson(res, { projectId: context.project.id, prototypeId, report });
    return true;
  }

  return false;
}
