import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { networkInterfaces } from 'os';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { forceInlineDynamicImportsOff } from './vite-plugins/forceInlineDynamicImportsOff';
import { addAxhubMarker } from './vite-plugins/addAxhubMarker';
import { axhubComponentEnforcer } from './vite-plugins/axhubComponentEnforcer';
import { virtualHtmlPlugin } from './vite-plugins/virtualHtml';
import { websocketPlugin } from './vite-plugins/websocketPlugin';
import { injectStablePageIds } from './vite-plugins/injectStablePageIds';
import { fileSystemApiPlugin } from './vite-plugins/fileSystemApiPlugin';
import { dataManagementApiPlugin } from './vite-plugins/dataManagementApiPlugin';
import { mediaManagementApiPlugin } from './vite-plugins/mediaManagementApiPlugin';
import { codeReviewPlugin } from './vite-plugins/codeReviewPlugin';
import { mcpInstallPlugin } from './vite-plugins/mcpInstallPlugin';
import { autoDebugPlugin } from './vite-plugins/autoDebugPlugin';
import { configApiPlugin } from './vite-plugins/configApiPlugin';
import { aiCliPlugin } from './vite-plugins/aiCliPlugin';
import { gitVersionApiPlugin } from './vite-plugins/gitVersionApiPlugin';

/**
 * ⚠️ 运行时配置注入说明
 * 
 * serveAdminPlugin 负责在运行时动态注入配置到 admin HTML 文件中。
 * 这些配置包括：
 * - window.__LOCAL_IP__: 当前机器的局域网 IP
 * - window.__LOCAL_PORT__: 实际运行的端口号
 * - window.__PROJECT_PREFIX__: 项目路径前缀
 * - window.__IS_MIXED_PROJECT__: 是否为混合项目
 * 
 * 🔑 为什么在运行时注入？
 * - admin 文件是由 prototype-admin 构建的静态文件
 * - 构建时的 IP/端口在运行时可能不同（不同机器、端口被占用等）
 * - 必须在每次请求时动态获取并注入正确的配置
 */

// 获取局域网 IP 地址
function getLocalIP(): string {
  const interfaces = networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  
  return 'localhost';
}

/**
 * 写入开发服务器信息到文件的插件
 * 用于 AI 调试时读取服务器配置信息
 */
function writeDevServerInfoPlugin(): Plugin {
  return {
    name: 'write-dev-server-info',
    configureServer(server: any) {
      server.httpServer?.once('listening', () => {
        try {
          const localIP = getLocalIP();
          const actualPort = server.httpServer?.address()?.port || server.config.server?.port || 5173;
          const host = server.config.server?.host || 'localhost';
          
          const devServerInfo = {
            port: actualPort,
            host: host,
            localIP: localIP,
            timestamp: new Date().toISOString()
          };
          
          const infoPath = path.resolve(__dirname, '.dev-server-info.json');
          fs.writeFileSync(infoPath, JSON.stringify(devServerInfo, null, 2), 'utf8');
          
          console.log('\n✅ Dev server info written to .dev-server-info.json');
          console.log(`   Local:   http://localhost:${actualPort}`);
          console.log(`   Network: http://${localIP}:${actualPort}\n`);
        } catch (error) {
          console.error('Failed to write dev server info:', error);
        }
      });
    }
  };
}

/**
 * 服务 admin 目录下的静态文件插件
 * 
 * 🎯 核心职责：
 * 1. 服务由 prototype-admin 构建的静态 HTML 文件
 * 2. 在运行时动态注入配置（IP、端口、项目路径等）
 * 3. 确保每次请求都使用当前机器的正确配置
 * 
 * ⚠️ 重要：不要移除运行时注入逻辑！
 * 这些配置必须在运行时动态生成，不能在构建时写死。
 */
