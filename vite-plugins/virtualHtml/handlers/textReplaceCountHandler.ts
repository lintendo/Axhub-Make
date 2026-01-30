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

type TextReplacement = { searchText: string };

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

async function countMatchesBatch(dirPath: string, replacements: TextReplacement[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const files = await getAllFilePaths(dirPath);

  const searchTexts = replacements
    .map(item => item.searchText)
    .filter(text => typeof text === 'string' && text.length > 0);

  searchTexts.forEach(text => {
    counts[text] = 0;
  });

  if (searchTexts.length === 0) return counts;

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      for (const searchText of searchTexts) {
        const count = content.split(searchText).length - 1;
        if (count > 0) {
          counts[searchText] += count;
        }
      }
    } catch (err) {
      console.error(`无法读取文件: ${file}`, err);
    }
  }

  return counts;
}

export function handleTextReplaceCount(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'POST' && req.url?.startsWith('/api/text-replace/count')) {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { path: targetPath, searchText, searchTexts, replacements } = JSON.parse(body);
        
        if (!targetPath || (!searchText && !Array.isArray(searchTexts) && !Array.isArray(replacements))) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'path and search text data are required' }));
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

        if (Array.isArray(replacements) || Array.isArray(searchTexts)) {
          const list = Array.isArray(replacements)
            ? replacements
                .filter((item: any) => item && typeof item.searchText === 'string')
                .map((item: any) => ({ searchText: String(item.searchText) }))
            : (searchTexts || [])
                .filter((item: any) => typeof item === 'string')
                .map((item: any) => ({ searchText: String(item) }));

          if (list.length === 0) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'searchTexts is empty' }));
            return;
          }

          const countsMap = await countMatchesBatch(fullPath, list);
          const totalCount = Object.values(countsMap).reduce((sum, value) => sum + value, 0);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, counts: countsMap, totalCount }));
          return;
        }

        const count = await countMatches(fullPath, searchText);
        console.log(`[API] 统计文本 "${searchText}" 出现次数: ${count}`);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, count, totalCount: count }));
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
