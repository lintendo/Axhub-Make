import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { readServerInfo } from './utils/serverInfo.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ID = 'make-project';
export const PROJECT_NAME = '';
export const PRODUCT_NAME = 'Axhub Make';
export const MAKE_CLIENT_MARKER_KIND = 'axhub-make-client';
export const MAKE_CLIENT_MARKER_RELATIVE_PATH = '.axhub/make/client.json';
export const DEFAULT_CLIENT_ORIGIN = 'http://localhost:51720';
export const DETERMINISTIC_UPDATED_AT = '2026-05-03T00:00:00.000Z';

export const resourceLayout = {
  prototypes: ['src/prototypes'],
  themes: ['src/themes'],
  media: ['src/resources/assets'],
};

export const resourceWriteTargets = {
  prototypes: { type: 'project-relative-path', path: resourceLayout.prototypes[0] },
  themes: { type: 'project-relative-path', path: resourceLayout.themes[0] },
  media: { type: 'project-relative-path', path: resourceLayout.media[0] },
};

export const localExportCapabilities = {
  html: true,
  make: false,
};

export const PROTOTYPE_PLACEHOLDER_GUIDE = {
  kind: 'prototype-empty',
  title: '这个原型还没有开始创建',
  description: '告诉 AI 你想做什么：目标用户、使用场景、页面内容和参考风格。',
  steps: [
    '在本地 AI 软件中打开本页面',
    '打开草稿创作原型',
  ],
  tips: [
    '模型不要用 auto，推荐：Claude Opus 4.8、Gemini 3.1 Pro、GPT-5.5、Kimi K2.7、GLM-5.2。',
    '一个任务开一个新对话，避免多个需求互相干扰。',
    '多用图片和语音描述，截图、草图和参考页面通常比长文字更清楚。',
    '如果已有视觉规范，建议先创建设计系统。',
  ],
};