function serveAdminPlugin(): Plugin {
  // 检测项目结构：判断当前目录是否在 apps/xxx/ 下
  const currentDir = __dirname;
  const appsMatch = currentDir.match(/[\/\\]apps[\/\\]([^\/\\]+)/);
  
  let projectPrefix = '';
  if (appsMatch) {
    // 在 apps/xxx/ 结构下，说明是混合项目
    // 需要找到包含 entries.json 的项目目录（通常是主项目）
    const rootDir = currentDir.split(/[\/\\]apps[\/\\]/)[0];
    const appsDir = path.join(rootDir, 'apps');
    
    if (fs.existsSync(appsDir)) {
      const appFolders = fs.readdirSync(appsDir);
      for (const folder of appFolders) {
        const folderPath = path.join(appsDir, folder);
        const entriesPath = path.join(folderPath, 'entries.json');
        if (fs.existsSync(entriesPath)) {
          projectPrefix = `apps/${folder}/`;
          break;
        }
      }
    }
  }
  
  const isMixedProject = !!projectPrefix;
  
  return {
    name: 'serve-admin-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const adminDir = path.resolve(__dirname, 'admin');
        
        // 获取运行时的局域网 IP 和端口
        const localIP = getLocalIP();
        const actualPort = server.httpServer?.address()?.port || server.config.server?.port || 5173;
        
        // 🔥 运行时动态注入配置脚本
        // 注意：这些配置必须在每次请求时动态生成，不能在构建时写死
        // 因为不同机器的 IP 不同，端口也可能被占用而改变
        const injectScript = `
  <script>
    // 项目路径配置（根据项目结构自动检测）
    window.__PROJECT_PREFIX__ = '${projectPrefix}';
    window.__IS_MIXED_PROJECT__ = ${isMixedProject};
    // 运行时注入的局域网 IP 信息
    window.__LOCAL_IP__ = '${localIP}';
    window.__LOCAL_PORT__ = ${actualPort};
  </script>`;
        
        // 处理根路径 / 或 /index.html
        if (req.url === '/' || req.url === '/index.html') {
          const indexPath = path.join(adminDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            let html = fs.readFileSync(indexPath, 'utf8');
            // 注入项目路径配置和局域网 IP
            html = html.replace('</head>', `${injectScript}\n</head>`);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          }
        }
        
        // 处理 /*.html 请求（如 /projects.html）
        if (req.url && req.url.match(/^\/[^/]+\.html$/)) {
          const htmlPath = path.join(adminDir, req.url);
          if (fs.existsSync(htmlPath)) {
            let html = fs.readFileSync(htmlPath, 'utf8');
            // 注入项目路径配置和局域网 IP
            html = html.replace('</head>', `${injectScript}\n</head>`);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          }
        }
        
        // 处理 /assets/* 静态资源
        if (req.url && req.url.startsWith('/assets/')) {
          const assetPath = path.join(adminDir, req.url);
          if (fs.existsSync(assetPath)) {
            const ext = path.extname(assetPath);
            const contentTypes: Record<string, string> = {
              '.js': 'application/javascript',
              '.css': 'text/css',
              '.json': 'application/json',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.svg': 'image/svg+xml',
              '.ico': 'image/x-icon'
            };
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
            res.end(fs.readFileSync(assetPath));
            return;
          }
        }
        
        // 处理 /images/* 静态资源
        if (req.url && req.url.startsWith('/images/')) {
          const imagePath = path.join(adminDir, req.url);
          if (fs.existsSync(imagePath)) {
            const ext = path.extname(imagePath);
            const contentTypes: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.svg': 'image/svg+xml',
              '.ico': 'image/x-icon'
            };
            res.setHeader('Content-Type', contentTypes[ext] || 'image/png');
            res.end(fs.readFileSync(imagePath));
            return;
          }
        }

        // 处理 /assets/docs/*/spec.html 请求（文档预览）
        if (req.url && req.url.match(/^\/assets\/docs\/[^/]+\/spec\.html$/)) {
          const encodedDocName = req.url.match(/^\/assets\/docs\/([^/]+)\/spec\.html$/)?.[1];
          if (encodedDocName) {
            const specTemplatePath = path.join(adminDir, 'spec-template.html');
            if (fs.existsSync(specTemplatePath)) {
              let html = fs.readFileSync(specTemplatePath, 'utf8');
              // 解码文档名并添加 .md 扩展名
              const docName = decodeURIComponent(encodedDocName);
              const docFileName = docName.endsWith('.md') ? docName : `${docName}.md`;
              // 替换 spec.html 中的占位符 - 使用 API 路径
              const specUrl = `/api/docs/${encodeURIComponent(docFileName)}`;
              html = html.replace(/\{\{SPEC_URL\}\}/g, specUrl);
              html = html.replace(/\{\{TITLE\}\}/g, docName);
              html = html.replace(/\{\{MULTI_DOC\}\}/g, 'false');
              html = html.replace(/\{\{DOCS_CONFIG\}\}/g, '[]');
              // 注入项目路径配置和局域网 IP
              html = html.replace('</head>', `${injectScript}\n</head>`);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
              return;
            }
          }
        }

        // 处理 /assets/libraries/*/spec.html 请求（前端库预览）
        if (req.url && req.url.match(/^\/assets\/libraries\/[^/]+\/spec\.html$/)) {
          const libraryName = req.url.match(/^\/assets\/libraries\/([^/]+)\/spec\.html$/)?.[1];
          if (libraryName) {
            const specTemplatePath = path.join(adminDir, 'spec-template.html');
            if (fs.existsSync(specTemplatePath)) {
              let html = fs.readFileSync(specTemplatePath, 'utf8');
              // 替换 spec.html 中的占位符 - 使用 API 路径
              const specUrl = `/api/libraries/${libraryName}.md`;
              html = html.replace(/\{\{SPEC_URL\}\}/g, specUrl);
              html = html.replace(/\{\{TITLE\}\}/g, libraryName);
              html = html.replace(/\{\{MULTI_DOC\}\}/g, 'false');
              html = html.replace(/\{\{DOCS_CONFIG\}\}/g, '[]');
              // 注入项目路径配置和局域网 IP
              html = html.replace('</head>', `${injectScript}\n</head>`);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
              return;
            }
          }
        }
        
        next();
      });
    }
  };
}

