import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

/**
 * 路径标准化器
 *
 * 新路径格式（推荐）：
 * - /pages/{name}          → 页面预览
 * - /pages/{name}/spec     → 页面文档
 * - /elements/{name}       → 元素预览
 * - /elements/{name}/spec  → 元素文档
 * - /themes/{name}         → 主题预览
 * - /themes/{name}/spec    → 主题文档
 * - /assets/docs/{name}    → 系统文档
 * - /assets/libraries/{name} → 前端库文档
 *
 * 旧路径格式（兼容）：
 * - /{name}.html                    → 重定向到新格式
 * - /{name}/spec.html               → 重定向到新格式
 * - /pages/{name}/index.html        → 重定向到新格式
 * - /elements/{name}/index.html     → 重定向到新格式
 * - /assets/docs/{name}/spec.html   → 重定向到新格式
 */

export interface NormalizedPath {
  type: 'pages' | 'elements' | 'themes' | 'assets-docs' | 'assets-libraries';
  name: string;
  action: 'preview' | 'spec';
  isLegacy: boolean;
  originalUrl: string;
  normalizedUrl: string;
  versionId?: string;
}

/**
 * 解析并标准化路径
 */
export function normalizePath(url: string): NormalizedPath | null {
  const [urlWithoutQuery, queryString] = url.split('?');
  const params = new URLSearchParams(queryString || '');
  const versionId = params.get('ver') || undefined;

  // 移除末尾的 .html
  let cleanUrl = urlWithoutQuery.replace(/\.html$/, '');

  // 解析路径部分
  const pathParts = cleanUrl.split('/').filter(Boolean);

  if (pathParts.length === 0) return null;

  // 情况 1: /pages/{name} 或 /pages/{name}/spec 或 /pages/{name}/index
  if (pathParts[0] === 'pages' && pathParts.length >= 2) {
    const name = pathParts[1];
    const lastPart = pathParts[2];

    if (!lastPart || lastPart === 'index') {
      // /pages/{name} 或 /pages/{name}/index.html
      return {
        type: 'pages',
        name,
        action: 'preview',
        isLegacy: lastPart === 'index',
        originalUrl: url,
        normalizedUrl: `/pages/${name}${versionId ? `?ver=${versionId}` : ''}`,
        versionId
      };
    } else if (lastPart === 'spec') {
      // /pages/{name}/spec 或 /pages/{name}/spec.html
      return {
        type: 'pages',
        name,
        action: 'spec',
        isLegacy: urlWithoutQuery.includes('.html'),
        originalUrl: url,
        normalizedUrl: `/pages/${name}/spec${versionId ? `?ver=${versionId}` : ''}`,
        versionId
      };
    }
  }

  // 情况 2: /elements/{name} 或 /elements/{name}/spec 或 /elements/{name}/index
  if (pathParts[0] === 'elements' && pathParts.length >= 2) {
    const name = pathParts[1];
    const lastPart = pathParts[2];

    if (!lastPart || lastPart === 'index') {
      // /elements/{name} 或 /elements/{name}/index.html
      return {
        type: 'elements',
        name,
        action: 'preview',
        isLegacy: lastPart === 'index',
        originalUrl: url,
        normalizedUrl: `/elements/${name}${versionId ? `?ver=${versionId}` : ''}`,
        versionId
      };
    } else if (lastPart === 'spec') {
      // /elements/{name}/spec 或 /elements/{name}/spec.html
      return {
        type: 'elements',
        name,
        action: 'spec',
        isLegacy: urlWithoutQuery.includes('.html'),
        originalUrl: url,
        normalizedUrl: `/elements/${name}/spec${versionId ? `?ver=${versionId}` : ''}`,
        versionId
      };
    }
  }

  // 情况 3: /themes/{name} 或 /themes/{name}/spec 或 /themes/{name}/index
  if (pathParts[0] === 'themes' && pathParts.length >= 2) {
    const name = pathParts[1];
    const lastPart = pathParts[2];

    if (!lastPart || lastPart === 'index') {
      // /themes/{name} 或 /themes/{name}/index.html
      return {
        type: 'themes',
        name,
        action: 'preview',
        isLegacy: lastPart === 'index',
        originalUrl: url,
        normalizedUrl: `/themes/${name}${versionId ? `?ver=${versionId}` : ''}`,
        versionId
      };
    } else if (lastPart === 'spec') {
      // /themes/{name}/spec 或 /themes/{name}/spec.html
      return {
        type: 'themes',
        name,
        action: 'spec',
        isLegacy: urlWithoutQuery.includes('.html'),
        originalUrl: url,
        normalizedUrl: `/themes/${name}/spec${versionId ? `?ver=${versionId}` : ''}`,
        versionId
      };
    }
  }

  // 情况 4: /assets/docs/{name} 或 /assets/docs/{name}/spec.html（旧格式）
  if (pathParts[0] === 'assets' && pathParts[1] === 'docs' && pathParts.length >= 3) {
    const nameParts = pathParts.slice(2);
    const lastPart = nameParts[nameParts.length - 1];

    if (lastPart === 'spec') {
      // /assets/docs/{name}/spec.html（旧格式）→ /assets/docs/{name}
      const name = nameParts.slice(0, -1).join('/');
      return {
        type: 'assets-docs',
        name,
        action: 'spec',
        isLegacy: true,
        originalUrl: url,
        normalizedUrl: `/assets/docs/${name}`,
        versionId
      };
    } else {
      // /assets/docs/{name}（新格式）
      const name = nameParts.join('/');
      return {
        type: 'assets-docs',
        name,
        action: 'spec',
        isLegacy: false,
        originalUrl: url,
        normalizedUrl: `/assets/docs/${name}`,
        versionId
      };
    }
  }

  // 情况 5: /assets/libraries/{name} 或 /assets/libraries/{name}/spec.html（旧格式）
  if (pathParts[0] === 'assets' && pathParts[1] === 'libraries' && pathParts.length >= 3) {
    const nameParts = pathParts.slice(2);
    const lastPart = nameParts[nameParts.length - 1];

    if (lastPart === 'spec') {
      // /assets/libraries/{name}/spec.html（旧格式）→ /assets/libraries/{name}
      const name = nameParts.slice(0, -1).join('/');
      return {
        type: 'assets-libraries',
        name,
        action: 'spec',
        isLegacy: true,
        originalUrl: url,
        normalizedUrl: `/assets/libraries/${name}`,
        versionId
      };
    } else {
      // /assets/libraries/{name}（新格式）
      const name = nameParts.join('/');
      return {
        type: 'assets-libraries',
        name,
        action: 'spec',
        isLegacy: false,
        originalUrl: url,
        normalizedUrl: `/assets/libraries/${name}`,
        versionId
      };
    }
  }

  // 情况 6: /{name}.html 或 /{name}/spec.html（旧格式，需要查找是 page 还是 element）
  if (pathParts.length === 1 && urlWithoutQuery.endsWith('.html')) {
    const name = pathParts[0];

    // 读取 entries.json 判断类型
    const entriesPath = path.resolve(process.cwd(), 'entries.json');
    if (fs.existsSync(entriesPath)) {
      try {
        const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
        const jsEntries = entries.js || {};

        // 查找匹配的 entry
        if (jsEntries[`pages/${name}`]) {
          return {
            type: 'pages',
            name,
            action: 'preview',
            isLegacy: true,
            originalUrl: url,
            normalizedUrl: `/pages/${name}${versionId ? `?ver=${versionId}` : ''}`,
            versionId
          };
        } else if (jsEntries[`elements/${name}`]) {
          return {
            type: 'elements',
            name,
            action: 'preview',
            isLegacy: true,
            originalUrl: url,
            normalizedUrl: `/elements/${name}${versionId ? `?ver=${versionId}` : ''}`,
            versionId
          };
        } else if (jsEntries[`themes/${name}`]) {
          return {
            type: 'themes',
            name,
            action: 'preview',
            isLegacy: true,
            originalUrl: url,
            normalizedUrl: `/themes/${name}${versionId ? `?ver=${versionId}` : ''}`,
            versionId
          };
        }
      } catch (e) {
        console.error('[路径标准化] 读取 entries.json 失败:', e);
      }
    }
  }

  // 情况 7: /{name}/spec.html（旧格式）
  if (pathParts.length === 2 && pathParts[1] === 'spec' && urlWithoutQuery.endsWith('.html')) {
    const name = pathParts[0];

    // 读取 entries.json 判断类型
    const entriesPath = path.resolve(process.cwd(), 'entries.json');
    if (fs.existsSync(entriesPath)) {
      try {
        const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
        const jsEntries = entries.js || {};

        // 查找匹配的 entry
        if (jsEntries[`pages/${name}`]) {
          return {
            type: 'pages',
            name,
            action: 'spec',
            isLegacy: true,
            originalUrl: url,
            normalizedUrl: `/pages/${name}/spec${versionId ? `?ver=${versionId}` : ''}`,
            versionId
          };
        } else if (jsEntries[`elements/${name}`]) {
          return {
            type: 'elements',
            name,
            action: 'spec',
            isLegacy: true,
            originalUrl: url,
            normalizedUrl: `/elements/${name}/spec${versionId ? `?ver=${versionId}` : ''}`,
            versionId
          };
        } else if (jsEntries[`themes/${name}`]) {
          return {
            type: 'themes',
            name,
            action: 'spec',
            isLegacy: true,
            originalUrl: url,
            normalizedUrl: `/themes/${name}/spec${versionId ? `?ver=${versionId}` : ''}`,
            versionId
          };
        }
      } catch (e) {
        console.error('[路径标准化] 读取 entries.json 失败:', e);
      }
    }
  }

  return null;
}

/**
 * 处理路径重定向（旧格式 → 新格式）
 */
export function handlePathRedirect(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url) return false;

  const normalized = normalizePath(req.url);

  if (normalized && normalized.isLegacy) {
    // 旧格式，重定向到新格式
    console.log('[路径标准化] 重定向:', normalized.originalUrl, '→', normalized.normalizedUrl);

    res.statusCode = 301; // 永久重定向
    res.setHeader('Location', normalized.normalizedUrl);
    res.end();
    return true;
  }

  return false;
}
