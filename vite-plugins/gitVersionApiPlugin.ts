import type { Plugin } from 'vite';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * Git 版本管理 API 插件
 * 提供基于 Git 的版本控制功能，用于页面和元素的文件夹级别版本管理
 */
export function gitVersionApiPlugin(): Plugin {
  return {
    name: 'git-version-api',
    
    configureServer(server) {
      // 服务器启动时清理临时版本文件
      const projectRoot = process.cwd();
      const gitVersionsDir = path.join(projectRoot, '.git-versions');
      
      if (fs.existsSync(gitVersionsDir)) {
        try {
          console.log('[Git 版本管理] 清理临时版本文件...');
          fs.rmSync(gitVersionsDir, { recursive: true, force: true });
          console.log('[Git 版本管理] ✅ 临时版本文件已清理');
        } catch (error) {
          console.error('[Git 版本管理] ⚠️  清理临时文件失败:', error);
        }
      }
      
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

      // Helper function to execute git command
      const execGit = async (command: string, cwd: string) => {
        try {
          const { stdout, stderr } = await execAsync(command, { cwd, maxBuffer: 1024 * 1024 * 10 });
          return { stdout: stdout.trim(), stderr: stderr.trim() };
        } catch (error: any) {
          throw new Error(`Git command failed: ${error.message}`);
        }
      };

      // Main middleware for git version API
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Only handle /api/git/* routes
        if (!req.url.startsWith('/api/git')) {
          return next();
        }

        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const pathname = url.pathname;

          // Route: GET /api/git/history - Get git history for a folder
          if (pathname === '/api/git/history' && req.method === 'GET') {
            const targetPath = url.searchParams.get('path'); // e.g., 'pages/home' or 'elements/button'
            
            if (!targetPath) {
              sendJSON(res, 400, { error: 'Missing path parameter' });
              return;
            }

            // Validate path
            if (targetPath.includes('..') || targetPath.startsWith('/')) {
              sendJSON(res, 403, { error: 'Invalid path' });
              return;
            }

            const projectRoot = process.cwd();
            const folderPath = path.join(projectRoot, 'src', targetPath);

            if (!fs.existsSync(folderPath)) {
              sendJSON(res, 404, { error: 'Folder not found' });
              return;
            }

            // Get git log for the folder (last 20 commits)
            const gitCommand = `git log -20 --pretty=format:'%H|%an|%ae|%at|%s' -- src/${targetPath}`;
            const { stdout } = await execGit(gitCommand, projectRoot);

            if (!stdout) {
              sendJSON(res, 200, { commits: [], hasUncommitted: false });
              return;
            }

            const commits = stdout.split('\n').map(line => {
              const [hash, author, email, timestamp, message] = line.split('|');
              return {
                hash,
                author,
                email,
                timestamp: parseInt(timestamp) * 1000, // Convert to milliseconds
                message,
                date: new Date(parseInt(timestamp) * 1000).toISOString()
              };
            });

            // Check for uncommitted changes in the folder
            const statusCommand = `git status --porcelain -- src/${targetPath}`;
            const { stdout: statusOutput } = await execGit(statusCommand, projectRoot);
            const hasUncommitted = statusOutput.length > 0;

            sendJSON(res, 200, { commits, hasUncommitted, uncommittedFiles: statusOutput });
            return;
          }

          // Route: POST /api/git/restore - Restore folder to a specific commit
          if (pathname === '/api/git/restore' && req.method === 'POST') {
            const body = await parseBody(req);
            const { path: targetPath, commitHash } = body;

            if (!targetPath || !commitHash) {
              sendJSON(res, 400, { error: 'Missing path or commitHash parameter' });
              return;
            }

            // Validate path
            if (targetPath.includes('..') || targetPath.startsWith('/')) {
              sendJSON(res, 403, { error: 'Invalid path' });
              return;
            }

            const projectRoot = process.cwd();
            const folderPath = path.join(projectRoot, 'src', targetPath);

            if (!fs.existsSync(folderPath)) {
              sendJSON(res, 404, { error: 'Folder not found' });
              return;
            }

            // Verify commit exists
            const verifyCommand = `git cat-file -t ${commitHash}`;
            try {
              await execGit(verifyCommand, projectRoot);
            } catch (error) {
              sendJSON(res, 400, { error: 'Invalid commit hash' });
              return;
            }

            // Restore folder to specific commit
            const restoreCommand = `git checkout ${commitHash} -- src/${targetPath}`;
            await execGit(restoreCommand, projectRoot);

            sendJSON(res, 200, { success: true, message: 'Folder restored successfully' });
            return;
          }

          // Route: POST /api/git/commit - Commit changes for a folder
          if (pathname === '/api/git/commit' && req.method === 'POST') {
            const body = await parseBody(req);
            const { path: targetPath, message } = body;

            if (!targetPath || !message) {
              sendJSON(res, 400, { error: 'Missing path or message parameter' });
              return;
            }

            // Validate path
            if (targetPath.includes('..') || targetPath.startsWith('/')) {
              sendJSON(res, 403, { error: 'Invalid path' });
              return;
            }

            const projectRoot = process.cwd();
            const folderPath = path.join(projectRoot, 'src', targetPath);

            if (!fs.existsSync(folderPath)) {
              sendJSON(res, 404, { error: 'Folder not found' });
              return;
            }

            // Check if there are changes to commit
            const statusCommand = `git status --porcelain -- src/${targetPath}`;
            const { stdout: statusOutput } = await execGit(statusCommand, projectRoot);

            if (!statusOutput) {
              sendJSON(res, 400, { error: 'No changes to commit' });
              return;
            }

            // Add and commit changes
            const addCommand = `git add src/${targetPath}`;
            await execGit(addCommand, projectRoot);

            const commitCommand = `git commit -m "${message.replace(/"/g, '\\"')}"`;
            const { stdout: commitOutput } = await execGit(commitCommand, projectRoot);

            sendJSON(res, 200, { success: true, message: 'Changes committed successfully', output: commitOutput });
            return;
          }

          // Route: GET /api/git/diff - Get diff for uncommitted changes
          if (pathname === '/api/git/diff' && req.method === 'GET') {
            const targetPath = url.searchParams.get('path');
            
            if (!targetPath) {
              sendJSON(res, 400, { error: 'Missing path parameter' });
              return;
            }

            // Validate path
            if (targetPath.includes('..') || targetPath.startsWith('/')) {
              sendJSON(res, 403, { error: 'Invalid path' });
              return;
            }

            const projectRoot = process.cwd();
            const folderPath = path.join(projectRoot, 'src', targetPath);

            if (!fs.existsSync(folderPath)) {
              sendJSON(res, 404, { error: 'Folder not found' });
              return;
            }

            // Get diff for uncommitted changes
            const diffCommand = `git diff -- src/${targetPath}`;
            const { stdout: diffOutput } = await execGit(diffCommand, projectRoot);

            // Get list of changed files
            const statusCommand = `git status --porcelain -- src/${targetPath}`;
            const { stdout: statusOutput } = await execGit(statusCommand, projectRoot);

            const changedFiles = statusOutput.split('\n').filter(line => line.trim()).map(line => {
              const status = line.substring(0, 2).trim();
              const file = line.substring(3);
              return { status, file };
            });

            sendJSON(res, 200, { diff: diffOutput, changedFiles });
            return;
          }

          // Route: POST /api/git/build-version - Extract version files (no build)
          if (pathname === '/api/git/build-version' && req.method === 'POST') {
            const body = await parseBody(req);
            const { path: targetPath, commitHash } = body;

            if (!targetPath || !commitHash) {
              sendJSON(res, 400, { error: 'Missing path or commitHash parameter' });
              return;
            }

            // Validate path
            if (targetPath.includes('..') || targetPath.startsWith('/')) {
              sendJSON(res, 403, { error: 'Invalid path' });
              return;
            }

            const projectRoot = process.cwd();
            const folderPath = path.join(projectRoot, 'src', targetPath);

            if (!fs.existsSync(folderPath)) {
              sendJSON(res, 404, { error: 'Folder not found' });
              return;
            }

            try {
              // Create temporary directory for version files
              const versionId = commitHash.substring(0, 8);
              const tempDir = path.join(projectRoot, '.git-versions', versionId);
              const srcPath = path.join(tempDir, 'src', targetPath);
              
              // Check if already extracted
              if (fs.existsSync(srcPath)) {
                console.log('[Git 版本管理] 使用已提取的版本:', versionId);
                const specPath = path.join(srcPath, 'spec.md');
                const indexPath = path.join(srcPath, 'index.tsx');
                const hasSpec = fs.existsSync(specPath);
                const hasPrototype = fs.existsSync(indexPath);
                
                sendJSON(res, 200, { 
                  success: true, 
                  versionId,
                  hasSpec,
                  hasPrototype,
                  specUrl: hasSpec ? `/${targetPath}/spec.html?ver=${versionId}` : null,
                  prototypeUrl: hasPrototype ? `/${targetPath}/index.html?ver=${versionId}` : null,
                  cached: true
                });
                return;
              }
              
              fs.mkdirSync(srcPath, { recursive: true });

              console.log('[Git 版本管理] 开始提取版本文件:', versionId, targetPath);

              // Get list of files in the commit
              const listCommand = `git ls-tree -r --name-only ${commitHash} src/${targetPath}`;
              const { stdout: fileList } = await execGit(listCommand, projectRoot);
              
              if (!fileList.trim()) {
                sendJSON(res, 404, { error: 'No files found in this version' });
                return;
              }

              // Extract each file
              const files = fileList.trim().split('\n');
              for (const file of files) {
                const targetFile = path.join(tempDir, file);
                const targetDir = path.dirname(targetFile);
                
                // Create directory if needed
                fs.mkdirSync(targetDir, { recursive: true });
                
                // Get file content from git
                const showCommand = `git show ${commitHash}:${file}`;
                const { stdout: content } = await execGit(showCommand, projectRoot);
                fs.writeFileSync(targetFile, content);
              }

              console.log('[Git 版本管理] ✅ 文件提取完成');

              // Check what files exist in the version
              const specPath = path.join(srcPath, 'spec.md');
              const indexPath = path.join(srcPath, 'index.tsx');
              const hasSpec = fs.existsSync(specPath);
              const hasPrototype = fs.existsSync(indexPath);

              // Generate URLs for accessing the version
              const specUrl = hasSpec ? `/${targetPath}/spec.html?ver=${versionId}` : null;
              const prototypeUrl = hasPrototype ? `/${targetPath}/index.html?ver=${versionId}` : null;

              sendJSON(res, 200, { 
                success: true, 
                versionId,
                hasSpec,
                hasPrototype,
                specUrl,
                prototypeUrl
              });
            } catch (error: any) {
              console.error('Extract version error:', error);
              sendJSON(res, 500, { error: error.message || 'Failed to extract version' });
            }
            return;
          }

          // Route: GET /api/git/version-file - Get file from specific version
          if (pathname.startsWith('/api/git/version-file/') && req.method === 'GET') {
            try {
              // Parse URL: /api/git/version-file/{versionId}/{path}/spec.md
              const parts = pathname.replace('/api/git/version-file/', '').split('/');
              if (parts.length < 3) {
                sendJSON(res, 400, { error: 'Invalid URL format' });
                return;
              }

              const versionId = parts[0];
              const fileName = parts[parts.length - 1];
              const targetPath = parts.slice(1, -1).join('/');

              // Validate
              if (targetPath.includes('..') || targetPath.startsWith('/')) {
                sendJSON(res, 403, { error: 'Invalid path' });
                return;
              }

              const projectRoot = process.cwd();
              const tempDir = path.join(projectRoot, '.git-versions', versionId);
              const filePath = path.join(tempDir, 'src', targetPath, fileName);

              if (!fs.existsSync(filePath)) {
                sendJSON(res, 404, { error: 'File not found in version' });
                return;
              }

              const content = fs.readFileSync(filePath, 'utf8');
              res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
              res.end(content);
            } catch (error: any) {
              console.error('Get version file error:', error);
              sendJSON(res, 500, { error: error.message });
            }
            return;
          }

          // Route: GET /api/git/status - Check git repository status
          if (pathname === '/api/git/status' && req.method === 'GET') {
            const projectRoot = process.cwd();

            try {
              // Check if git is initialized
              const { stdout: branchOutput } = await execGit('git branch --show-current', projectRoot);
              const currentBranch = branchOutput || 'main';

              // Get repository status
              const { stdout: statusOutput } = await execGit('git status --porcelain', projectRoot);
              const hasChanges = statusOutput.length > 0;

              sendJSON(res, 200, { 
                initialized: true, 
                currentBranch,
                hasChanges,
                isGitRepo: true
              });
            } catch (error) {
              sendJSON(res, 200, { 
                initialized: false, 
                isGitRepo: false,
                error: 'Git repository not initialized'
              });
            }
            return;
          }

          // No route matched
          sendJSON(res, 404, { error: 'API endpoint not found' });
          
        } catch (error: any) {
          console.error('Git version API error:', error);
          sendJSON(res, 500, { error: error.message || 'Internal server error' });
        }
      });
    }
  };
}