// 提供 /api/download-dist 端点的插件
function downloadDistPlugin(): Plugin {
  return {
    name: 'download-dist-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method !== 'GET' || req.url !== '/api/download-dist') {
          return next();
        }

        try {
          const distDir = path.resolve(__dirname, 'dist');

          if (!fs.existsSync(distDir)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Dist directory not found' }));
            return;
          }

          // 读取 package.json 获取项目名称
          let projectName = 'project';
          try {
            const pkgPath = path.resolve(__dirname, 'package.json');
            if (fs.existsSync(pkgPath)) {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              projectName = pkg.name || 'project';
            }
          } catch (e) {
            console.warn('Failed to read project name from package.json:', e);
          }

          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${projectName}-dist.zip"`);

          // Use zip command (available on macOS/Linux)
          const child = exec(`cd "${distDir}" && zip -r - .`, { maxBuffer: 1024 * 1024 * 50 });

          if (child.stdout) {
            child.stdout.pipe(res);
          } else {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to create zip stream' }));
          }

          child.stderr?.on('data', (data: any) => {
            console.error(`zip stderr: ${data}`);
          });

          child.on('error', (error: any) => {
            console.error('Download dist error:', error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } catch (e: any) {
          console.error('Download dist error:', e);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        }
      });
    }
  };
}

// 提供 /api/version 端点的插件
function versionApiPlugin(): Plugin {
  return {
    name: 'version-api-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method !== 'GET' || req.url !== '/api/version') {
          return next();
        }

        try {
          const pkgPath = path.resolve(__dirname, 'package.json');
          const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : null;
          const version = pkg?.version ?? null;

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ version }));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: e?.message || 'Unknown error' }));
        }
      });
    }
  };
}