// Snapshot from https://getdesign.md/api/cli/downloads?brands=...
const GETDESIGN_DOWNLOAD_SNAPSHOT_DATE = '2026-05-15';
const GETDESIGN_THEME_STATS_BY_ID = {
  'airbnb': { sourceSlug: 'airbnb', downloads: 7111 },
  'airtable': { sourceSlug: 'airtable', downloads: 3446 },
  'apple': { sourceSlug: 'apple', downloads: 13995 },
  'binance': { sourceSlug: 'binance', downloads: 2179 },
  'bmw': { sourceSlug: 'bmw', downloads: 2917 },
  'bmw-m': { sourceSlug: 'bmw-m', downloads: 555 },
  'bugatti': { sourceSlug: 'bugatti', downloads: 1473 },
  'cal-com': { sourceSlug: 'cal', downloads: 3691 },
  'claude': { sourceSlug: 'claude', downloads: 10192 },
  'clay': { sourceSlug: 'clay', downloads: 3383 },
  'clickhouse': { sourceSlug: 'clickhouse', downloads: 2495 },
  'cohere': { sourceSlug: 'cohere', downloads: 3083 },
  'coinbase': { sourceSlug: 'coinbase', downloads: 3399 },
  'composio': { sourceSlug: 'composio', downloads: 2346 },
  'cursor': { sourceSlug: 'cursor', downloads: 4650 },
  'elevenlabs': { sourceSlug: 'elevenlabs', downloads: 3438 },
  'expo': { sourceSlug: 'expo', downloads: 2457 },
  'ferrari': { sourceSlug: 'ferrari', downloads: 3158 },
  'figma': { sourceSlug: 'figma', downloads: 4351 },
  'framer': { sourceSlug: 'framer', downloads: 3781 },
  'hashicorp': { sourceSlug: 'hashicorp', downloads: 2498 },
  'ibm': { sourceSlug: 'ibm', downloads: 3093 },
  'intercom': { sourceSlug: 'intercom', downloads: 3033 },
  'june': { sourceSlug: 'june', downloads: 0 },
  'kraken': { sourceSlug: 'kraken', downloads: 2738 },
  'lamborghini': { sourceSlug: 'lamborghini', downloads: 2632 },
  'linear': { sourceSlug: 'linear.app', downloads: 12010 },
  'lovable': { sourceSlug: 'lovable', downloads: 2907 },
  'mastercard': { sourceSlug: 'mastercard', downloads: 1275 },
  'meta': { sourceSlug: 'meta', downloads: 1927 },
  'minimax': { sourceSlug: 'minimax', downloads: 2742 },
  'mintlify': { sourceSlug: 'mintlify', downloads: 3271 },
  'miro': { sourceSlug: 'miro', downloads: 2587 },
  'mistral-ai': { sourceSlug: 'mistral.ai', downloads: 2481 },
  'mongodb': { sourceSlug: 'mongodb', downloads: 2399 },
  'nike': { sourceSlug: 'nike', downloads: 2158 },
  'notion': { sourceSlug: 'notion', downloads: 11442 },
  'nvidia': { sourceSlug: 'nvidia', downloads: 2610 },
  'ollama': { sourceSlug: 'ollama', downloads: 2602 },
  'opencode': { sourceSlug: 'opencode.ai', downloads: 3033 },
  'pinterest': { sourceSlug: 'pinterest', downloads: 2837 },
  'playstation': { sourceSlug: 'playstation', downloads: 1507 },
  'posthog': { sourceSlug: 'posthog', downloads: 2949 },
  'renault': { sourceSlug: 'renault', downloads: 2186 },
  'replicate': { sourceSlug: 'replicate', downloads: 2267 },
  'revolut': { sourceSlug: 'revolut', downloads: 3289 },
  'runway': { sourceSlug: 'runwayml', downloads: 2496 },
  'sanity': { sourceSlug: 'sanity', downloads: 2322 },
  'sentry': { sourceSlug: 'sentry', downloads: 2949 },
  'shopify': { sourceSlug: 'shopify', downloads: 2063 },
  'slack': { sourceSlug: 'slack', downloads: 0 },
  'spacex': { sourceSlug: 'spacex', downloads: 3053 },
  'spotify': { sourceSlug: 'spotify', downloads: 4283 },
  'starbucks': { sourceSlug: 'starbucks', downloads: 1100 },
  'stripe': { sourceSlug: 'stripe', downloads: 9401 },
  'supabase': { sourceSlug: 'supabase', downloads: 4044 },
  'superhuman': { sourceSlug: 'superhuman', downloads: 3186 },
  'tesla': { sourceSlug: 'tesla', downloads: 3228 },
  'the-verge': { sourceSlug: 'theverge', downloads: 1508 },
  'together-ai': { sourceSlug: 'together.ai', downloads: 2352 },
  'uber': { sourceSlug: 'uber', downloads: 2933 },
  'vercel': { sourceSlug: 'vercel', downloads: 10946 },
  'vodafone': { sourceSlug: 'vodafone', downloads: 750 },
  'voltagent': { sourceSlug: 'voltagent', downloads: 2847 },
  'warp': { sourceSlug: 'warp', downloads: 2541 },
  'webflow': { sourceSlug: 'webflow', downloads: 2596 },
  'wired': { sourceSlug: 'wired', downloads: 1488 },
  'wise': { sourceSlug: 'wise', downloads: 3274 },
  'xai': { sourceSlug: 'x.ai', downloads: 2599 },
  'zapier': { sourceSlug: 'zapier', downloads: 2597 },
};

function toPosix(input) {
  return String(input || '').replace(/\\/g, '/');
}

function sortById(left, right) {
  return left.id.localeCompare(right.id);
}

function getThemeStats(themeId) {
  return GETDESIGN_THEME_STATS_BY_ID[themeId] || null;
}

