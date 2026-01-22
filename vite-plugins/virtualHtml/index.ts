import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { handleHackCssRequest } from './handlers/hackCssHandler';
import { handleHackCssSave } from './handlers/hackCssSaveHandler';
import { handleHackCssClear } from './handlers/hackCssClearHandler';
import { handleEntriesApi } from './handlers/entriesApiHandler';
import { handleSpecHtml } from './handlers/specHtmlHandler';
import { handleIndexHtml } from './handlers/indexHtmlHandler';
import { handleAssetsRequest } from './handlers/assetsHandler';
import { handleBuildRequest } from './handlers/buildHandler';
import { handleDocsMarkdown } from './handlers/docsMarkdownHandler';
import { handleTextReplaceCount } from './handlers/textReplaceCountHandler';
import { handleTextReplace } from './handlers/textReplaceHandler';
import { handlePathRedirect } from './handlers/pathNormalizer';

/**
 * 虚拟 HTML 插件 - 在内存中生成 HTML，不写入文件系统
 */
export function virtualHtmlPlugin(): Plugin {
  const devTemplatePath = path.resolve(process.cwd(), 'admin/dev-template.html');
  const specTemplatePath = path.resolve(process.cwd(), 'admin/spec-template.html');
  const htmlTemplatePath = path.resolve(process.cwd(), 'admin/html-template.html');
  let devTemplate: string;
  let specTemplate: string;
  let htmlTemplate: string;

  return {
    name: 'virtual-html',
    apply: 'serve',

    async configureServer(server) {
      try {
        devTemplate = fs.readFileSync(devTemplatePath, 'utf8');
      } catch (err) {
        console.error('无法读取 dev-template 模板文件:', devTemplatePath);
      }

      try {
        specTemplate = fs.readFileSync(specTemplatePath, 'utf8');
      } catch (err) {
        console.error('无法读取 spec-template 模板文件:', specTemplatePath);
      }

      try {
        htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf8');
      } catch (err) {
        console.error('无法读取 html-template 模板文件:', htmlTemplatePath);
      }

      server.middlewares.use((req, res, next) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (!req.url) {
          return next();
        }

        // 🔥 处理旧路径重定向（必须在最前面）
        if (handlePathRedirect(req, res)) return;

        // Handle hack.css GET request
        if (handleHackCssRequest(req, res)) return;

        // Handle hack.css save POST request
        if (handleHackCssSave(req, res)) return;

        // Handle hack.css clear POST request
        if (handleHackCssClear(req, res)) return;

        // Handle text replace count POST request
        if (handleTextReplaceCount(req, res)) return;

        // Handle text replace POST request
        if (handleTextReplace(req, res)) return;

        // Handle root path
        if (req.url === '/' || req.url === '/index.html') {
          const indexHtmlPath = path.resolve(process.cwd(), 'admin/index.html');
          if (fs.existsSync(indexHtmlPath)) {
            try {
              const html = fs.readFileSync(indexHtmlPath, 'utf8');
              res.setHeader('Content-Type', 'text/html');
              res.statusCode = 200;
              res.end(html);
              return;
            } catch (err) {
              console.error('读取 index.html 失败:', err);
            }
          }
        }

        // Handle assets
        if (handleAssetsRequest(req, res)) return;

        // Handle build requests
        if (handleBuildRequest(req, res)) return;

        // Handle entries API
        if (handleEntriesApi(req, res)) return;

        // Handle docs markdown files
        if (handleDocsMarkdown(req, res)) return;

        // Handle spec.html
        if (handleSpecHtml(req, res, specTemplate)) return;

        // Handle index.html
        if (req.url?.includes('/themes/') && req.url?.includes('/index.html')) {
          try {
            htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf8');
          } catch (err) {
            console.error('无法读取 html-template 模板文件:', htmlTemplatePath);
          }
        }
        if (handleIndexHtml(req, res, devTemplate, htmlTemplate)) return;

        next();
      });
    }
  };
}
