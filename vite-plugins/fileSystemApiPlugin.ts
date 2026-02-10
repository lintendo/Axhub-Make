import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import { IncomingMessage } from 'http';
import formidable from 'formidable';
import extractZip from 'extract-zip';
import archiver from 'archiver';
import { exec, execSync } from 'child_process';

/**
 * 递归复制目录（用于 Windows 权限问题的备用方案）
 * 
 * 当 fs.renameSync() 因权限问题失败时（EPERM 错误），使用此函数作为 fallback。
 * 
 * 为什么 copy 比 rename 更可靠？
 * - rename：只修改文件系统元数据（inode），对权限和文件占用非常敏感
 * - copy：实际读取和写入数据，只要文件可读就能复制，绕过了很多权限限制
 * 
 * 常见触发场景：
 * - Windows 杀毒软件扫描导致文件被锁定
 * - 跨驱动器移动文件（rename 不支持）
 * - 文件索引服务占用文件句柄
 * - 路径包含中文字符导致的编码问题
 * 
 * @param src - 源目录路径
 * @param dest - 目标目录路径
 */
function copyDirRecursive(src: string, dest: string) {
  // 确保目标目录存在
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  // 读取源目录的所有内容
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  // 逐个处理文件和子目录
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      // 递归处理子目录
      copyDirRecursive(srcPath, destPath);
    } else {
      // 复制文件
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const IGNORED_EXTRACT_ENTRIES = new Set(['__MACOSX', '.DS_Store']);

function truncateName(name: string, maxLength: number) {
  return name.length > maxLength ? name.slice(0, maxLength) : name;
}

function sanitizeFolderName(name: string) {
  return name
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function inferExtractedRootFolder(extractDir: string) {
  if (!fs.existsSync(extractDir)) {
    return { entryCount: 0, hasRootFolder: false, rootFolderName: '' };
  }

  const entries = fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter(entry => !IGNORED_EXTRACT_ENTRIES.has(entry.name));

  if (entries.length === 1 && entries[0].isDirectory()) {
    return { entryCount: entries.length, hasRootFolder: true, rootFolderName: entries[0].name };
  }

  return { entryCount: entries.length, hasRootFolder: false, rootFolderName: '' };
}

function sanitizeRelativePath(input: string) {
  const normalized = input.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(part => part && part !== '.' && part !== '..');
  return parts.join('/');
}

function deriveRootFolderName(paths: string[]) {
  const roots = new Set<string>();
  for (const rawPath of paths) {
    const cleaned = sanitizeRelativePath(rawPath);
    if (!cleaned) continue;
    const [root] = cleaned.split('/');
    if (root) roots.add(root);
  }
  return roots.size === 1 ? Array.from(roots)[0] : '';
}

function hasIgnoredEntry(relativePath: string) {
  return relativePath.split('/').some(segment => IGNORED_EXTRACT_ENTRIES.has(segment));
}

function moveFileWithFallback(srcPath: string, destPath: string) {
  try {
    fs.renameSync(srcPath, destPath);
  } catch {
    fs.copyFileSync(srcPath, destPath);
    fs.unlinkSync(srcPath);
  }
}

/**
 * 文件系统 API 插件
 * 提供文件和目录的基本操作功能：删除、重命名、复制等
 */
export function fileSystemApiPlugin(): Plugin {
  return {
    name: 'filesystem-api',
    
    configureServer(server) {
      const projectRoot = process.cwd();
      
      // Helper function to parse JSON body
      const parseBody = (req: any): Promise<any> => {
        return new Promise((resolve, reject) => {
          let body = '';
          req.on('data', (chunk: any) => body += chunk);
          req.on('end', () => {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch (e) {
              reject(new Error('Invalid JSON in request body'));
            }
          });
          req.on('error', reject);
        });
      };

      // Helper function to send JSON response
      const sendJSON = (res: any, statusCode: number, data: any) => {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
      };

      const normalizePath = (filePath: string) => filePath.split(path.sep).join('/');

      const scanThemeReferences = (themeName: string) => {
        const referenceDirs = [
          path.join(projectRoot, 'src', 'elements'),
          path.join(projectRoot, 'src', 'pages'),
        ];
        const allowedExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.css']);
        const needles = [
          `themes/${themeName}/designToken.json`,
          `themes/${themeName}/globals.css`,
        ];
        const references = new Set<string>();

        const walkDir = (dirPath: string) => {
          if (!fs.existsSync(dirPath)) return;
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              walkDir(entryPath);
              continue;
            }

            const ext = path.extname(entry.name);
            if (!allowedExt.has(ext)) continue;

            const content = fs.readFileSync(entryPath, 'utf8');
            if (needles.some(needle => content.includes(needle))) {
              references.add(normalizePath(path.relative(projectRoot, entryPath)));
            }
          }
        };

        referenceDirs.forEach(walkDir);

        return Array.from(references).sort();
      };

      const scanItemReferences = (itemType: 'elements' | 'pages', itemName: string) => {
        const referenceDirs = [
          path.join(projectRoot, 'src', 'elements'),
          path.join(projectRoot, 'src', 'pages'),
        ];
        const allowedExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.css']);
        const references = new Set<string>();
        const escapedName = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(`(?:^|[\\\\/])${escapedName}(?:$|[\\\\/'"\\s])`);
        const targetDir = path.resolve(projectRoot, 'src', itemType, itemName);

        const walkDir = (dirPath: string) => {
          if (!fs.existsSync(dirPath)) return;
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              if (path.resolve(entryPath) === targetDir) {
                continue;
              }
              walkDir(entryPath);
              continue;
            }

            const ext = path.extname(entry.name);
            if (!allowedExt.has(ext)) continue;

            const content = fs.readFileSync(entryPath, 'utf8');
            if (nameRegex.test(content)) {
              references.add(normalizePath(path.relative(projectRoot, entryPath)));
            }
          }
        };

        referenceDirs.forEach(walkDir);

        return Array.from(references).sort();
      };

      // Helper function to update entries.json
      const updateEntriesJson = (oldKey?: string, newKey?: string, remove: boolean = false) => {
        const entriesPath = path.join(projectRoot, 'entries.json');
        if (!fs.existsSync(entriesPath)) return;

        try {
          const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
          let changed = false;

          if (remove && oldKey) {
            // 删除条目
            if (entries.js && entries.js[oldKey]) {
              delete entries.js[oldKey];
              changed = true;
            }
            if (entries.html && entries.html[oldKey]) {
              delete entries.html[oldKey];
              changed = true;
            }
          } else if (oldKey && newKey) {
            // 重命名或复制条目
            if (entries.js && entries.js[oldKey]) {
              const oldVal = entries.js[oldKey];
              entries.js[newKey] = typeof oldVal === 'string'
                ? oldVal.replace(oldKey, newKey)
                : oldVal;
              changed = true;
            }
            if (entries.html && entries.html[oldKey]) {
              const oldVal = entries.html[oldKey];
              entries.html[newKey] = typeof oldVal === 'string'
                ? oldVal.replace(oldKey, newKey)
                : oldVal;
              changed = true;
            }
          }

          if (changed) {
            fs.writeFileSync(entriesPath, JSON.stringify(entries, null, 2));
          }
        } catch (e) {
          console.error('[文件系统 API] 更新 entries.json 失败:', e);
        }
      };

      // 递归复制目录
      const copyDir = (src: string, dest: string) => {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          
          if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };

      // ==================== /api/themes/check-references ====================
      server.middlewares.use('/api/themes/check-references', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const { themeName } = await parseBody(req);
          if (!themeName || typeof themeName !== 'string') {
            return sendJSON(res, 400, { error: 'Missing themeName parameter' });
          }

          const themeDir = path.join(projectRoot, 'src', 'themes', themeName);
          if (!fs.existsSync(themeDir)) {
            return sendJSON(res, 404, { error: 'Theme not found' });
          }

          const references = scanThemeReferences(themeName);
          const designTokenPath = path.join(themeDir, 'designToken.json');
          const globalsPath = path.join(themeDir, 'globals.css');

          return sendJSON(res, 200, {
            themeName,
            references,
            hasReferences: references.length > 0,
            themeAssets: {
              hasDesignToken: fs.existsSync(designTokenPath),
              hasGlobals: fs.existsSync(globalsPath),
            },
          });
        } catch (e: any) {
          console.error('[文件系统 API] 检查主题引用失败:', e);
          return sendJSON(res, 500, { error: e.message || 'Check references failed' });
        }
      });

      server.middlewares.use('/api/themes/get-contents', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const { themeName } = await parseBody(req);
          if (!themeName || typeof themeName !== 'string') {
            return sendJSON(res, 400, { error: 'Missing themeName parameter' });
          }

          const themeDir = path.join(projectRoot, 'src', 'themes', themeName);
          if (!fs.existsSync(themeDir)) {
            return sendJSON(res, 404, { error: 'Theme not found' });
          }

          const designTokenPath = path.join(themeDir, 'designToken.json');
          const globalsPath = path.join(themeDir, 'globals.css');
          const specPath = path.join(themeDir, 'DESIGN-SPEC.md');

          return sendJSON(res, 200, {
            themeName,
            designToken: fs.existsSync(designTokenPath) ? fs.readFileSync(designTokenPath, 'utf8') : null,
            globalsCss: fs.existsSync(globalsPath) ? fs.readFileSync(globalsPath, 'utf8') : null,
            designSpec: fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : null,
          });
        } catch (e: any) {
          console.error('[文件系统 API] 获取主题内容失败:', e);
          return sendJSON(res, 500, { error: e.message || 'Get theme contents failed' });
        }
      });

      // ==================== /api/items/check-references ====================
      server.middlewares.use('/api/items/check-references', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const { itemType, itemName } = await parseBody(req);
          if (!itemType || !itemName || typeof itemType !== 'string' || typeof itemName !== 'string') {
            return sendJSON(res, 400, { error: 'Missing itemType or itemName parameter' });
          }

          if (itemType !== 'elements' && itemType !== 'pages') {
            return sendJSON(res, 400, { error: 'Invalid itemType' });
          }

          const itemDir = path.join(projectRoot, 'src', itemType, itemName);
          if (!fs.existsSync(itemDir)) {
            return sendJSON(res, 404, { error: 'Item not found' });
          }

          const references = scanItemReferences(itemType, itemName);

          return sendJSON(res, 200, {
            itemType,
            itemName,
            references,
            hasReferences: references.length > 0,
          });
        } catch (e: any) {
          console.error('[文件系统 API] 检查元素/页面引用失败:', e);
          return sendJSON(res, 500, { error: e.message || 'Check references failed' });
        }
      });

      // ==================== /api/delete ====================
      server.middlewares.use('/api/delete', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const { path: targetPath } = await parseBody(req);
          
          if (!targetPath) {
            return sendJSON(res, 400, { error: 'Missing path parameter' });
          }

          // 验证路径安全性
          if (targetPath.includes('..') || targetPath.startsWith('/')) {
            return sendJSON(res, 403, { error: 'Invalid path' });
          }

          const parts = String(targetPath).split('/').filter(Boolean);
          const isElementsOrPages = parts.length >= 2 && (parts[0] === 'elements' || parts[0] === 'pages');
          const deletePath = isElementsOrPages
            ? path.join(projectRoot, 'src', parts[0], parts[1])
            : path.join(projectRoot, 'src', targetPath);
          const entriesKey = isElementsOrPages ? `${parts[0]}/${parts[1]}` : targetPath;

          if (!fs.existsSync(deletePath)) {
            return sendJSON(res, 404, { error: 'Directory not found' });
          }

          // 检查是否是参考项目（文件夹名以 'ref-' 开头）
          const folderName = path.basename(deletePath);
          if (folderName.startsWith('ref-')) {
            return sendJSON(res, 403, { error: '参考项目无法删除，请先取消参考状态' });
          }

          // 删除目录
          fs.rmSync(deletePath, { recursive: true, force: true });
          
          // 更新 entries.json
          updateEntriesJson(entriesKey, undefined, true);

          sendJSON(res, 200, { success: true });
        } catch (e: any) {
          console.error('[文件系统 API] 删除失败:', e);
          sendJSON(res, 500, { error: e.message || 'Delete failed' });
        }
      });

      // ==================== /api/rename ====================
      server.middlewares.use('/api/rename', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const { path: targetPath, newName } = await parseBody(req);

          if (!targetPath || !newName) {
            return sendJSON(res, 400, { error: 'Missing path or newName parameter' });
          }

          // 验证路径安全性
          if (targetPath.includes('..') || targetPath.startsWith('/')) {
            return sendJSON(res, 403, { error: 'Invalid path' });
          }

          // 验证新名称格式
          const trimmedNewName = String(newName).trim();
          if (!trimmedNewName) {
            return sendJSON(res, 400, { error: 'Invalid newName format' });
          }
          if (trimmedNewName === '.' || trimmedNewName === '..') {
            return sendJSON(res, 400, { error: 'Invalid newName format' });
          }
          if (/[\r\n]/.test(trimmedNewName)) {
            return sendJSON(res, 400, { error: 'Invalid newName format' });
          }
          if (trimmedNewName.includes('*/')) {
            return sendJSON(res, 400, { error: 'Invalid newName format' });
          }
          if (/[/\\:*?"<>|]/.test(trimmedNewName)) {
            return sendJSON(res, 400, { error: 'Invalid newName format' });
          }

          // 解析路径
          const parts = String(targetPath).split('/').filter(Boolean);
          if (parts.length !== 2 || (parts[0] !== 'elements' && parts[0] !== 'pages')) {
            return sendJSON(res, 400, { error: 'Invalid path format' });
          }

          const group = parts[0];
          const itemName = parts[1];
          const itemDir = path.join(projectRoot, 'src', group, itemName);

          if (!fs.existsSync(itemDir)) {
            return sendJSON(res, 404, { error: 'Directory not found' });
          }

          const indexFiles = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];
          let indexFilePath: string | null = null;
          for (const fileName of indexFiles) {
            const filePath = path.join(itemDir, fileName);
            if (fs.existsSync(filePath)) {
              indexFilePath = filePath;
              break;
            }
          }

          if (!indexFilePath) {
            return sendJSON(res, 404, { error: 'Entry file not found' });
          }

          const nameLineRegex = /(^\s*\*\s*@(?:name|displayName)\s+)(.+)$/m;
          const content = fs.readFileSync(indexFilePath, 'utf8');
          let updatedContent = content;

          if (nameLineRegex.test(content)) {
            updatedContent = content.replace(nameLineRegex, `$1${trimmedNewName}`);
          } else {
            updatedContent = `/**\n * @name ${trimmedNewName}\n */\n${content}`;
          }

          if (updatedContent !== content) {
            fs.writeFileSync(indexFilePath, updatedContent, 'utf8');
          }

          sendJSON(res, 200, { success: true });
        } catch (e: any) {
          console.error('[文件系统 API] 重命名失败:', e);
          sendJSON(res, 500, { error: e.message || 'Rename failed' });
        }
      });

      // ==================== /api/upload ====================
      server.middlewares.use('/api/upload', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const form = formidable({
            uploadDir: path.join(projectRoot, 'temp'),
            keepExtensions: true,
            multiples: true,
            maxFileSize: 100 * 1024 * 1024, // 100MB
          });

          form.parse(req, async (err: any, fields: any, files: any) => {
            if (err) {
              console.error('[文件系统 API] 上传解析失败:', err);
              return sendJSON(res, 500, { error: 'Upload parsing failed' });
            }

            try {
              // 提取字段值（处理数组和单值）
              const getFieldValue = (field: any) => Array.isArray(field) ? field[0] : field;
              
              const uploadType = getFieldValue(fields.uploadType);
              const targetType = getFieldValue(fields.targetType);
              const uploadMode = getFieldValue(fields.uploadMode);
              const folderNameField = getFieldValue(fields.folderName);
              const targetTypeRequired = uploadType !== 'local_axure';
              
              const normalizeFiles = (value: any) => {
                if (!value) return [];
                return Array.isArray(value) ? value : [value];
              };

              let fileList = normalizeFiles(files.files);
              if (fileList.length === 0) fileList = normalizeFiles(files.file);
              if (fileList.length === 0 && fields.file) {
                fileList = normalizeFiles(fields.file);
              }

              const isFolderUpload = uploadMode === 'folder' || fileList.length > 1;

              console.log('[文件系统 API] 原始文件对象:', {
                hasFilesFile: !!files.file,
                hasFilesFiles: !!files.files,
                hasFieldsFile: !!fields.file,
                fileCount: fileList.length,
                uploadMode,
                isFolderUpload,
              });

              console.log('[文件系统 API] 接收到的参数:', {
                uploadType,
                targetType,
                hasFile: fileList.length > 0,
                fileInfo: fileList.length > 0 ? { filepath: fileList[0]?.filepath, originalFilename: fileList[0]?.originalFilename } : null,
                fieldsKeys: Object.keys(fields),
                filesKeys: Object.keys(files)
              });

              if (!fileList.length || !uploadType || (targetTypeRequired && !targetType)) {
                console.error('[文件系统 API] 缺少必需参数:', { 
                  hasFile: fileList.length > 0, 
                  uploadType, 
                  targetType,
                  fileType: fileList.length > 0 ? typeof fileList[0] : 'undefined'
                });
                return sendJSON(res, 400, { 
                  error: 'Missing required parameters',
                  details: {
                    hasFile: fileList.length > 0,
                    hasUploadType: !!uploadType,
                    hasTargetType: !!targetType,
                    targetTypeRequired
                  }
                });
              }
              
              if (targetTypeRequired && !['pages', 'elements'].includes(String(targetType))) {
                return sendJSON(res, 400, { error: 'Invalid targetType' });
              }

              const primaryFile = fileList[0];
              const tempFilePath = primaryFile?.filepath || primaryFile?.path || primaryFile?.tempFilePath;
              const originalFilename = primaryFile?.originalFilename || primaryFile?.name || primaryFile?.filename || 'upload.zip';

              console.log('[文件系统 API] 文件信息:', {
                tempFilePath,
                originalFilename,
                fileCount: fileList.length,
                isFolderUpload,
              });

              if (!isFolderUpload) {
                if (!tempFilePath || !fs.existsSync(tempFilePath)) {
                  return sendJSON(res, 500, { error: '临时文件不存在' });
                }

                if (fs.statSync(tempFilePath).size === 0) {
                  return sendJSON(res, 500, { error: '上传的文件为空' });
                }
              } else {
                const missingFile = fileList.find((file: any) => !file?.filepath || !fs.existsSync(file.filepath));
                if (missingFile) {
                  return sendJSON(res, 500, { error: '上传的文件夹存在缺失文件，请重试' });
                }
              }

              const relativePaths = normalizeFiles(fields.relativePaths).map((value: any) => String(value));
              const derivedRootName = deriveRootFolderName(relativePaths);

              // AI 辅助类型：local_axure（解压到 temp 并返回 Prompt）
              if (uploadType === 'local_axure') {
                if (isFolderUpload) {
                  return sendJSON(res, 400, { error: 'local_axure 暂不支持文件夹上传，请使用 ZIP 文件' });
                }
                try {
                  const scriptPath = path.join(projectRoot, 'scripts', 'local-axure-extract.mjs');
                  const command = `node "${scriptPath}" "${tempFilePath}" "${originalFilename}"`;

                  const rawOutput = execSync(command, {
                    cwd: projectRoot,
                    encoding: 'utf8',
                    stdio: 'pipe'
                  }).trim();

                  const lastLine = rawOutput.split('\n').filter(Boolean).slice(-1)[0] || rawOutput;
                  const extracted = JSON.parse(lastLine) as { extractDir: string; contentDir?: string };
                  const filePath = extracted.contentDir || extracted.extractDir;

                  // 清理临时 zip
                  fs.unlinkSync(tempFilePath);

                  const skillDoc = '/skills/local-axure-workflow/SKILL.md';
                  const targetHint = targetType ? `\n\n建议输出目录：\`src/${targetType}\`` : '';

                  return sendJSON(res, 200, {
                    success: true,
                    uploadType,
                    filePath,
                    prompt: `本地 Axure ZIP 已上传并解压完成。\n\n解压目录：\`${filePath}\`\n\n请阅读技能文档：\n- \`${skillDoc}\`${targetHint}\n\n开始执行前：先根据 skill 的用户交互指南用简短中文回复用户，确认需求（目标范围/输出类型/是否允许优化等）。\n\n请按技能文档流程，从解压目录中提取主题/数据/文档并还原页面/元素。`,
                    message: '文件已解压，请复制 Prompt 交给 AI 处理'
                  });
                } catch (e: any) {
                  console.error('[文件系统 API] local_axure 解压失败:', e);
                  return sendJSON(res, 500, { error: `解压失败: ${e.message}` });
                }
              }

              let folderUploadContext: {
                tempExtractDir: string;
                inferred: { entryCount: number; hasRootFolder: boolean; rootFolderName: string };
                fallbackName: string;
              } | null = null;

              if (isFolderUpload) {
                try {
                  const tempExtractDir = path.join(projectRoot, 'temp', `folder-upload-${Date.now()}`);
                  fs.mkdirSync(tempExtractDir, { recursive: true });

                  const fallbackSource = folderNameField || derivedRootName || `upload-${Date.now()}`;
                  const fallbackName = truncateName(sanitizeFolderName(fallbackSource), 60) || `upload-${Date.now()}`;

                  fileList.forEach((file: any, index: number) => {
                    const sourcePath = file?.filepath || file?.path || file?.tempFilePath;
                    if (!sourcePath || !fs.existsSync(sourcePath)) return;

                    const rawRelativePath = relativePaths[index] || file?.originalFilename || file?.name || `file-${index}`;
                    const safeRelativePath = sanitizeRelativePath(String(rawRelativePath));
                    if (!safeRelativePath || hasIgnoredEntry(safeRelativePath)) {
                      fs.unlinkSync(sourcePath);
                      return;
                    }

                    const destPath = path.join(tempExtractDir, safeRelativePath);
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(sourcePath, destPath);
                    fs.unlinkSync(sourcePath);
                  });

                  const inferred = inferExtractedRootFolder(tempExtractDir);
                  if (inferred.entryCount === 0) {
                    return sendJSON(res, 500, { error: '上传的文件夹为空' });
                  }

                  folderUploadContext = {
                    tempExtractDir,
                    inferred,
                    fallbackName
                  };
                } catch (e: any) {
                  console.error('[文件系统 API] 文件夹处理失败:', e);
                  return sendJSON(res, 500, { error: `文件夹处理失败: ${e.message || '未知错误'}` });
                }
              }

              // 直接处理类型：make, axhub, google_stitch
              if (['make', 'axhub', 'google_stitch'].includes(uploadType)) {
                try {
                  // 解压到临时目录（先解压再分析目录结构，避免依赖 ZIP 条目解析）
                  const tempExtractDir = isFolderUpload
                    ? folderUploadContext!.tempExtractDir
                    : path.join(projectRoot, 'temp', `extract-${Date.now()}`);

                  if (!isFolderUpload) {
                    fs.mkdirSync(tempExtractDir, { recursive: true });
                    await extractZip(tempFilePath, { dir: tempExtractDir });
                  }

                  const inferred = isFolderUpload
                    ? folderUploadContext!.inferred
                    : inferExtractedRootFolder(tempExtractDir);
                  if (inferred.entryCount === 0) {
                    throw new Error('ZIP 文件为空');
                  }

                  const extractedRootFolderName = inferred.rootFolderName;
                  const hasRootFolder = inferred.hasRootFolder;

                  const basename = isFolderUpload
                    ? folderUploadContext!.fallbackName
                    : path.basename(originalFilename, path.extname(originalFilename));
                  const fallbackFolderName = truncateName(sanitizeFolderName(basename), 60);
                  const safeFallbackFolderName = fallbackFolderName || `upload-${Date.now()}`;
                  const targetFolderName = hasRootFolder
                    ? truncateName(extractedRootFolderName, 60)
                    : safeFallbackFolderName;

                  const targetBaseDir = path.join(projectRoot, 'src', targetType);
                  const targetDir = path.join(targetBaseDir, targetFolderName);
                  const resolvedTargetBase = path.resolve(targetBaseDir);
                  const resolvedTargetDir = path.resolve(targetDir);

                  // 防止覆盖整个 pages/elements 目录或越界写入
                  if (resolvedTargetDir === resolvedTargetBase || !resolvedTargetDir.startsWith(resolvedTargetBase + path.sep)) {
                    throw new Error('目标目录不安全，已阻止解压');
                  }

                  console.log('[文件系统 API] ZIP 结构分析:', {
                    hasRootFolder,
                    rootFolderName: extractedRootFolderName,
                    targetDir,
                    entriesCount: inferred.entryCount
                  });

                  // 如果目标目录已存在，直接删除（覆盖）
                  if (fs.existsSync(targetDir)) {
                    fs.rmSync(targetDir, { recursive: true, force: true });
                  }

                  // 🔧 Windows 兼容性修复：等待杀毒软件释放文件
                  // 在 Windows 上，解压后杀毒软件（如 Windows Defender）会立即扫描新文件
                  // 导致文件被短暂锁定，此时执行 rename 会触发 EPERM 错误
                  // 延迟 500ms 让杀毒软件完成扫描，大幅降低权限错误的概率
                  await new Promise(resolve => setTimeout(resolve, 500));

                  // 移动到目标目录（使用复制+删除方式作为 fallback，避免 Windows 权限问题）
                  if (hasRootFolder) {
                    // 有根目录：移动根目录
                    const extractedRoot = path.join(tempExtractDir, extractedRootFolderName);
                    if (fs.existsSync(extractedRoot)) {
                      try {
                        // 优先尝试 rename（快速路径，毫秒级完成）
                        // rename 只修改文件系统元数据，不移动实际数据，性能最优
                        fs.renameSync(extractedRoot, targetDir);
                      } catch (renameError: any) {
                        // rename 失败则使用复制+删除（兼容路径，秒级完成）
                        // 虽然慢，但能处理跨驱动器、权限问题等 rename 无法处理的情况
                        console.warn('[文件系统] rename 失败，使用复制方式:', renameError.message);
                        copyDirRecursive(extractedRoot, targetDir);
                        fs.rmSync(extractedRoot, { recursive: true, force: true });
                      }
                    } else {
                      throw new Error('解压后找不到根目录');
                    }
                  } else {
                    // 没有根目录：直接移动整个解压目录
                    try {
                      // 优先尝试 rename（快速路径）
                      fs.renameSync(tempExtractDir, targetDir);
                    } catch (renameError: any) {
                      // rename 失败则使用复制+删除（兼容路径）
                      console.warn('[文件系统] rename 失败，使用复制方式:', renameError.message);
                      copyDirRecursive(tempExtractDir, targetDir);
                      fs.rmSync(tempExtractDir, { recursive: true, force: true });
                    }
                  }

                  // 清理临时文件
                  if (fs.existsSync(tempExtractDir)) {
                    fs.rmSync(tempExtractDir, { recursive: true, force: true });
                  }
                  if (!isFolderUpload) {
                    fs.unlinkSync(tempFilePath);
                  }

                  // 根据类型执行转换脚本
                  if (uploadType === 'axhub') {
                    // Chrome 扩展：执行转换脚本
                    const scriptPath = path.join(projectRoot, 'scripts', 'chrome-export-converter.mjs');
                    const command = `node "${scriptPath}" "${targetDir}" "${targetFolderName}"`;
                    
                    exec(command, (error: any, stdout: any, stderr: any) => {
                      if (error) {
                        console.error('[Chrome 转换] 执行失败:', error);
                      } else {
                        console.log('[Chrome 转换] 完成:', stdout);
                      }
                      if (stderr) console.error('[Chrome 转换] 错误:', stderr);
                    });
                  } else if (uploadType === 'google_stitch') {
                    // Stitch：执行转换脚本
                    const scriptPath = path.join(projectRoot, 'scripts', 'stitch-converter.mjs');
                    const command = `node "${scriptPath}" "${targetDir}" "${targetFolderName}"`;
                    
                    exec(command, (error: any, stdout: any, stderr: any) => {
                      if (error) {
                        console.error('[Stitch 转换] 执行失败:', error);
                      } else {
                        console.log('[Stitch 转换] 完成:', stdout);
                      }
                      if (stderr) console.error('[Stitch 转换] 错误:', stderr);
                    });
                  }

                  return sendJSON(res, 200, {
                    success: true,
                    message: '上传并解压成功',
                    folderName: targetFolderName,
                    path: `${targetType}/${targetFolderName}`,
                    hint: '如果页面无法预览，让 AI 处理即可'
                  });
                } catch (e: any) {
                  console.error('[文件系统 API] 解压失败:', e);
                  if (e?.code === 'ENAMETOOLONG') {
                    return sendJSON(res, 500, {
                      error:
                        '解压失败：ZIP 内部路径过长（超出系统限制）。请解压后上传文件夹，或缩短文件名后重试。',
                    });
                  }
                  return sendJSON(res, 500, { error: `解压失败: ${e.message}` });
                }
              }

              // AI 处理类型：v0, google_aistudio
              if (['v0', 'google_aistudio'].includes(uploadType)) {
                try {
                  // 解压到 temp 目录
                  const timestamp = Date.now();
                  const basename = isFolderUpload
                    ? (folderUploadContext?.fallbackName || folderNameField || derivedRootName || `upload-${timestamp}`)
                    : path.basename(originalFilename, path.extname(originalFilename));
                  const extractDirName = `${uploadType}-${truncateName(sanitizeFolderName(basename), 40)}-${timestamp}`;
                  const extractDir = isFolderUpload
                    ? (folderUploadContext!.inferred.hasRootFolder
                        ? path.join(folderUploadContext!.tempExtractDir, folderUploadContext!.inferred.rootFolderName)
                        : folderUploadContext!.tempExtractDir)
                    : path.join(projectRoot, 'temp', extractDirName);

                  if (!isFolderUpload) {
                    fs.mkdirSync(extractDir, { recursive: true });
                    await extractZip(tempFilePath, { dir: extractDir });
                    fs.unlinkSync(tempFilePath);
                  }

                  // V0 项目：自动执行预处理脚本（同步等待完成）
                  if (uploadType === 'v0') {
                    const scriptPath = path.join(projectRoot, 'scripts', 'v0-converter.mjs');
                    const pageName = basename
                      .replace(/[^a-z0-9-]/gi, '-')
                      .replace(/-+/g, '-')
                      .replace(/^-|-$/g, '')
                      .toLowerCase();
                    
                    const command = `node "${scriptPath}" "${extractDir}" "${pageName}"`;
                    
                    console.log('[V0 转换] 执行预处理脚本:', command);
                    
                    // 使用 execSync 同步执行，等待完成
                    try {
                      const output = execSync(command, {
                        cwd: projectRoot,
                        encoding: 'utf8',
                        stdio: 'pipe'
                      });
                      
                      console.log('[V0 转换] 执行成功:', output);
                      
                      // 验证任务文档是否生成
                      const tasksFilePath = path.join(projectRoot, 'src', targetType, pageName, '.v0-tasks.md');
                      if (!fs.existsSync(tasksFilePath)) {
                        throw new Error('任务文档生成失败');
                      }
                      
                      // 返回任务文档路径
                      const tasksFileRelPath = `src/${targetType}/${pageName}/.v0-tasks.md`;
                      const ruleFile = '/rules/v0-project-converter.md';
                      
                      return sendJSON(res, 200, {
                        success: true,
                        uploadType,
                        pageName,
                        tasksFile: tasksFileRelPath,
                        ruleFile,
                        prompt: `V0 项目已上传并预处理完成。\n\n请阅读以下文件：\n1. 任务清单: ${tasksFileRelPath}\n2. 转换规范: ${ruleFile}\n\n然后根据任务清单完成转换工作。`,
                        message: '预处理完成，请查看任务文档'
                      });
                    } catch (scriptError: any) {
                      console.error('[V0 转换] 执行失败:', scriptError);
                      
                      // 清理已创建的目录
                      const pageDir = path.join(projectRoot, 'src', targetType, pageName);
                      if (fs.existsSync(pageDir)) {
                        fs.rmSync(pageDir, { recursive: true, force: true });
                      }
                      
                      return sendJSON(res, 500, { 
                        error: `预处理脚本执行失败: ${scriptError.message}`,
                        details: scriptError.stderr || scriptError.stdout || scriptError.message
                      });
                    }
                  }

                  // Google AI Studio 项目：自动执行预处理脚本（同步等待完成）
                  if (uploadType === 'google_aistudio') {
                    const scriptPath = path.join(projectRoot, 'scripts', 'ai-studio-converter.mjs');
                    const pageName = basename
                      .replace(/[^a-z0-9-]/gi, '-')
                      .replace(/-+/g, '-')
                      .replace(/^-|-$/g, '')
                      .toLowerCase();
                    
                    const command = `node "${scriptPath}" "${extractDir}" "${pageName}"`;
                    
                    console.log('[AI Studio 转换] 执行预处理脚本:', command);
                    
                    // 使用 execSync 同步执行，等待完成
                    try {
                      const output = execSync(command, {
                        cwd: projectRoot,
                        encoding: 'utf8',
                        stdio: 'pipe'
                      });
                      
                      console.log('[AI Studio 转换] 执行成功:', output);
                      
                      // 验证任务文档是否生成
                      const tasksFilePath = path.join(projectRoot, 'src', targetType, pageName, '.ai-studio-tasks.md');
                      if (!fs.existsSync(tasksFilePath)) {
                        throw new Error('任务文档生成失败');
                      }
                      
                      // 返回任务文档路径
                      const tasksFileRelPath = `src/${targetType}/${pageName}/.ai-studio-tasks.md`;
                      const ruleFile = '/rules/ai-studio-project-converter.md';
                      
                      return sendJSON(res, 200, {
                        success: true,
                        uploadType,
                        pageName,
                        tasksFile: tasksFileRelPath,
                        ruleFile,
                        prompt: `AI Studio 项目已上传并预处理完成。\n\n请阅读以下文件：\n1. 任务清单: ${tasksFileRelPath}\n2. 转换规范: ${ruleFile}\n\n然后根据任务清单完成转换工作。`,
                        message: '预处理完成，请查看任务文档'
                      });
                    } catch (scriptError: any) {
                      console.error('[AI Studio 转换] 执行失败:', scriptError);
                      
                      // 清理已创建的目录
                      const pageDir = path.join(projectRoot, 'src', targetType, pageName);
                      if (fs.existsSync(pageDir)) {
                        fs.rmSync(pageDir, { recursive: true, force: true });
                      }
                      
                      return sendJSON(res, 500, { 
                        error: `预处理脚本执行失败: ${scriptError.message}`,
                        details: scriptError.stderr || scriptError.stdout || scriptError.message
                      });
                    }
                  }
                } catch (e: any) {
                  console.error('[文件系统 API] 解压失败:', e);
                  if (e?.code === 'ENAMETOOLONG') {
                    return sendJSON(res, 500, {
                      error:
                        '解压失败：ZIP 内部路径过长（超出系统限制）。请解压后上传文件夹，或缩短文件名后重试。',
                    });
                  }
                  return sendJSON(res, 500, { error: `解压失败: ${e.message}` });
                }
              }

              // 未知类型
              return sendJSON(res, 400, { error: `不支持的上传类型: ${uploadType}` });
            } catch (e: any) {
              console.error('[文件系统 API] 文件处理失败:', e);
              return sendJSON(res, 500, { error: e.message || 'File processing failed' });
            }
          });
        } catch (e: any) {
          console.error('[文件系统 API] 上传失败:', e);
          sendJSON(res, 500, { error: e.message || 'Upload failed' });
        }
      });

      // ==================== /api/upload-screenshots ====================
      server.middlewares.use('/api/upload-screenshots', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const form = formidable({
            uploadDir: path.join(projectRoot, 'temp'),
            keepExtensions: true,
            maxFileSize: 20 * 1024 * 1024, // 20MB per image
            multiples: true,
          });

          form.parse(req, async (err: any, fields: any, files: any) => {
            if (err) {
              console.error('[文件系统 API] 截图上传解析失败:', err);
              return sendJSON(res, 500, { error: 'Upload parsing failed' });
            }

            try {
              const getFieldValue = (field: any) => Array.isArray(field) ? field[0] : field;

              const rawBatchId = getFieldValue(fields.batchId);
              const batchId = (typeof rawBatchId === 'string' ? rawBatchId : '')
                .trim()
                .replace(/[^a-z0-9_-]/gi, '')
                .slice(0, 64);

              const resolvedBatchId = batchId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const screenshotsDir = path.join(projectRoot, 'temp', 'screenshots', resolvedBatchId);
              fs.mkdirSync(screenshotsDir, { recursive: true });

              const fileInput = (files.file ?? files.files) as any;
              const fileList = Array.isArray(fileInput) ? fileInput : (fileInput ? [fileInput] : []);

              if (fileList.length === 0) {
                return sendJSON(res, 400, { error: 'Missing file' });
              }

              const savedNames: string[] = [];

              for (const file of fileList) {
                const tempFilePath = file.filepath || file.path || file.tempFilePath;
                const originalFilename = file.originalFilename || file.name || file.filename || 'screenshot';

                if (!tempFilePath || !fs.existsSync(tempFilePath)) {
                  continue;
                }

                let safeName = path.basename(originalFilename).trim();
                safeName = safeName.replace(/[^\w.\- ]+/g, '-').replace(/\s+/g, '-');
                if (!safeName) safeName = 'screenshot';

                const ext = path.extname(safeName) || path.extname(originalFilename) || path.extname(tempFilePath) || '';
                const base = ext ? safeName.slice(0, -ext.length) : safeName;

                let candidate = `${base}${ext}`;
                let counter = 2;
                while (fs.existsSync(path.join(screenshotsDir, candidate))) {
                  candidate = `${base}-${counter}${ext}`;
                  counter += 1;
                }

                const destPath = path.join(screenshotsDir, candidate);
                moveFileWithFallback(tempFilePath, destPath);
                savedNames.push(candidate);
              }

              const entries = fs.readdirSync(screenshotsDir, { withFileTypes: true });
              const filePaths = entries
                .filter(entry => entry.isFile())
                .map(entry => normalizePath(path.join('temp', 'screenshots', resolvedBatchId, entry.name)))
                .sort((a, b) => a.localeCompare(b));

              const docs = [
                'skills/screen-to-code/SKILL.md',
                'skills/screen-to-code/screenshot-collection.md',
              ];

              const prompt = `**系统指令**：你将作为UI/UX 设计架构师 × 前端工程师（复合型），协助用户「基于截图导入并创建页面/元素」。

请严格按以下技能文档执行（必须完整跑完 Phase 0 → 5）：
${docs.map(d => `- \`${d}\``).join('\n')}

截图清单（已上传到工作区）：
${filePaths.map(p => `- \`${p}\``).join('\n')}

从 Phase 0 开始：先确认要生成页面还是元素、目标 name（kebab-case）、是否允许优化设计/交互；然后按文档产出抽象 JSON → 代码蓝图 → 再生成代码。`;

              return sendJSON(res, 200, {
                success: true,
                batchId: resolvedBatchId,
                files: filePaths,
                saved: savedNames,
                prompt,
                message: filePaths.length > 1 ? `已上传 ${filePaths.length} 张截图` : '已上传 1 张截图',
              });
            } catch (e: any) {
              console.error('[文件系统 API] 截图处理失败:', e);
              return sendJSON(res, 500, { error: e.message || 'File processing failed' });
            }
          });
        } catch (e: any) {
          console.error('[文件系统 API] 截图上传失败:', e);
          return sendJSON(res, 500, { error: e.message || 'Upload failed' });
        }
      });

      // ==================== /api/zip ====================
      server.middlewares.use('/api/zip', async (req: any, res: any) => {
        if (req.method !== 'GET') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const targetPath = url.searchParams.get('path'); // e.g., 'pages/antd-demo'

          if (!targetPath) {
            return sendJSON(res, 400, { error: 'Missing path parameter' });
          }

          // 验证路径安全性
          if (targetPath.includes('..') || targetPath.startsWith('/')) {
            return sendJSON(res, 403, { error: 'Invalid path' });
          }

          const srcDir = path.join(projectRoot, 'src', targetPath);

          if (!fs.existsSync(srcDir)) {
            return sendJSON(res, 404, { error: 'Directory not found' });
          }

          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(targetPath)}.zip"`);

          // 使用 streaming 方式创建 ZIP（避免在内存中构建整个 zip buffer）
          try {
            const archive = new (archiver as any)('zip', { zlib: { level: 9 } });

            archive.on('warning', (warning: any) => {
              console.warn('[文件系统 API] ZIP warning:', warning);
            });

            archive.on('error', (zipError: any) => {
              console.error('[文件系统 API] ZIP 创建失败:', zipError);
              if (!res.headersSent) {
                sendJSON(res, 500, { error: `创建 ZIP 失败: ${zipError.message}` });
              } else {
                res.end();
              }
            });

            archive.pipe(res);
            archive.directory(srcDir, false);

            await new Promise<void>((resolve) => {
              res.on('close', resolve);
              res.on('finish', resolve);
              archive.on('error', resolve);
              archive.finalize();
            });
          } catch (zipError: any) {
            console.error('[文件系统 API] ZIP 创建失败:', zipError);
            if (!res.headersSent) {
              return sendJSON(res, 500, { error: `创建 ZIP 失败: ${zipError.message}` });
            }
          }
        } catch (e: any) {
          console.error('[文件系统 API] zip 失败:', e);
          if (!res.headersSent) {
            sendJSON(res, 500, { error: e.message || 'Zip failed' });
          }
        }
      });

      // ==================== /api/copy ====================
      server.middlewares.use('/api/copy', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          return sendJSON(res, 405, { error: 'Method not allowed' });
        }

        try {
          const { sourcePath, targetPath } = await parseBody(req);

          if (!sourcePath || !targetPath) {
            return sendJSON(res, 400, { error: 'Missing sourcePath or targetPath parameter' });
          }

          // 验证路径安全性
          if (sourcePath.includes('..') || targetPath.includes('..')) {
            return sendJSON(res, 403, { error: 'Invalid path' });
          }

          // 验证目标路径不包含中文字符
          const targetFolderName = path.basename(targetPath);
          if (/[\u4e00-\u9fa5]/.test(targetFolderName)) {
            return sendJSON(res, 400, { error: 'Target folder name cannot contain Chinese characters' });
          }

          // sourcePath 和 targetPath 格式: src/elements/xxx 或 src/pages/xxx
          const sourceDir = path.join(projectRoot, sourcePath);
          const targetDir = path.join(projectRoot, targetPath);

          if (!fs.existsSync(sourceDir)) {
            return sendJSON(res, 404, { error: 'Source directory not found' });
          }

          if (fs.existsSync(targetDir)) {
            return sendJSON(res, 409, { error: 'Target directory already exists' });
          }

          // 复制目录
          copyDir(sourceDir, targetDir);

          // 更新副本的 @name 注释
          const indexFiles = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];
          let indexFilePath: string | null = null;
          
          for (const fileName of indexFiles) {
            const filePath = path.join(targetDir, fileName);
            if (fs.existsSync(filePath)) {
              indexFilePath = filePath;
              break;
            }
          }

          if (indexFilePath) {
            try {
              let content = fs.readFileSync(indexFilePath, 'utf8');
              
              // 提取文件夹名中的副本编号
              const copyMatch = targetFolderName.match(/-copy(\d*)$/);
              let copySuffix = '副本';
              if (copyMatch) {
                const copyNum = copyMatch[1];
                copySuffix = copyNum ? `副本${copyNum}` : '副本';
              }
              
              // 更新 @name 注释
              content = content.replace(
                /(@name\s+)([^\n]+)/,
                (match, prefix, name) => {
                  // 如果名称已经包含"副本"，先移除
                  const cleanName = name.replace(/\s*副本\d*\s*$/, '').trim();
                  return `${prefix}${cleanName} ${copySuffix}`;
                }
              );
              
              fs.writeFileSync(indexFilePath, content, 'utf8');
            } catch (e) {
              console.error('[文件系统 API] 更新 @name 注释失败:', e);
              // 不影响主流程，继续执行
            }
          }

          // 更新 entries.json
          const sourceRelPath = sourcePath.replace(/^src\//, '');
          const targetRelPath = targetPath.replace(/^src\//, '');
          updateEntriesJson(sourceRelPath, targetRelPath, false);

          sendJSON(res, 200, { success: true });
        } catch (e: any) {
          console.error('[文件系统 API] 复制失败:', e);
          sendJSON(res, 500, { error: e.message || 'Copy failed' });
        }
      });
    }
  };
}
