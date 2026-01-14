import type { Plugin } from 'vite';
import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';

type AIType = 'claude' | 'gemini' | 'opencode' | 'cursor';

interface RunAIOptions {
  cli: AIType;
  prompt: string;
  silent?: boolean;
  interactive?: boolean;
}

/**
 * 检测 CLI 是否存在
 */
function hasCommand(cmd: string): boolean {
  const checker = platform() === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

/**
 * CLI 适配器（严格对齐官方用法）
 */
const CLI_ADAPTERS: Record<AIType, (opts: RunAIOptions) => { command: string; args: string[]; useStdin: boolean; input?: string }> = {
  claude: ({ prompt, interactive }) => {
    if (interactive) {
      // 官方：进入 Claude Code 交互 TUI
      return { command: 'claude', args: [], useStdin: false };
    }
    // 官方 headless 模式
    return { command: 'claude', args: ['-p', prompt], useStdin: false };
  },
  gemini: ({ prompt, interactive }) => {
    if (interactive) {
      return { command: 'gemini', args: [], useStdin: false };
    }
    // Gemini CLI 通过 stdin 接收输入
    return { command: 'gemini', args: [], useStdin: true, input: prompt };
  },
  opencode: ({ prompt, interactive }) => {
    if (interactive) {
      // 启动 OpenCode TUI
      return { command: 'opencode', args: [], useStdin: false };
    }
    // 非交互模式：opencode run "prompt"
    return { command: 'opencode', args: ['run', prompt], useStdin: false };
  },
  cursor: ({ prompt, interactive }) => {
    if (interactive) {
      // 启动 Cursor Agent 交互式会话
      return { command: 'agent', args: [prompt], useStdin: false };
    }
    // 非交互模式（打印模式）：agent -p "prompt" --output-format text
    return { command: 'agent', args: ['-p', prompt, '--output-format', 'text'], useStdin: false };
  },
};

/**
 * 统一执行入口
 */
function runAICommand(options: RunAIOptions): Promise<string> {
  const {
    cli,
    prompt,
    silent = false,
    interactive = false,
  } = options;

  // Cursor 使用 'agent' 命令，需要特殊检测
  const commandToCheck = cli === 'cursor' ? 'agent' : cli;
  
  if (!hasCommand(commandToCheck)) {
    throw new Error(`CLI not found: ${cli} (command: ${commandToCheck})`);
  }

  // 交互式 → 强制非静默
  const finalSilent = interactive ? false : silent;
  const adapter = CLI_ADAPTERS[cli];
  if (!adapter) {
    throw new Error(`Unsupported CLI: ${cli}`);
  }

  const config = adapter({ ...options, interactive });
  const { command, args, useStdin, input } = config;
  
  console.log(`[AI CLI] Spawning command: ${command} ${args.join(' ')}${useStdin ? ' (with stdin)' : ''}`);
  
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: finalSilent ? ['pipe', 'pipe', 'pipe'] : (useStdin ? ['pipe', 'inherit', 'inherit'] : 'inherit'),
      env: process.env,
      shell: true,
    });

    let output = '';
    let errorOutput = '';

    // 设置超时（60秒）
    const timeout = setTimeout(() => {
      console.error(`[AI CLI] Command timeout after 60s`);
      child.kill('SIGTERM');
      reject(new Error('Command execution timeout (60s)'));
    }, 60000);

    // 如果需要通过 stdin 传递输入
    if (useStdin && input && child.stdin) {
      console.log(`[AI CLI] Writing to stdin: ${input.substring(0, 50)}...`);
      child.stdin.write(input);
      child.stdin.end();
    }

    // 捕获输出
    if (finalSilent && child.stdout && child.stderr) {
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log(`[AI CLI] stdout chunk: ${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}`);
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        console.error(`[AI CLI] stderr chunk: ${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}`);
      });
    }

    // 错误处理
    child.on('error', (error) => {
      clearTimeout(timeout);
      console.error(`[AI CLI] Process error:`, error);
      reject(error);
    });

    // 进程关闭 - 这是主要的完成事件
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      console.log(`[AI CLI] Process closed with code ${code}, signal ${signal}`);
      
      if (code === 0) {
        const result = output.trim() || errorOutput.trim() || 'Command executed successfully';
        console.log(`[AI CLI] Success, output length: ${result.length}`);
        resolve(result);
      } else {
        const errorMsg = `CLI exited with code ${code}${signal ? ` (signal: ${signal})` : ''}\nOutput: ${output}\nError: ${errorOutput}`;
        console.error(`[AI CLI] Failed:`, errorMsg);
        reject(new Error(errorMsg));
      }
    });
  });
}

/**
 * AI CLI Plugin
 * Provides API endpoints for executing local AI CLI commands (Claude, Gemini)
 */
