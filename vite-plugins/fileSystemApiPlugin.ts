import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import { IncomingMessage } from 'http';
import formidable from 'formidable';
import AdmZip from 'adm-zip';
import { exec } from 'child_process';

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

                  // 移动到目标目录
                  if (hasRootFolder) {
                    // 有根目录：移动根目录
                    const extractedRoot = path.join(tempExtractDir, rootFolderName);
                    if (fs.existsSync(extractedRoot)) {
                      fs.renameSync(extractedRoot, targetDir);
                    } else {
                      throw new Error('解压后找不到根目录');
                    }
                  } else {
                    // 没有根目录：直接移动整个解压目录
                    fs.renameSync(tempExtractDir, targetDir);
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

                  // 生成 prompt
                  let ruleFile = '';
                  let promptTemplate = '';

                  if (uploadType === 'v0') {
                    ruleFile = '/rules/v0-project-converter.md';
                    promptTemplate = `请根据 ${ruleFile} 的指导，将上传的 V0 项目（位于 temp/${extractDirName}）转换为 Axhub ${targetType === 'pages' ? '页面' : '元素'}。`;
                  } else if (uploadType === 'google_aistudio') {
                    ruleFile = '/rules/ai-studio-project-converter.md';
                    promptTemplate = `请根据 ${ruleFile} 的指导，将上传的 Google AI Studio 项目（位于 temp/${extractDirName}）转换为 Axhub ${targetType === 'pages' ? '页面' : '元素'}。`;
                  }

                  return sendJSON(res, 200, {
                    success: true,
                    uploadType,
                    filePath: `temp/${extractDirName}`,
                    ruleFile,
                    prompt: promptTemplate,
                    message: '文件已解压到 temp 目录，请复制 Prompt 让 AI 处理'
                  });
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
