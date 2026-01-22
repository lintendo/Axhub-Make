import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { getDisplayName } from '../../utils/fileUtils';

export function handleEntriesApi(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url === '/api/entries.json') {
    try {
      console.log('\n🔍 实时扫描入口文件...');

      const root = path.resolve(process.cwd(), 'src');
      const groups = ['elements', 'pages'];
      const scannedEntries = { js: {} as Record<string, string>, html: {} as Record<string, string> };

      for (const group of groups) {
        const groupDir = path.join(root, group);
        if (!fs.existsSync(groupDir)) continue;
        
        const items = fs.readdirSync(groupDir);
        for (const name of items) {
          const folder = path.join(groupDir, name);
          if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) continue;

          const jsEntry = path.join(folder, 'index.tsx');
          const key = `${group}/${name}`;
          if (fs.existsSync(jsEntry)) {
            scannedEntries.js[key] = jsEntry;
            scannedEntries.html[key] = path.join(folder, 'index.html');
          }
        }
      }

      const entriesPath = path.resolve(process.cwd(), 'entries.json');
      fs.writeFileSync(entriesPath, JSON.stringify(scannedEntries, null, 2), 'utf8');
      console.log(`✅ 扫描完成，发现 ${Object.keys(scannedEntries.js).length} 个入口`);

      const result = {
        elements: [] as any[],
        pages: [] as any[]
      };

      Object.keys(scannedEntries.js).forEach(key => {
        if (key.startsWith('elements/')) {
          const name = key.replace('elements/', '');
          const filePath = scannedEntries.js[key];
          const displayName = getDisplayName(filePath);
          const isReference = name.startsWith('ref-');
          result.elements.push({
            name,
            displayName: displayName || name,
            demoUrl: `/${key}`,              // 新格式：/elements/button
            specUrl: `/${key}/spec`,         // 新格式：/elements/button/spec
            jsUrl: `/build/${key}.js`,
            isReference
          });
        }
      });

      Object.keys(scannedEntries.js).forEach(key => {
        if (key.startsWith('pages/')) {
          const name = key.replace('pages/', '');
          const filePath = scannedEntries.js[key];
          const displayName = getDisplayName(filePath);
          const isReference = name.startsWith('ref-');
          result.pages.push({
            name,
            displayName: displayName || name,
            demoUrl: `/${key}`,              // 新格式：/pages/ref-antd
            specUrl: `/${key}/spec`,         // 新格式：/pages/ref-antd/spec
            jsUrl: `/build/${key}.js`,
            isReference
          });
        }
      });

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(result, null, 2));
      return true;
    } catch (err) {
      console.error('生成 entries.json API 失败:', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
      return true;
    }
  }
  
  return false;
}
