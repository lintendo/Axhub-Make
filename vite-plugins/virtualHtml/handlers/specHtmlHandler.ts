import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { normalizePath } from './pathNormalizer';

export function handleSpecHtml(req: IncomingMessage, res: ServerResponse, specTemplate: string): boolean {
  if (!req.url) return false;

  // 先尝试标准化路径
  const normalized = normalizePath(req.url);

  // 只处理文档请求（action === 'spec'）
  if (normalized && normalized.action === 'spec') {
    const { type, name, versionId } = normalized;

    console.log('[虚拟HTML] 文档请求:', normalized.originalUrl, '→', normalized.normalizedUrl);

    // 处理 pages/elements/themes 的 spec 请求
    if (['elements', 'pages', 'themes'].includes(type)) {
      let basePath: string;
      let specMdPath: string;
      let prdMdPath: string;

      // 如果有版本参数，从 Git 版本目录读取
      if (versionId) {
        const gitVersionsDir = path.resolve(process.cwd(), '.git-versions', versionId);
        basePath = path.join(gitVersionsDir, 'src', type, name);
        specMdPath = path.join(basePath, 'spec.md');
        prdMdPath = path.join(basePath, 'prd.md');
        console.log('[虚拟HTML] 从 Git 版本读取:', versionId, basePath);
      } else {
        // 否则从当前工作目录读取
        basePath = path.join(process.cwd(), 'src', type, name);
        specMdPath = path.join(basePath, 'spec.md');
        prdMdPath = path.join(basePath, 'prd.md');
      }

      const typeLabel = type === 'elements' ? 'Element' : type === 'pages' ? 'Page' : 'Theme';

      console.log('[虚拟HTML] 检查文档文件:', { specMdPath, prdMdPath });
      console.log('[虚拟HTML] 文件存在:', {
        spec: fs.existsSync(specMdPath),
        prd: fs.existsSync(prdMdPath)
      });

      // 收集所有存在的文档
      const docs: Array<{ key: string; label: string; url: string }> = [];
      const urlPath = `/${type}/${name}`;

      if (fs.existsSync(specMdPath)) {
        const docUrl = versionId
          ? `/api/git/version-file/${versionId}${urlPath}/spec.md`
          : `${urlPath}/spec.md`;
        docs.push({
          key: 'spec',
          label: 'Spec',
          url: docUrl
        });
      }

      if (fs.existsSync(prdMdPath)) {
        const docUrl = versionId
          ? `/api/git/version-file/${versionId}${urlPath}/prd.md`
          : `${urlPath}/prd.md`;
        docs.push({
          key: 'prd',
          label: 'PRD',
          url: docUrl
        });
      }

      if (docs.length > 0) {
        const title = versionId
          ? `${typeLabel}: ${name} (版本: ${versionId})`
          : `${typeLabel}: ${name}`;
        const isMultiDoc = docs.length > 1;

        // 使用 spec-template.html 模板
        let html = specTemplate.replace(/\{\{TITLE\}\}/g, title);

        if (isMultiDoc) {
          // 多文档模式
          const docsConfig = JSON.stringify(docs);
          html = html.replace(/\{\{SPEC_URL\}\}/g, '');
          html = html.replace(/\{\{DOCS_CONFIG\}\}/g, docsConfig.replace(/"/g, '&quot;'));
          html = html.replace(/\{\{MULTI_DOC\}\}/g, 'true');
          console.log('[虚拟HTML] ✅ 返回多文档 Spec 虚拟 HTML:', normalized.normalizedUrl, '文档数:', docs.length);
        } else {
          // 单文档模式
          html = html.replace(/\{\{SPEC_URL\}\}/g, docs[0].url);
          html = html.replace(/\{\{DOCS_CONFIG\}\}/g, '[]');
          html = html.replace(/\{\{MULTI_DOC\}\}/g, 'false');
          console.log('[虚拟HTML] ✅ 返回单文档 Spec 虚拟 HTML:', normalized.normalizedUrl);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 200;
        res.end(html);
        return true;
      } else {
        console.log('[虚拟HTML] ❌ 没有找到任何文档文件');
      }
    }

    // 处理 /assets/docs/* 的 spec 请求
    if (type === 'assets-docs') {
      const decodedDocName = decodeURIComponent(name);
      const mdPath = path.resolve(process.cwd(), 'assets/docs', decodedDocName + '.md');

      console.log('[虚拟HTML] 检查 docs markdown 文件:', mdPath, '存在:', fs.existsSync(mdPath));

      if (fs.existsSync(mdPath)) {
        const title = `Docs: ${decodedDocName || 'Index'}`;
        const specMdUrl = `/api/docs/${encodeURIComponent(decodedDocName + '.md')}`;

        let html = specTemplate.replace(/\{\{TITLE\}\}/g, title);
        html = html.replace(/\{\{SPEC_URL\}\}/g, specMdUrl);
        html = html.replace(/\{\{DOCS_CONFIG\}\}/g, '[]');
        html = html.replace(/\{\{MULTI_DOC\}\}/g, 'false');

        console.log('[虚拟HTML] ✅ 返回 Docs 虚拟 HTML:', normalized.normalizedUrl);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 200;
        res.end(html);
        return true;
      } else {
        console.log('[虚拟HTML] ❌ docs markdown 不存在:', mdPath);
      }
    }

    // 处理 /assets/libraries/* 的 spec 请求
    if (type === 'assets-libraries') {
      const decodedLibraryName = decodeURIComponent(name);
      const mdPath = path.resolve(process.cwd(), 'assets/libraries', decodedLibraryName + '.md');

      console.log('[虚拟HTML] 检查 library markdown 文件:', mdPath, '存在:', fs.existsSync(mdPath));

      if (fs.existsSync(mdPath)) {
        const title = `Library: ${decodedLibraryName || 'Index'}`;
        const specMdUrl = `/api/libraries/${encodeURIComponent(decodedLibraryName + '.md')}`;

        let html = specTemplate.replace(/\{\{TITLE\}\}/g, title);
        html = html.replace(/\{\{SPEC_URL\}\}/g, specMdUrl);
        html = html.replace(/\{\{DOCS_CONFIG\}\}/g, '[]');
        html = html.replace(/\{\{MULTI_DOC\}\}/g, 'false');

        console.log('[虚拟HTML] ✅ 返回 Library 虚拟 HTML:', normalized.normalizedUrl);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 200;
        res.end(html);
        return true;
      } else {
        console.log('[虚拟HTML] ❌ library markdown 不存在:', mdPath);
      }
    }
  }

  return false;
}
