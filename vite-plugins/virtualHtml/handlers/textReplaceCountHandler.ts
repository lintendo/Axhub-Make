import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

const TARGET_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

async function getAllFilePaths(dirPath: string): Promise<string[]> {
  let files: string[] = [];
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        files = files.concat(await getAllFilePaths(fullPath));
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (TARGET_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error(`读取目录失败: ${dirPath}`, err);
  }
  return files;
}

async function countMatches(dirPath: string, searchText: string): Promise<number> {
  let totalCount = 0;
  const files = await getAllFilePaths(dirPath);

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      const count = content.split(searchText).length - 1;
      if (count > 0) {
        totalCount += count;
      }
    } catch (err) {
      console.error(`无法读取文件: ${file}`, err);
    }
  }

  return totalCount;
}

export function handleTextReplaceCount(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'POST' && req.url?.startsWith('/api/text-replace/count')) {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { path: targetPath, searchText } = JSON.parse(body);
        
        if (!targetPath || !searchText) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'path and searchText are required' }));
          return;
        }

        const pathParts = targetPath.split('/').filter(Boolean);
        if (pathParts.length < 2 || !['elements', 'pages'].includes(pathParts[0])) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid path format. Expected: elements/xxx or pages/xxx' }));
          return;
        }

        const fullPath = path.resolve(process.cwd(), 'src', targetPath);
        
        if (!fs.existsSync(fullPath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Path not found' }));
          return;
        }

        const count = await countMatches(fullPath, searchText);
        console.log(`[API] 统计文本 "${searchText}" 出现次数: ${count}`);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, count }));
      } catch (err) {
        console.error('[API] ❌ 统计文本失败:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Failed to count text matches' }));
      }
    });
    
    return true;
  }
  
  return false;
}