function sortThemesByGetDesignDownloads(left, right) {
  const leftStats = getThemeStats(left.id);
  const rightStats = getThemeStats(right.id);
  if (leftStats && rightStats) {
    return rightStats.downloads - leftStats.downloads || sortById(left, right);
  }
  if (leftStats) return -1;
  if (rightStats) return 1;
  return sortById(left, right);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isLegacyOfficialProjectName(projectId, name) {
  return projectId === PROJECT_ID && (name === 'Axhub Make' || name === 'Axhub-Make');
}

export function normalizeMakeClientProjectIdentity(project) {
  const rawProject = project && typeof project === 'object' && !Array.isArray(project)
    ? project
    : {};
  const id = stringValue(rawProject.id) || PROJECT_ID;
  const name = typeof rawProject.name === 'string' ? rawProject.name.trim() : '';
  return {
    id,
    name: isLegacyOfficialProjectName(id, name) ? '' : name,
  };
}

const PAGE_ID_RE = /^[a-z0-9-]+$/u;

function normalizePageId(value) {
  const id = stringValue(value);
  return PAGE_ID_RE.test(id) ? id : '';
}

export function readMakeClientProjectIdentity(projectRoot) {
  const marker = readJson(path.join(projectRoot, MAKE_CLIENT_MARKER_RELATIVE_PATH));
  const project = marker?.project && typeof marker.project === 'object' && !Array.isArray(marker.project)
    ? marker.project
    : {};
  const id = stringValue(project.id);
  if (marker?.schemaVersion !== 1 || marker?.kind !== MAKE_CLIENT_MARKER_KIND || !id) {
    return {
      id: PROJECT_ID,
      name: PROJECT_NAME,
    };
  }
  return normalizeMakeClientProjectIdentity(project);
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function listFiles(rootDir, predicate) {
  if (!fs.existsSync(rootDir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}

function isIgnoredResourceRelativePath(relativePath) {
  const normalized = toPosix(relativePath).replace(/^\/+|\/+$/g, '');
  if (!normalized) return true;
  if (normalized.toLowerCase() === 'readme.md') return true;
  return normalized.split('/').some((segment) => segment.startsWith('.'));
}

function readDisplayName(indexFilePath, fallback) {
  if (!fs.existsSync(indexFilePath)) return fallback;
  const source = fs.readFileSync(indexFilePath, 'utf8');
  const displayName = source.match(/@name\s+([^\n]+)/)?.[1]?.replace(/\*\/\s*$/u, '').trim();
  return displayName || fallback;
}

function hasGeneratedPlaceholderSource(indexFilePath) {
  if (!fs.existsSync(indexFilePath)) return false;
  const source = fs.readFileSync(indexFilePath, 'utf8');
  const hasGeneratedShell = source.includes('placeholder-empty-page')
    && source.includes('打开左侧默认引导页继续创建')
    && source.includes('export default function Placeholder');
  return hasGeneratedShell && (
    source.includes('@axhub-placeholder prototype-empty')
    || source.includes('className="placeholder-empty-page"')
  );
}

function isGeneratedEmptyPrototypePlaceholder(prototypeDir, indexFilePath) {
  void prototypeDir;
  return hasGeneratedPlaceholderSource(indexFilePath);
}

function getLiteralPropertyValue(objectLiteral, propertyName) {
  const property = objectLiteral.properties.find((candidate) => (
    ts.isPropertyAssignment(candidate)
    && (
      (ts.isIdentifier(candidate.name) && candidate.name.text === propertyName)
      || (ts.isStringLiteral(candidate.name) && candidate.name.text === propertyName)
    )
  ));
  if (!property || !ts.isPropertyAssignment(property)) {
    return null;
  }
  const initializer = property.initializer;
  return ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)
    ? initializer.text.trim()
    : null;
}

function extractHashRouteFromCall(callExpression) {
  const expression = callExpression.expression;
  if (!ts.isIdentifier(expression) || expression.text !== 'defineHashPageRoute') {
    return null;
  }

  const pagesArg = callExpression.arguments[0];
  if (!pagesArg || !ts.isArrayLiteralExpression(pagesArg)) {
    return null;
  }

  const pages = [];
  for (const element of pagesArg.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      continue;
    }
    const id = normalizePageId(getLiteralPropertyValue(element, 'id'));
    const title = stringValue(getLiteralPropertyValue(element, 'title'));
    const group = stringValue(getLiteralPropertyValue(element, 'group'));
    if (id && title) {
      pages.push({ id, title, ...(group ? { group } : {}) });
    }
  }
  if (!pages.length) {
    return null;
  }

  const optionsArg = callExpression.arguments[1];
  const requestedDefaultPageId = optionsArg && ts.isObjectLiteralExpression(optionsArg)
    ? normalizePageId(getLiteralPropertyValue(optionsArg, 'defaultPageId'))
    : '';
  const defaultPageId = pages.some((page) => page.id === requestedDefaultPageId)
    ? requestedDefaultPageId
    : pages[0].id;

  return {
    pages,
    defaultPageId,
  };
}

function extractHashRouteFromFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let route = null;

  const visit = (node) => {
    if (route) {
      return;
    }
    if (ts.isCallExpression(node)) {
      route = extractHashRouteFromCall(node);
      if (route) {
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return route;
}

function extractHashRouteMetadata(prototypeDir) {
  const files = listFiles(prototypeDir, (filePath) => /\.(tsx?|mts|cts)$/iu.test(filePath));
  for (const filePath of files) {
    try {
      const route = extractHashRouteFromFile(filePath);
      if (route) {
        return route;
      }
    } catch {
      // Ignore malformed source and leave the prototype without page metadata.
    }
  }
  return null;
}

function titleFromMarkdown(markdownPath, fallback) {
  if (!fs.existsSync(markdownPath)) return fallback;
  const source = fs.readFileSync(markdownPath, 'utf8');
  const heading = source.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  return heading || fallback;
}

function titleFromTokenFile(tokenPath, fallback) {
  const token = readJson(tokenPath);
  if (token && typeof token === 'object') {
    const title = typeof token.title === 'string'
      ? token.title.trim()
      : typeof token.name === 'string'
        ? token.name.trim()
        : '';
    if (title) return title;
  }
  return fallback;
}

function normalizeThemeResourceTitle(title, fallback) {
  const rawTitle = typeof title === 'string' ? title.trim() : '';
  const fallbackTitle = typeof fallback === 'string' ? fallback.trim() : '';
  if (!rawTitle) return fallbackTitle;

  const repeatedThemeTitle = rawTitle.match(/^(.+?)\s+主题\s*-\s*(.+)$/u);
  if (repeatedThemeTitle) {
    const before = repeatedThemeTitle[1]?.trim();
    const after = repeatedThemeTitle[2]?.trim();
    if (before && after && before.toLowerCase() === after.toLowerCase()) {
      return after;
    }
  }

  return rawTitle;
}

function createAxureArtifactMetadata(projectRoot, prototypeName) {
  const artifactRoot = path.join(projectRoot, '.axhub/make/artifacts/axure', prototypeName);
  const files = {
    manifestPath: '.axhub/make/artifacts/axure/{name}/manifest.json',
    indexBundlePath: '.axhub/make/artifacts/axure/{name}/index-bundle.json',
    axureJsonPath: '.axhub/make/artifacts/axure/{name}/axure-json.json',
    coverSvgPath: '.axhub/make/artifacts/axure/{name}/cover.svg',
  };
  const existing = {};
  for (const [key, template] of Object.entries(files)) {
    const relativePath = template.replace('{name}', prototypeName);
    if (fs.existsSync(path.join(projectRoot, relativePath))) {
      existing[key] = relativePath;
    }
  }
  if (!Object.keys(existing).length && !fs.existsSync(artifactRoot)) {
    return undefined;
  }
  return {
    axure: {
      caseId: prototypeName,
      ...existing,
    },
  };
}

function createFigmaArtifactMetadata(projectRoot, prototypeName) {
  const artifactRoot = path.join(projectRoot, '.axhub/make/artifacts/figma', prototypeName);
  const files = {
    canvasFigPath: '.axhub/make/artifacts/figma/{name}/canvas.fig',
    metaPath: '.axhub/make/artifacts/figma/{name}/meta.json',
    aiChatPath: '.axhub/make/artifacts/figma/{name}/ai_chat.json',
    codeManifestPath: '.axhub/make/artifacts/figma/{name}/canvas.code-manifest.json',
    manifestPath: '.axhub/make/artifacts/figma/{name}/manifest.json',
    thumbnailPath: '.axhub/make/artifacts/figma/{name}/thumbnail.png',
  };
  const existing = {};
  for (const [key, template] of Object.entries(files)) {
    const relativePath = template.replace('{name}', prototypeName);
    if (fs.existsSync(path.join(projectRoot, relativePath))) {
      existing[key] = relativePath;
    }
  }
  const imagesRelativePath = `.axhub/make/artifacts/figma/${prototypeName}/images`;
  if (fs.existsSync(path.join(projectRoot, imagesRelativePath))) {
    existing.imagesDir = imagesRelativePath;
  }
  if (!Object.keys(existing).length && !fs.existsSync(artifactRoot)) {
    return undefined;
  }
  return {
    figma: {
      resourceId: prototypeName,
      ...existing,
    },
  };
}

function readRuntimeEntryKeys(projectRoot) {
  const manifest = readJson(path.join(projectRoot, '.axhub/make/entries.json'));
  const items = manifest && typeof manifest === 'object' && manifest.items && typeof manifest.items === 'object'
    ? manifest.items
    : {};
  const legacyJs = manifest && typeof manifest === 'object' && manifest.js && typeof manifest.js === 'object'
    ? manifest.js
    : {};
  const keys = new Set([
    ...Object.keys(items),
    ...Object.keys(legacyJs),
  ]);

  return Array.from(keys)
    .map((key) => {
      const normalizedKey = toPosix(key).replace(/^\/+/, '').replace(/\/+$/, '');
      const item = items[key];
      const group = stringValue(item?.group) || normalizedKey.split('/')[0] || '';
      const name = stringValue(item?.name) || normalizedKey.split('/').slice(1).join('/') || '';
      if (!normalizedKey || group !== 'prototypes' || !name) {
        return null;
      }
      return { key: normalizedKey, name };
    })
    .filter(Boolean);
}

function createRuntimeArtifactMetadata(projectRoot, prototypeName, runtimeEntryKeys, options = {}) {
  if (options.includeRuntimeArtifacts === false) {
    return undefined;
  }
  const entry = runtimeEntryKeys.find((item) => item.name === prototypeName || item.key === `prototypes/${prototypeName}`);
  if (!entry) {
    return undefined;
  }
  const builtJsPath = `dist/${entry.key}.js`;
  if (!fs.existsSync(path.join(projectRoot, builtJsPath))) {
    return undefined;
  }
  return {
    runtime: {
      builtJsPath,
    },
  };
}

function createResourceClientUrl(clientOrigin, resourceKind, resourceName) {
  const pathname = `/${resourceKind}/${encodeURIComponent(resourceName)}`;
  const normalizedOrigin = String(clientOrigin || '').trim().replace(/\/+$/u, '');
  if (!normalizedOrigin) {
    return pathname;
  }
  return `${normalizedOrigin}${pathname}`;
}

function collectPrototypes(projectRoot, clientOrigin, options = {}) {
  const roots = resourceLayout.prototypes.map((dir) => path.join(projectRoot, dir));
  const runtimeEntryKeys = readRuntimeEntryKeys(projectRoot);
  const items = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const indexFile = path.join(root, entry.name, 'index.tsx');
      if (!fs.existsSync(indexFile)) continue;
      const filePath = toPosix(path.relative(projectRoot, indexFile));
      const route = extractHashRouteMetadata(path.join(root, entry.name));
      const placeholder = isGeneratedEmptyPrototypePlaceholder(path.join(root, entry.name), indexFile);
      const item = {
        id: entry.name,
        name: entry.name,
        title: readDisplayName(indexFile, entry.name),
        clientUrl: createResourceClientUrl(clientOrigin, 'prototypes', entry.name),
        previewMode: 'clientRuntime',
        description: '',
        updatedAt: DETERMINISTIC_UPDATED_AT,
        filePath,
        ...(options.includeAbsoluteFilePaths === false ? {} : { absoluteFilePath: path.resolve(indexFile) }),
        ...(route ? { pages: route.pages, defaultPageId: route.defaultPageId } : {}),
        ...(placeholder ? { placeholder: true, placeholderGuide: PROTOTYPE_PLACEHOLDER_GUIDE } : {}),
      };
      const artifacts = {
        ...createFigmaArtifactMetadata(projectRoot, entry.name),
        ...createAxureArtifactMetadata(projectRoot, entry.name),
        ...createRuntimeArtifactMetadata(projectRoot, entry.name, runtimeEntryKeys, options),
      };
      if (Object.keys(artifacts).length > 0) {
        item.artifacts = artifacts;
      }
      items.push(item);
    }
  }
  return items.sort(sortById);
}

function collectThemes(projectRoot, clientOrigin) {
  const items = [];
  for (const root of resourceLayout.themes.map((dir) => path.resolve(projectRoot, dir))) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const themeRoot = path.join(root, entry.name);
      const designPath = path.join(themeRoot, 'DESIGN.md');
      const themePath = path.join(themeRoot, 'theme.json');
      const tokenPath = path.join(themeRoot, 'assets', 'tokens.json');
      const previewPath = path.join(themeRoot, 'preview.html');
      if (![designPath, themePath, tokenPath, previewPath].every(filePath => fs.existsSync(filePath))) continue;
      const theme = readJson(themePath);
      if (!theme || theme.identity?.slug !== entry.name) continue;
      const declaredReactEntry = stringValue(theme.implementations?.react?.entryPath);
      const reactEntryPath = declaredReactEntry && !path.isAbsolute(declaredReactEntry)
        && !toPosix(declaredReactEntry).split('/').some(part => !part || part === '.' || part === '..')
        ? path.resolve(themeRoot, declaredReactEntry)
        : '';
      const getdesignStats = getThemeStats(entry.name);
      const rawTitle = stringValue(theme.identity?.titleZh)
        || stringValue(theme.identity?.titleEn)
        || stringValue(theme.identity?.brand)
        || entry.name;
      items.push({
        id: entry.name,
        name: entry.name,
        title: normalizeThemeResourceTitle(rawTitle, entry.name),
        clientUrl: createResourceClientUrl(clientOrigin, 'themes', entry.name),
        sourcePath: toPosix(path.relative(projectRoot, themeRoot)),
        previewMode: 'staticHtml',
        previewPath: toPosix(path.relative(projectRoot, previewPath)),
        ...(reactEntryPath && fs.existsSync(reactEntryPath)
          ? { reactEntryPath: toPosix(path.relative(projectRoot, reactEntryPath)) }
          : {}),
        updatedAt: DETERMINISTIC_UPDATED_AT,
        ...(getdesignStats
          ? {
              getdesign: {
                source: 'getdesign.md',
                sourceSlug: getdesignStats.sourceSlug,
                downloads: getdesignStats.downloads,
                snapshotDate: GETDESIGN_DOWNLOAD_SNAPSHOT_DATE,
              },
            }
          : {}),
      });
    }
  }
  return items
    .sort(sortThemesByGetDesignDownloads)
    .map((item) => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)));
}