// 提供 /api/docs 端点的插件
function docsApiPlugin(): Plugin {
  return {
    name: 'docs-api-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url.startsWith('/api/docs') && !req.url.startsWith('/api/libraries')) {
          return next();
        }

        // DELETE /api/docs/:name - 删除文档
        if (req.method === 'DELETE' && req.url.startsWith('/api/docs/')) {
          try {
            const docName = req.url.replace('/api/docs/', '').split('?')[0];
            if (!docName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing document name' }));
              return;
            }

            const docsDir = path.resolve(__dirname, 'assets/docs');
            const docPath = path.join(docsDir, docName);

            // 安全检查
            if (!docPath.startsWith(docsDir)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Forbidden' }));
              return;
            }

            if (!fs.existsSync(docPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Document not found' }));
              return;
            }

            fs.unlinkSync(docPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (error: any) {
            console.error('Error deleting doc:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        // DELETE /api/libraries/:name - 删除前端库
        if (req.method === 'DELETE' && req.url.startsWith('/api/libraries/')) {
          try {
            const libraryName = req.url.replace('/api/libraries/', '').split('?')[0];
            if (!libraryName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing library name' }));
              return;
            }

            const librariesDir = path.resolve(__dirname, 'assets/libraries');
            const libraryPath = path.join(librariesDir, `${libraryName}.md`);

            // 安全检查
            if (!libraryPath.startsWith(librariesDir)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Forbidden' }));
              return;
            }

            if (!fs.existsSync(libraryPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Library not found' }));
              return;
            }

            fs.unlinkSync(libraryPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (error: any) {
            console.error('Error deleting library:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        // GET 请求处理
        if (req.method !== 'GET') {
          return next();
        }

        // 处理 /api/libraries/:name.md 端点用于获取单个前端库内容
        if (req.url.startsWith('/api/libraries/') && req.url !== '/api/libraries' && req.url !== '/api/libraries/') {
          try {
            const encodedLibraryFile = req.url.replace('/api/libraries/', '').split('?')[0];
            if (!encodedLibraryFile) {
              return next();
            }

            // 解码 URL 编码的文件名
            const libraryFile = decodeURIComponent(encodedLibraryFile);
            const librariesDir = path.resolve(__dirname, 'assets/libraries');
            const libraryPath = path.join(librariesDir, libraryFile);

            // 安全检查：确保路径在 assets/libraries 目录内
            if (!libraryPath.startsWith(librariesDir)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Forbidden' }));
              return;
            }

            if (fs.existsSync(libraryPath)) {
              const content = fs.readFileSync(libraryPath, 'utf8');
              res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
              res.end(content);
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Library not found' }));
            }
          } catch (error: any) {
            console.error('Error loading library:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        // 处理 /api/docs/:name 端点用于获取单个文档内容
        if (req.url.startsWith('/api/docs/') && req.url !== '/api/docs' && req.url !== '/api/docs/') {
          try {
            const encodedDocName = req.url.replace('/api/docs/', '').split('?')[0];
            if (!encodedDocName) {
              return next();
            }

            // 解码 URL 编码的文件名
            const docName = decodeURIComponent(encodedDocName);
            const docsDir = path.resolve(__dirname, 'assets/docs');
            // 直接使用文件名（已包含扩展名）
            const docPath = path.join(docsDir, docName);

            // 安全检查：确保路径在 assets/docs 目录内
            if (!docPath.startsWith(docsDir)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Forbidden' }));
              return;
            }

            if (fs.existsSync(docPath)) {
              const content = fs.readFileSync(docPath, 'utf8');
              // 根据文件扩展名设置 Content-Type
              const ext = path.extname(docPath);
              const contentTypeMap: Record<string, string> = {
                '.md': 'text/markdown; charset=utf-8',
                '.csv': 'text/csv; charset=utf-8',
                '.json': 'application/json; charset=utf-8',
                '.yaml': 'text/yaml; charset=utf-8',
                '.yml': 'text/yaml; charset=utf-8',
                '.txt': 'text/plain; charset=utf-8'
              };
              res.setHeader('Content-Type', contentTypeMap[ext] || 'text/plain; charset=utf-8');
              res.end(content);
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Document not found' }));
            }
          } catch (error: any) {
            console.error('Error loading doc:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        // 处理 /api/docs 端点用于获取文档列表
        if (req.url === '/api/docs' || req.url === '/api/docs/') {
          try {
            const docsDir = path.resolve(__dirname, 'assets/docs');
            const docs: any[] = [];
            // 支持的文档格式
            const supportedExtensions = ['.md', '.csv', '.json', '.yaml', '.yml', '.txt'];

            if (fs.existsSync(docsDir)) {
              const items = fs.readdirSync(docsDir, { withFileTypes: true });
              
              items.forEach(item => {
                // 读取支持的文件格式
                if (item.isFile()) {
                  const ext = path.extname(item.name);
                  if (supportedExtensions.includes(ext)) {
                    // 保留完整文件名（包含扩展名）
                    docs.push({
                      name: item.name,
                      displayName: item.name
                    });
                  }
                }
              });
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(docs));
          } catch (error: any) {
            console.error('Error loading docs:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        // 处理 /api/libraries 端点用于获取前端库列表
        if (req.url === '/api/libraries' || req.url === '/api/libraries/') {
          try {
            const librariesDir = path.resolve(__dirname, 'assets/libraries');
            const libraries: any[] = [];

            if (fs.existsSync(librariesDir)) {
              const items = fs.readdirSync(librariesDir, { withFileTypes: true });
              
              items.forEach(item => {
                // 只读取 .md 文件
                if (item.isFile() && item.name.endsWith('.md')) {
                  const name = item.name.replace('.md', '');
                  const filePath = path.join(librariesDir, item.name);
                  const content = fs.readFileSync(filePath, 'utf8');
                  
                  // 尝试从文件内容中提取标题
                  let displayName = name;
                  const titleMatch = content.match(/^#\s+(.+)$/m);
                  if (titleMatch) {
                    displayName = titleMatch[1].trim();
                  }

                  // 提取第一段作为描述
                  let description = '';
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line && !line.startsWith('#')) {
                      description = line;
                      break;
                    }
                  }

                  libraries.push({
                    name,
                    displayName,
                    description
                  });
                }
              });
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(libraries));
          } catch (error: any) {
            console.error('Error loading libraries:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        next();
      });
    }
  };
}

function uploadDocsApiPlugin(): Plugin {
  return {
    name: 'upload-docs-api-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method !== 'POST' || req.url !== '/api/upload-docs') {
          return next();
        }

        const chunks: Buffer[] = [];
        let totalLength = 0;

        req.on('data', (chunk: Buffer) => {
          totalLength += chunk.length;
          if (totalLength > 1024 * 1024 * 20) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Payload too large' }));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            const body = raw ? JSON.parse(raw) : null;
            const files = body?.files;

            if (!Array.isArray(files) || files.length === 0) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Missing files' }));
              return;
            }

            const docsDir = path.resolve(__dirname, 'assets/docs');
            fs.mkdirSync(docsDir, { recursive: true });

            const saved: string[] = [];

            files.forEach((f: any) => {
              const rawName = typeof f?.name === 'string' ? f.name : '';
              const content = typeof f?.content === 'string' ? f.content : '';

              if (!rawName) {
                throw new Error('Invalid file name');
              }

              let safeName = path.basename(rawName).trim();
              safeName = safeName.replace(/[^\w.\- ]+/g, '-').replace(/\s+/g, '-');
              
              const lowerName = safeName.toLowerCase();
              if (!lowerName.endsWith('.md') && !lowerName.endsWith('.csv') && !lowerName.endsWith('.json')) {
                throw new Error('Only .md, .csv, and .json files are allowed');
              }

              const targetPath = path.join(docsDir, safeName);
              if (!targetPath.startsWith(docsDir)) {
                throw new Error('Forbidden');
              }

              fs.writeFileSync(targetPath, content, 'utf8');
              saved.push(safeName.replace(/\.(md|csv|json)$/i, ''));
            });

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ success: true, files: saved }));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: e?.message || 'Upload failed' }));
          }
        });
      });
    }
  };
}

function sourceApiPlugin(): Plugin {
  return {
    name: 'source-api-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method !== 'GET' || !req.url.startsWith('/api/source')) {
          return next();
        }

        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const targetPath = url.searchParams.get('path'); // e.g., 'pages/ref-app-home' or 'elements/button'

          if (!targetPath) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing path parameter' }));
            return;
          }

          // Validate path to prevent directory traversal
          if (targetPath.includes('..') || targetPath.startsWith('/')) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Invalid path' }));
            return;
          }

          // 构建源文件路径
          const sourceFile = path.resolve(__dirname, 'src', targetPath, 'index.tsx');

          if (!fs.existsSync(sourceFile)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Source file not found' }));
            return;
          }

          // 读取并返回原始源代码
          const sourceCode = fs.readFileSync(sourceFile, 'utf8');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(sourceCode);
        } catch (e: any) {
          console.error('Source file error:', e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    }
  };
}

function unsetReferenceApiPlugin(): Plugin {
  return {
    name: 'unset-reference-api-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/unset-reference', (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', () => {
          try {
            const { path: targetPath } = JSON.parse(body);
            
            if (!targetPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing path parameter' }));
              return;
            }

            // Validate path
            if (targetPath.includes('..') || targetPath.startsWith('/')) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Invalid path' }));
              return;
            }

            const srcDir = path.resolve(process.cwd(), 'src', targetPath);

            if (!fs.existsSync(srcDir)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Directory not found' }));
              return;
            }

            // Check if this is a reference item
            const folderName = path.basename(srcDir);
            if (!folderName.startsWith('ref-')) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: '该项目不是参考项目' }));
              return;
            }

            // Rename folder: remove 'ref-' prefix
            const newFolderName = folderName.substring(4); // Remove 'ref-'
            const parentDir = path.dirname(srcDir);
            const newSrcDir = path.join(parentDir, newFolderName);

            // Check if target name already exists
            if (fs.existsSync(newSrcDir)) {
              res.statusCode = 409;
              res.end(JSON.stringify({ error: '同名项目已存在' }));
              return;
            }

            fs.renameSync(srcDir, newSrcDir);

            // Update entries.json
            const entriesPath = path.resolve(process.cwd(), 'entries.json');
            if (fs.existsSync(entriesPath)) {
              const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
              // Update the key in entries
              // e.g., 'elements/ref-button' -> 'elements/button'
              const oldKey = targetPath; // e.g., 'elements/ref-button'
              const newKey = targetPath.replace(/\/ref-/, '/'); // e.g., 'elements/button'
              
              if (entries.js && entries.js[oldKey]) {
                entries.js[newKey] = entries.js[oldKey];
                delete entries.js[oldKey];
                fs.writeFileSync(entriesPath, JSON.stringify(entries, null, 2));
              }
            }

            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
          } catch (e: any) {
            console.error('Unset reference error:', e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    }
  };
}

function themesApiPlugin(): Plugin {
  return {
    name: 'themes-api-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url.startsWith('/api/themes')) {
          return next();
        }

        // DELETE /api/themes/:name - 删除主题
        if (req.method === 'DELETE' && req.url !== '/api/themes' && req.url !== '/api/themes/') {
          try {
            const themeName = req.url.replace('/api/themes/', '').split('?')[0];
            if (!themeName) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing theme name' }));
              return;
            }

            const themesDir = path.resolve(__dirname, 'src/themes');
            const themeDir = path.join(themesDir, themeName);

            // 安全检查
            if (!themeDir.startsWith(themesDir)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Forbidden' }));
              return;
            }

            if (!fs.existsSync(themeDir)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Theme not found' }));
              return;
            }

            fs.rmSync(themeDir, { recursive: true, force: true });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (error: any) {
            console.error('Error deleting theme:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        // GET 请求处理
        if (req.method !== 'GET') {
          return next();
        }

        // 处理 /api/themes/:name 端点用于获取单个主题内容
        if (req.url !== '/api/themes' && req.url !== '/api/themes/') {
          try {
            const themeName = req.url.replace('/api/themes/', '').split('?')[0];
            if (!themeName) {
              return next();
            }

            const themesDir = path.resolve(__dirname, 'src/themes');
            const themeDir = path.join(themesDir, themeName);

            // 安全检查：确保路径在 themes 目录内
            if (!themeDir.startsWith(themesDir)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Forbidden' }));
              return;
            }

            if (fs.existsSync(themeDir) && fs.statSync(themeDir).isDirectory()) {
              const designTokenPath = path.join(themeDir, 'designToken.json');
              const indexHtmlPath = path.join(themeDir, 'index.html');
              
              const themeData: any = { name: themeName, displayName: themeName };
              
              if (fs.existsSync(designTokenPath)) {
                try {
                  const designToken = JSON.parse(fs.readFileSync(designTokenPath, 'utf8'));
                  themeData.designToken = designToken;
                  if (designToken && designToken.name) {
                    themeData.displayName = designToken.name;
                  }
                } catch (e) {
                  console.error('Error parsing designToken.json:', e);
                }
              }
              
              if (fs.existsSync(indexHtmlPath)) {
                themeData.indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
              }
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(themeData));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Theme not found' }));
            }
          } catch (error: any) {
            console.error('Error loading theme:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
          return;
        }

        // 处理 /api/themes 端点用于获取主题列表
        try {
          const themesDir = path.resolve(__dirname, 'src/themes');
          const themes: any[] = [];

          if (fs.existsSync(themesDir)) {
            const items = fs.readdirSync(themesDir, { withFileTypes: true });
            
            items.forEach(item => {
              // 只读取第一层目录
              if (item.isDirectory()) {
                const themeDir = path.join(themesDir, item.name);
                const designTokenPath = path.join(themeDir, 'designToken.json');
                let displayName = item.name;

                if (fs.existsSync(designTokenPath)) {
                  try {
                    const designToken = JSON.parse(fs.readFileSync(designTokenPath, 'utf8'));
                    if (designToken && designToken.name) {
                      displayName = designToken.name;
                    }
                  } catch (e) {
                    console.error(`Error loading theme ${item.name} designToken:`, e);
                  }
                }

                themes.push({
                  name: item.name,
                  displayName: displayName
                });
              }
            });
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(themes));
        } catch (error: any) {
          console.error('Error loading themes:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    }
  };
}

// 读取配置文件
const configPath = path.resolve(process.cwd(), 'axhub.config.json');
let axhubConfig = { server: { host: 'localhost', port: 51720, allowLAN: true } };
if (fs.existsSync(configPath)) {
  try {
    axhubConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.warn('Failed to parse axhub.config.json, using defaults:', e);
  }
}

const entriesPath = path.resolve(process.cwd(), 'entries.json');
let entries = { js: {}, html: {} };
if (fs.existsSync(entriesPath)) {
  entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
}

const entryKey = process.env.ENTRY_KEY;
const jsEntries = entries.js as Record<string, string>;
const htmlEntries = entries.html as Record<string, string>;

const hasSingleEntry = typeof entryKey === 'string' && entryKey.length > 0;
let rollupInput: Record<string, string> = htmlEntries;

if (hasSingleEntry) {
  if (!jsEntries[entryKey as string]) {
    throw new Error(`ENTRY_KEY=${entryKey} 未在 entries.js 中找到对应入口文件`);
  }
  rollupInput = { [entryKey as string]: jsEntries[entryKey as string] };
}

const isIifeBuild = hasSingleEntry;

const config: any = {
  plugins: [
    tailwindcss(), // Tailwind CSS Vite 插件
    writeDevServerInfoPlugin(), // 写入开发服务器信息
    serveAdminPlugin(), // 服务 admin 目录（需要在最前面）
    injectStablePageIds(), // 注入稳定 ID（所有模式都启用）
    virtualHtmlPlugin(),
    websocketPlugin(),
    versionApiPlugin(), // 提供 /api/version 端点
    downloadDistPlugin(), // 提供 /api/download-dist 端点
    docsApiPlugin(), // 提供 /api/docs 端点
    uploadDocsApiPlugin(),
    sourceApiPlugin(), // 提供 /api/source 端点
    unsetReferenceApiPlugin(), // 提供 /api/unset-reference 端点
    themesApiPlugin(), // 提供 /api/themes 端点
    fileSystemApiPlugin(),
    dataManagementApiPlugin(), // 提供 /api/data 端点
    mediaManagementApiPlugin(), // 提供 /api/media 端点
    codeReviewPlugin(), // 提供 /api/code-review 端点
    mcpInstallPlugin(), // 提供 /api/install-mcp 端点
    autoDebugPlugin(), // 提供自动调试 API 端点
    configApiPlugin(), // 提供 /api/config 端点
    aiCliPlugin(), // 提供 /api/ai 端点
    gitVersionApiPlugin(), // 提供 /api/git 端点（Git 版本管理）
    forceInlineDynamicImportsOff(isIifeBuild),
    isIifeBuild
      ? react({
        jsxRuntime: 'classic',
        babel: { configFile: false, babelrc: false }
      })
      : null,
    isIifeBuild ? addAxhubMarker() : null,
    isIifeBuild ? axhubComponentEnforcer(jsEntries[entryKey as string]) : null
  ].filter(Boolean) as Plugin[],

  root: 'src',

  optimizeDeps: {
    exclude: ['react', 'react-dom']
  },

  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // spec-template 需要真正的 React，不使用 shim
      !isIifeBuild && {
        find: /^react$/,
        replacement: (id: string, importer?: string) => {
          // 如果是从 spec-template 导入，使用真正的 React
          if (importer && importer.includes('/spec-template/')) {
            return 'react';
          }
          return path.resolve(__dirname, 'src/common/react-shim.js');
        }
      },
      !isIifeBuild && {
        find: /^react-dom$/,
        replacement: (id: string, importer?: string) => {
          // 如果是从 spec-template 导入，使用真正的 React DOM
          if (importer && importer.includes('/spec-template/')) {
            return 'react-dom';
          }
          return path.resolve(__dirname, 'src/common/react-dom-shim.js');
        }
      },
      !isIifeBuild && {
        find: /^react\/.*/,
        replacement: path.resolve(__dirname, 'src/common/react-shim.js')
      },
      !isIifeBuild && {
        find: /^react-dom\/.*/,
        replacement: path.resolve(__dirname, 'src/common/react-dom-shim.js')
      }
    ].filter(Boolean) as { find: string | RegExp; replacement: string | ((id: string, importer?: string) => string) }[]
  },

  server: {
    port: axhubConfig.server?.port || 51720,
    host: axhubConfig.server?.allowLAN !== false ? '0.0.0.0' : 'localhost', // 根据配置决定是否允许局域网访问
    open: true, // 启动时自动打开浏览器
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  },

  build: {
    outDir: path.resolve(process.cwd(), 'dist'),
    emptyOutDir: !isIifeBuild,
    target: isIifeBuild ? 'es2015' : 'esnext',
    assetsInlineLimit: 512 * 1024, // 512KB - 小于此大小的图片会被内联为 Base64

    rollupOptions: {
      input: rollupInput,

      external: isIifeBuild ? ['react', 'react-dom'] : [],

      output: {
        entryFileNames: (chunkInfo: { name: string }) => `${chunkInfo.name}.js`,
        format: isIifeBuild ? 'iife' : 'es',
        name: 'UserComponent',

        ...(isIifeBuild
          ? {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM'
            },
            generatedCode: { constBindings: false }
          }
          : {})
      }
    },

    minify: isIifeBuild ? 'esbuild' : false
  },

  esbuild: isIifeBuild
    ? {
      target: 'es2015',
      legalComments: 'none',
      keepNames: true
    }
    : {
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment'
    },

  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    root: '.',
  }
};

export default defineConfig(config);