export function aiCliPlugin(): Plugin {
  // 防抖机制：记录正在执行的任务
  const runningTasks = new Map<string, { promise: Promise<string>; timestamp: number }>();
  const DEBOUNCE_TIME = 2000; // 2秒内的相同请求会被合并

  return {
    name: 'ai-cli-api',

    configureServer(server) {
      // Helper functions
      const sendJSON = (res: any, statusCode: number, data: any) => {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
      };

      const sendError = (res: any, statusCode: number, message: string) => {
        sendJSON(res, statusCode, { 
          error: message, 
          timestamp: new Date().toISOString() 
        });
      };

      // 生成任务唯一标识
      const getTaskKey = (cli: string, prompt: string): string => {
        return `${cli}:${prompt}`;
      };

      // 清理过期任务
      const cleanupExpiredTasks = () => {
        const now = Date.now();
        for (const [key, task] of runningTasks.entries()) {
          if (now - task.timestamp > DEBOUNCE_TIME) {
            runningTasks.delete(key);
          }
        }
      };

      // Middleware to handle API routes
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // GET /api/ai/execute - Execute AI CLI command
        if (url.startsWith('/api/ai/execute') && req.method === 'GET') {
          try {
            const urlObj = new URL(url, `http://${req.headers.host}`);
            const cli = urlObj.searchParams.get('cli') as AIType;
            const prompt = urlObj.searchParams.get('prompt');
            const silent = urlObj.searchParams.get('silent') !== 'false'; // 默认 true
            const interactive = urlObj.searchParams.get('interactive') === 'true'; // 默认 false

            // Validate required fields
            if (!cli || !['claude', 'gemini', 'opencode', 'cursor'].includes(cli)) {
              return sendError(res, 400, 'Invalid or missing "cli" parameter. Must be "claude", "gemini", "opencode", or "cursor"');
            }

            if (!prompt || typeof prompt !== 'string') {
              return sendError(res, 400, 'Invalid or missing "prompt" parameter');
            }

            // Check if CLI is available
            const commandToCheck = cli === 'cursor' ? 'agent' : cli;
            if (!hasCommand(commandToCheck)) {
              return sendError(res, 404, `CLI not found: ${cli}. Please install it first.`);
            }

            // 防抖检查
            cleanupExpiredTasks();
            const taskKey = getTaskKey(cli, prompt);
            const existingTask = runningTasks.get(taskKey);

            if (existingTask) {
              console.log(`[AI CLI] Reusing existing task for ${cli}:`, prompt.substring(0, 50) + '...');
              try {
                const result = await existingTask.promise;
                sendJSON(res, 200, {
                  success: true,
                  cli,
                  output: result || 'Command executed successfully',
                  cached: true,
                  timestamp: new Date().toISOString(),
                });
              } catch (error: any) {
                console.error('[AI CLI] Cached task error:', error);
                sendError(res, 500, error.message || 'Failed to execute AI CLI command');
              }
              return;
            }

            console.log(`[AI CLI] Executing ${cli} command:`, { 
              prompt: prompt.substring(0, 50) + '...', 
              silent, 
              interactive 
            });

            // 创建新任务
            const taskPromise = runAICommand({
              cli,
              prompt,
              silent,
              interactive,
            });

            // 记录任务
            runningTasks.set(taskKey, {
              promise: taskPromise,
              timestamp: Date.now(),
            });

            // 执行任务
            try {
              const result = await taskPromise;
              sendJSON(res, 200, {
                success: true,
                cli,
                output: result || 'Command executed successfully',
                cached: false,
                timestamp: new Date().toISOString(),
              });
            } catch (error: any) {
              console.error('[AI CLI] Execution error:', error);
              sendError(res, 500, error.message || 'Failed to execute AI CLI command');
            } finally {
              // 延迟删除任务，允许短时间内的重复请求复用结果
              setTimeout(() => {
                runningTasks.delete(taskKey);
              }, DEBOUNCE_TIME);
            }
          } catch (error: any) {
            console.error('[AI CLI] Request handling error:', error);
            sendError(res, 500, error.message || 'Internal server error');
          }
          return;
        }

        // GET /api/ai/status - Check CLI availability
        if (url.startsWith('/api/ai/status') && req.method === 'GET') {
          try {
            const status = {
              claude: hasCommand('claude'),
              gemini: hasCommand('gemini'),
              opencode: hasCommand('opencode'),
              cursor: hasCommand('agent'), // Cursor CLI 使用 'agent' 命令
              runningTasks: runningTasks.size,
              timestamp: new Date().toISOString(),
            };

            sendJSON(res, 200, status);
          } catch (error: any) {
            console.error('[AI CLI] Status check error:', error);
            sendError(res, 500, error.message || 'Failed to check CLI status');
          }
          return;
        }

        next();
      });
    }
  };
}
