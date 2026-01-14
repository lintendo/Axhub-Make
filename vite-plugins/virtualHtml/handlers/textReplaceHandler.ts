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

async function replaceMatches(dirPath: string, searchText: string, replaceText: string): Promise<number> {
  let changedFilesCount = 0;
  const files = await getAllFilePaths(dirPath);

  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      if (content.includes(searchText)) {
        const newContent = content.replaceAll(searchText, replaceText);
        await fs.promises.writeFile(file, newContent, 'utf-8');
        console.log(`[API] ✅ 已修改: ${file}`);
        changedFilesCount++;
      }
    } catch (err) {
      console.error(`处理文件失败: ${file}`, err);
    }
  }

  return changedFilesCount;
}

export function handleTextReplace(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'POST' && req.url?.startsWith('/api/text-replace/replace')) {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { path: targetPath, searchText, replaceText } = JSON.parse(body);
        
        if (!targetPath || !searchText || replaceText === undefined) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'path, searchText, and replaceText are required' }));
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

        const changedFiles = await replaceMatches(fullPath, searchText, replaceText);
        console.log(`[API] 替换完成: 共修改了 ${changedFiles} 个文件`);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, changedFiles }));
      } catch (err) {
        console.error('[API] ❌ 替换文本失败:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Failed to replace text' }));
      }
    });
    
    return true;
  }
  
  return false;
}