export function buildMakeProjectMetadata(projectRoot, options = {}) {
  const clientOrigin = String(options.clientOrigin ?? DEFAULT_CLIENT_ORIGIN).replace(/\/+$/u, '');
  const projectIdentity = readMakeClientProjectIdentity(projectRoot);
  const prototypes = collectPrototypes(projectRoot, clientOrigin, options);
  const themes = collectThemes(projectRoot, clientOrigin);

  return {
    schemaVersion: 1,
    project: {
      id: projectIdentity.id,
      name: projectIdentity.name,
    },
    resources: {
      prototypes,
      themes,
    },
    navigation: {
      prototypes: prototypes.map((item) => item.id),
    },
    orders: {
      themes: themes.map((item) => item.id),
    },
    capabilities: {
      quickEdit: true,
      quickEditMode: 'clientRuntime',
      figmaExport: true,
      axureExport: true,
      localExports: localExportCapabilities,
    },
    resourceWriteTargets,
  };
}

export function resolveClientOrigin(projectRoot, fallbackOrigin = DEFAULT_CLIENT_ORIGIN) {
  const runtime = readServerInfo(projectRoot, 'runtime');
  return runtime?.origin || fallbackOrigin;
}

export function syncMakeProjectMetadata(projectRoot, options = {}) {
  const metadata = buildMakeProjectMetadata(projectRoot, {
    clientOrigin: options.includeRuntimeUrls === true
      ? options.clientOrigin ?? resolveClientOrigin(projectRoot)
      : '',
    includeAbsoluteFilePaths: options.includeAbsoluteFilePaths === true,
    includeRuntimeArtifacts: options.includeRuntimeArtifacts === true,
  });
  const metadataPath = path.join(projectRoot, '.axhub/make/project.json');
  writeJsonAtomic(metadataPath, metadata);
  return { metadata, metadataPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const appRoot = path.resolve(__dirname, '..');
  const { metadata, metadataPath } = syncMakeProjectMetadata(appRoot);
  console.log(`Synced ${metadata.project.name || 'unnamed project'} metadata: ${metadataPath}`);
}
