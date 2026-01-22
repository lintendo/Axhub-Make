import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import { IncomingMessage } from 'http';
import formidable from 'formidable';
import AdmZip from 'adm-zip';
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

          const srcDir = path.join(projectRoot, 'src', targetPath);

          if (!fs.existsSync(srcDir)) {
            return sendJSON(res, 404, { error: 'Directory not found' });
          }

          // 检查是否是参考项目（文件夹名以 'ref-' 开头）
          const folderName = path.basename(srcDir);
          if (folderName.startsWith('ref-')) {
            return sendJSON(res, 403, { error: '参考项目无法删除，请先取消参考状态' });
          }

          // 删除目录
          fs.rmSync(srcDir, { recursive: true, force: true });
          
          // 更新 entries.json
          updateEntriesJson(targetPath, undefined, true);

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
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedNewName)) {
            return sendJSON(res, 400, { error: 'Invalid newName format' });
          }

          // 解析路径
          const parts = String(targetPath).split('/').filter(Boolean);
          if (parts.length !== 2 || (parts[0] !== 'elements' && parts[0] !== 'pages')) {
            return sendJSON(res, 400, { error: 'Invalid path format' });
          }

          const group = parts[0];
          const oldName = parts[1];
          
          if (oldName === trimmedNewName) {
            return sendJSON(res, 200, { success: true });
          }

          const oldDir = path.join(projectRoot, 'src', group, oldName);
          const newDir = path.join(projectRoot, 'src', group, trimmedNewName);

          if (!fs.existsSync(oldDir)) {
            return sendJSON(res, 404, { error: 'Directory not found' });
          }

          if (fs.existsSync(newDir)) {
            return sendJSON(res, 409, { error: 'Target name already exists' });
          }

          // 重命名目录
          fs.renameSync(oldDir, newDir);

          // 更新 entries.json
          const oldKey = `${group}/${oldName}`;
          const newKey = `${group}/${trimmedNewName}`;
          
          const entriesPath = path.join(projectRoot, 'entries.json');
          if (fs.existsSync(entriesPath)) {
            try {
              const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
              let changed = false;

              if (entries.js && entries.js[oldKey]) {
                const oldVal = entries.js[oldKey];
                delete entries.js[oldKey];
                entries.js[newKey] = typeof oldVal === 'string'
                  ? oldVal.replace(new RegExp(`${oldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`), newKey)
                  : oldVal;
                changed = true;
              }
              
              if (entries.html && entries.html[oldKey]) {
                const oldVal = entries.html[oldKey];
                delete entries.html[oldKey];
                entries.html[newKey] = typeof oldVal === 'string'
                  ? oldVal.replace(new RegExp(`${oldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`), newKey)
                  : oldVal;
                changed = true;
              }

              if (changed) {
                fs.writeFileSync(entriesPath, JSON.stringify(entries, null, 2));
              }
            } catch (e) {
              console.error('[文件系统 API] 更新 entries.json 失败:', e);
            }
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
              
              // 文件可能在 files.file 或 fields.file 中
              let file = files.file ? (Array.isArray(files.file) ? files.file[0] : files.file) : null;
              
              // 如果 files 中没有，检查 fields 中是否有（某些版本的 formidable 会这样）
              if (!file && fields.file) {
                file = Array.isArray(fields.file) ? fields.file[0] : fields.file;
              }

              console.log('[文件系统 API] 原始文件对象:', {
                hasFilesFile: !!files.file,
                hasFieldsFile: !!fields.file,
                fileType: file ? typeof file : 'undefined',
                fileKeys: file ? Object.keys(file) : [],
                fileConstructor: file ? file.constructor.name : 'undefined'
              });

              console.log('[文件系统 API] 接收到的参数:', {
                uploadType,
                targetType,
                hasFile: !!file,
                fileInfo: file ? { filepath: file.filepath, originalFilename: file.originalFilename } : null,
                fieldsKeys: Object.keys(fields),
                filesKeys: Object.keys(files)
              });

              if (!file || !uploadType || !targetType) {
                console.error('[文件系统 API] 缺少必需参数:', { 
                  hasFile: !!file, 
                  uploadType, 
                  targetType,
                  fileType: file ? typeof file : 'undefined'
                });
                return sendJSON(res, 400, { 
                  error: 'Missing required parameters',
                  details: {
                    hasFile: !!file,
                    hasUploadType: !!uploadType,
                    hasTargetType: !!targetType
                  }
                });
              }

              // 获取文件路径 - 尝试多种可能的属性名
              const tempFilePath = file.filepath || file.path || file.tempFilePath;
              const originalFilename = file.originalFilename || file.name || file.filename || 'upload.zip';

              console.log('[文件系统 API] 文件信息:', {
                tempFilePath,
                originalFilename,
                fileSize: file.size,
                fileExists: fs.existsSync(tempFilePath),
                fileStats: fs.existsSync(tempFilePath) ? fs.statSync(tempFilePath) : null
              });

              if (!fs.existsSync(tempFilePath)) {
                return sendJSON(res, 500, { error: '临时文件不存在' });
              }

              if (fs.statSync(tempFilePath).size === 0) {
                return sendJSON(res, 500, { error: '上传的文件为空' });
              }

              // 直接处理类型：make, axhub, google_stitch
              if (['make', 'axhub', 'google_stitch'].includes(uploadType)) {
                try {
                  console.log('[文件系统 API] 开始解析 ZIP 文件:', tempFilePath);
                  const zip = new AdmZip(tempFilePath);
                  const zipEntries = zip.getEntries();

                  console.log('[文件系统 API] ZIP 条目数量:', zipEntries.length);

                  if (zipEntries.length === 0) {
                    throw new Error('ZIP 文件为空');
                  }

                  // 获取根目录名称（如果有的话）
                  let rootFolderName = '';
                  let hasRootFolder = false;
                  
                  // 检查是否所有文件都在同一个根目录下
                  const firstEntry = zipEntries.find(e => !e.isDirectory);
                  if (firstEntry) {
                    const parts = firstEntry.entryName.split('/').filter(Boolean);
                    if (parts.length > 1) {
                      // 有根目录
                      rootFolderName = parts[0];
                      hasRootFolder = zipEntries.every(entry => {
                        const entryParts = entry.entryName.split('/').filter(Boolean);
                        return entryParts.length === 0 || entryParts[0] === rootFolderName;
                      });
                    }
                  }

                  // 如果没有根目录，使用文件名作为目录名
                  if (!hasRootFolder || !rootFolderName) {
                    const basename = path.basename(originalFilename, path.extname(originalFilename));
                    rootFolderName = basename
                      .replace(/[^a-z0-9-]/gi, '-')
                      .replace(/-+/g, '-')
                      .replace(/^-|-$/g, '')
                      .toLowerCase();
                  }

                  const targetFolderName = rootFolderName;
                  const targetDir = path.join(projectRoot, 'src', targetType, targetFolderName);

                  console.log('[文件系统 API] ZIP 结构分析:', {
                    hasRootFolder,
                    rootFolderName,
                    targetDir,
                    entriesCount: zipEntries.length
                  });

                  // 如果目标目录已存在，直接删除（覆盖）
                  if (fs.existsSync(targetDir)) {
                    fs.rmSync(targetDir, { recursive: true, force: true });
                  }

                  // 解压到临时目录
                  const tempExtractDir = path.join(projectRoot, 'temp', `extract-${Date.now()}`);
                  zip.extractAllTo(tempExtractDir, true);

                  // 🔧 Windows 兼容性修复：等待杀毒软件释放文件
                  // 在 Windows 上，解压后杀毒软件（如 Windows Defender）会立即扫描新文件
                  // 导致文件被短暂锁定，此时执行 rename 会触发 EPERM 错误
                  // 延迟 500ms 让杀毒软件完成扫描，大幅降低权限错误的概率
                  await new Promise(resolve => setTimeout(resolve, 500));

                  // 移动到目标目录（使用复制+删除方式作为 fallback，避免 Windows 权限问题）
                  if (hasRootFolder) {
                    // 有根目录：移动根目录
                    const extractedRoot = path.join(tempExtractDir, rootFolderName);
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
                  fs.unlinkSync(tempFilePath);

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
                  return sendJSON(res, 500, { error: `解压失败: ${e.message}` });
                }
              }

              // AI 处理类型：v0, google_aistudio
              if (['v0', 'google_aistudio'].includes(uploadType)) {
                try {
                  // 解压到 temp 目录
                  const timestamp = Date.now();
                  const basename = path.basename(originalFilename, path.extname(originalFilename));
                  const extractDirName = `${uploadType}-${basename}-${timestamp}`;
                  const extractDir = path.join(projectRoot, 'temp', extractDirName);

                  const zip = new AdmZip(tempFilePath);
                  zip.extractAllTo(extractDir, true);
                  fs.unlinkSync(tempFilePath);

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

          // Use AdmZip to create zip file (more compatible and reliable)
          try {
            const zip = new AdmZip();
            
            // 递归添加目录中的所有文件
            const addDirectory = (dirPath: string, zipPath: string = '') => {
              const entries = fs.readdirSync(dirPath, { withFileTypes: true });
              
              for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const zipEntryPath = zipPath ? path.join(zipPath, entry.name) : entry.name;
                
                if (entry.isDirectory()) {
                  addDirectory(fullPath, zipEntryPath);
                } else {
                  zip.addLocalFile(fullPath, zipPath);
                }
              }
            };
            
            addDirectory(srcDir);
            
            // 生成 zip buffer 并发送
            const zipBuffer = zip.toBuffer();
            res.end(zipBuffer);
          } catch (zipError: any) {
            console.error('[文件系统 API] AdmZip 创建失败:', zipError);
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
