import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

export function handleIndexHtml(req: IncomingMessage, res: ServerResponse, devTemplate: string, htmlTemplate: string): boolean {
  if (req.url?.includes('/index.html')) {
    // 解析 URL 和查询参数
    const [urlWithoutQuery, queryString] = req.url.split('?');
    const urlPath = urlWithoutQuery.replace('/index.html', '');
    const pathParts = urlPath.split('/').filter(Boolean);
    
    // 解析版本参数
    const params = new URLSearchParams(queryString || '');
    const versionId = params.get('ver');

    console.log('[虚拟HTML] 请求路径:', req.url, '解析部分:', pathParts, '版本:', versionId);

    if (pathParts.length >= 2 && ['elements', 'pages', 'themes'].includes(pathParts[0])) {
      let tsxPath: string;
      let basePath: string;
      
      // 如果有版本参数，从 Git 版本目录读取
      if (versionId) {
        const gitVersionsDir = path.resolve(process.cwd(), '.git-versions', versionId);
        basePath = path.join(gitVersionsDir, 'src' + urlPath);
        tsxPath = path.join(basePath, 'index.tsx');
        console.log('[虚拟HTML] 从 Git 版本读取:', versionId, tsxPath);
      } else {
        // 否则从当前工作目录读取
        basePath = path.resolve(process.cwd(), 'src' + urlPath);
        tsxPath = path.join(basePath, 'index.tsx');
      }
      
      console.log('[虚拟HTML] 检查 TSX 文件:', tsxPath, '存在:', fs.existsSync(tsxPath));

      if (fs.existsSync(tsxPath)) {
        const type = pathParts[0];
        const name = pathParts[1];
        const title = versionId
          ? `${type === 'elements' ? 'Element' : type === 'pages' ? 'Page' : 'Theme'}: ${name} (版本: ${versionId}) - Dev Preview`
          : `${type === 'elements' ? 'Element' : type === 'pages' ? 'Page' : 'Theme'}: ${name} - Dev Preview`;

        let html = devTemplate.replace(/\{\{TITLE\}\}/g, title);
        
        // 如果是版本化访问，使用 @fs 加载绝对路径
        if (versionId) {
          html = html.replace(/\{\{ENTRY\}\}/g, `/@fs/${tsxPath}`);
        }
        
        // 正常的当前版本访问
        // Vite root 是 'src'，所以路径应该相对于 src 目录
        html = html.replace(/\{\{ENTRY\}\}/g, `${urlPath}/index.tsx`);

        const hackCssPath = path.resolve(process.cwd(), 'src' + urlPath + '/hack.css');
        if (fs.existsSync(hackCssPath)) {
          console.log('[虚拟HTML] 注入 hack.css:', hackCssPath);
          html = html.replace('</head>', '  <link rel="stylesheet" href="./hack.css">\n  </head>');
        }

        console.log('[虚拟HTML] ✅ 返回虚拟 HTML:', req.url);

        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 200;
        res.end(html);
        return true;
      } else if (versionId) {
        // 版本文件不存在
        const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>版本不存在</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .error-container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 500px;
      text-align: center;
    }
    h1 { color: #ff4d4f; margin-top: 0; }
    p { color: #666; line-height: 1.6; }
    .version-id { 
      background: #f0f0f0; 
      padding: 4px 8px; 
      border-radius: 4px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>❌ 版本文件不存在</h1>
    <p>版本 <span class="version-id">${versionId}</span> 的文件未找到。</p>
    <p>可能的原因：</p>
    <p>1. 版本文件尚未提取<br>2. 该版本不包含此页面<br>3. 服务器已重启，临时文件被清理</p>
    <p><strong>解决方法：</strong></p>
    <p>请先调用 <code>/api/git/build-version</code> 接口提取版本文件。</p>
  </div>
</body>
</html>
`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 404;
        res.end(errorHtml);
        return true;
      }
    }
  }
  
  return false;
}

