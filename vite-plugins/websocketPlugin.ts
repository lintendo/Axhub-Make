import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import fs from 'fs';
import path from 'path';
import extractZip from 'extract-zip';
import { exec } from 'child_process';

export interface WebSocketMessage {
  type: string;
  data?: any;
  payload?: any;
  client?: string;
  version?: string;
}

export interface ClientMeta {
  id: number;
  type: string;  // 'figma' | 'vscode' | 'browser' | 'unknown'
  version?: string;
  address?: string;
  connectedAt: number;
}

interface UploadSession {
  transferId: string;
  pageName: string;
  displayName?: string;
  fileName: string;
  mode: 'zip' | 'files';
  totalChunks: number;
  totalBytes?: number;
  receivedChunks: number;
  receivedBytes: number;
  chunks: Map<number, Buffer>;
  filesRoot?: string;
  filesReceived: number;
  startedAt: number;
}

interface HandleMessageContext {
  clientMeta: Map<WebSocket, ClientMeta>;
  uploadSessions: Map<string, UploadSession>;
  projectRoot: string;
}

const IGNORED_EXTRACT_ENTRIES = new Set(['__MACOSX', '.DS_Store']);

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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

function isSafeName(value: string) {
  return Boolean(value && value.trim() && !value.includes('..') && !/[\\/]/.test(value));
}

function isSafeRelativePath(value: string) {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.startsWith('~')) return false;
  if (normalized.split('/').some(part => part === '..')) return false;
  return true;
}

function isValidDisplayName(value?: string) {
  if (value === undefined) return true;
  const text = String(value).trim();
  return text.length > 0 && text.length <= 200;
}

function sendWsMessage(ws: WebSocket, payload: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function quoteForShell(value: string) {
  return `"${String(value).replace(/["\\$`]/g, '\\$&')}"`;
}

/**
 * WebSocket 插件 - 在 Vite 开发服务器上添加 WebSocket 支持
 */
export function websocketPlugin(): Plugin {
  let wss: WebSocketServer | null = null;
  const clients = new Set<WebSocket>();
  const clientMeta = new Map<WebSocket, ClientMeta>();
  const uploadSessions = new Map<string, UploadSession>();
  let nextClientId = 1;
  const WS_PATH = '/ws';
  const projectRoot = process.cwd();

  return {
    name: 'vite-websocket',
    apply: 'serve',

    configureServer(server: ViteDevServer) {
      // 使用独立的 noServer 模式，避免抢占 Vite 自带的 HMR WebSocket 升级请求
      // （此前共享同一个 httpServer 且指定 path 会拦截非 /ws 升级，导致 HMR 报 Invalid frame header）
      wss = new WebSocketServer({ noServer: true });

      const handleUpgrade = (req: IncomingMessage, socket: any, head: Buffer) => {
        // 只处理 /ws 的升级请求，其余交给 Vite 自己的 HMR 逻辑
        const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : '';
        if (pathname !== WS_PATH) {
          return;
        }

        wss?.handleUpgrade(req, socket, head, (ws) => {
          wss?.emit('connection', ws, req);
        });
      };

      server.httpServer?.on('upgrade', handleUpgrade);

      wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        // 从 URL 查询参数中获取客户端类型
        const url = new URL(req.url || '', 'http://localhost');
        const clientType = url.searchParams.get('client') || 'unknown';
        const clientVersion = url.searchParams.get('version') || undefined;
        
        console.log('[WebSocket] 新客户端连接:', {
          type: clientType,
          version: clientVersion,
          address: req.socket.remoteAddress
        });
        
        clients.add(ws);
        const meta: ClientMeta = {
          id: nextClientId++,
          type: clientType,
          version: clientVersion,
          address: req.socket.remoteAddress,
          connectedAt: Date.now()
        };
        clientMeta.set(ws, meta);

        // 发送欢迎消息
        ws.send(JSON.stringify({ 
          type: 'connected', 
          message: 'WebSocket 连接成功' 
        }));

        // 处理客户端消息
        ws.on('message', (rawData) => {
          try {
            const payloadText = typeof rawData === 'string'
              ? rawData
              : Buffer.isBuffer(rawData)
                ? rawData.toString()
                : Array.isArray(rawData)
                  ? Buffer.concat(rawData).toString()
                  : Buffer.from(rawData as ArrayBuffer).toString();

            const message: WebSocketMessage = JSON.parse(payloadText);
            const client = clientMeta.get(ws);
            const bodyKeys = message && typeof message === 'object' ? Object.keys(message as any) : [];
            const dataKeys = message?.data && typeof message.data === 'object'
              ? Object.keys(message.data)
              : [];

            console.log('[WebSocket] 收到 WS 消息:', {
              clientId: client?.id,
              address: client?.address,
              type: message?.type,
              hasData: message?.data !== undefined,
              bodyKeys,
              dataKeys,
              bytes: Buffer.byteLength(payloadText, 'utf8')
            });

            // 处理不同类型的消息
            handleMessage(ws, message, clients, { clientMeta, uploadSessions, projectRoot });
          } catch (err) {
            console.error('[WebSocket] 解析消息失败:', err);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: '消息格式错误' 
            }));
          }
        });

        // 处理连接关闭
        ws.on('close', () => {
          console.log('[WebSocket] 客户端断开连接');
          clients.delete(ws);
          clientMeta.delete(ws);
        });

        // 处理错误
        ws.on('error', (err) => {
          console.error('[WebSocket] 连接错误:', err);
          clients.delete(ws);
          clientMeta.delete(ws);
        });
      });

      // HTTP API: 获取当前 WS 客户端信息
      server.middlewares.use('/api/ws/clients', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const list = Array.from(clientMeta.values()).map((item) => ({
          id: item.id,
          type: item.type,
          version: item.version,
          address: item.address,
          connectedAt: item.connectedAt
        }));
        
        // 统计各类型客户端数量
        const stats = Array.from(clientMeta.values()).reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ 
          clients: list,
          stats,
          total: list.length
        }));
      });

      // HTTP API: 发送消息给全部客户端
      server.middlewares.use('/api/ws/send', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', () => {
          try {
            const parsedBody = JSON.parse(body || '{}');
            const { type } = parsedBody;
            const payload = (parsedBody as any).payload;
            const targetClientType = (parsedBody as any).targetClientType;
            const targetClientTypes = (parsedBody as any).targetClientTypes;
            // 兼容历史字段：payload / data
            const data = payload !== undefined
              ? payload
              : (parsedBody as any).data;

            // 验证 type
            if (!type || typeof type !== 'string') {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'type is required' }));
              return;
            }

            // 验证 data
            if (data === undefined || data === null) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'data is required' }));
              return;
            }

            // 针对 sync-widget-content 的特殊验证
            if (type === 'sync-widget-content') {
              // 验证 widgetId（必需字段）
              if (!parsedBody.widgetId || typeof parsedBody.widgetId !== 'string') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'widgetId is required for sync-widget-content' }));
                return;
              }

              // 验证 data.layers 不为空
              if (!data || typeof data !== 'object' || !data.layers) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'data.layers is required' }));
                return;
              }

              if (!Array.isArray(data.layers) || data.layers.length === 0) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'data.layers array is empty' }));
                return;
              }
            }

            // 针对 sync-page-content 的验证
            if (type === 'sync-page-content') {
              // 验证 data.layers 不为空
              if (!data || typeof data !== 'object' || !data.layers) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'data.layers is required' }));
                return;
              }

              if (!Array.isArray(data.layers) || data.layers.length === 0) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'data.layers array is empty' }));
                return;
              }
            }

            const allClientCount = clients.size;
            const normalizedTargetClientTypes = Array.isArray(targetClientTypes)
              ? targetClientTypes.filter((v) => typeof v === 'string' && v)
              : typeof targetClientType === 'string' && targetClientType
                ? [targetClientType]
                : [];

            // 这里的 targetClientTypes 是插件层的“按客户端类型定向”机制。
            // 当前前端仅对 vscode/cursor 做 open-file 的稳定投递；其他 IDE 本轮通过系统命令打开，不走 WS 定向。
            const targetClients = normalizedTargetClientTypes.length === 0
              ? clients
              : new Set(
                Array.from(clients).filter((ws) => {
                  const meta = clientMeta.get(ws);
                  return meta?.type && normalizedTargetClientTypes.includes(meta.type);
                })
              );

            const targetClientCount = targetClients.size;
            
            // 如果没有客户端连接
            if (allClientCount === 0) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true, sent: 0, warning: 'no clients connected' }));
              return;
            }

            console.log('[WebSocket] /api/ws/send 请求:', {
              type,
              hasPayload: data !== undefined,
              clientCount: allClientCount,
              targetClientCount,
              targetClientTypes: normalizedTargetClientTypes,
              bodyKeys: parsedBody && typeof parsedBody === 'object' ? Object.keys(parsedBody) : []
            });

            // 立即返回成功状态（不等待渲染完成）
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              ok: true,
              sent: targetClientCount,
              ...(normalizedTargetClientTypes.length > 0 && targetClientCount === 0
                ? { warning: 'no target clients connected' }
                : {})
            }));

            // 异步广播消息（不阻塞响应）
            setImmediate(() => {
              try {
                // 构建完整的消息对象，包含所有字段（type, widgetId/pageId, data, blurImages, metadata 等）
                const message: any = {
                  type,
                  ...(parsedBody.widgetId ? { widgetId: parsedBody.widgetId } : {}),
                  ...(parsedBody.pageId ? { pageId: parsedBody.pageId } : {}),
                  ...(payload !== undefined ? { payload } : {}),
                  data,
                  ...(parsedBody.blurImages !== undefined ? { blurImages: parsedBody.blurImages } : {}),
                  ...(parsedBody.metadata ? { metadata: parsedBody.metadata } : {})
                };
                const sentCount = broadcast(targetClients, message);
                console.log('[WebSocket] 消息已广播:', { type, sentCount });
              } catch (err) {
                console.error('[WebSocket] 广播消息失败:', err);
              }
            });

          } catch (err) {
            console.error('[WebSocket] /api/ws/send 解析失败:', err);
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'invalid json body' }));
          }
        });
      });

      // 服务器关闭时清理
      server.httpServer?.on('close', () => {
        if (wss) {
          wss.close();
          clients.clear();
          console.log('[WebSocket] 服务器已关闭');
        }

        server.httpServer?.off?.('upgrade', handleUpgrade);
      });
    }
  };
}

/**
 * 处理 WebSocket 消息
 */
function handleMessage(
  ws: WebSocket, 
  message: WebSocketMessage, 
  clients: Set<WebSocket>,
  context: HandleMessageContext
) {
  switch (message.type) {
    case 'identify':
      // 客户端身份识别（支持连接后再发送身份信息）
      {
        const meta = Array.from(clients).find(c => c === ws);
        if (meta) {
          const clientInfo = context.clientMeta.get(ws);
          if (clientInfo) {
            clientInfo.type = message.client || clientInfo.type;
            clientInfo.version = message.version || clientInfo.version;
            context.clientMeta.set(ws, clientInfo);
            console.log('[WebSocket] 客户端已识别:', {
              id: clientInfo.id,
              type: clientInfo.type,
              version: clientInfo.version
            });
          }
        }
        ws.send(JSON.stringify({ 
          type: 'identified',
          message: '身份识别成功'
        }));
      }
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    case 'broadcast':
      // 广播消息给所有客户端
      broadcast(clients, {
        type: 'broadcast',
        data: message.data
      });
      break;

    case 'echo':
      // 回显消息
      ws.send(JSON.stringify({
        type: 'echo',
        data: message.data
      }));
      break;
    case 'chrome-export:init':
      {
        const data = (message.data ?? message.payload ?? {}) as any;
        const transferId = String(data.transferId || '').trim();
        const pageName = String(data.pageName || '').trim();
        const displayName = data.displayName !== undefined ? String(data.displayName).trim() : undefined;
        const mode = data.mode === 'files' ? 'files' : 'zip';
        const totalChunks = Number(data.totalChunks);
        const totalBytes = typeof data.totalBytes === 'number' ? data.totalBytes : undefined;
        const fileNameRaw = String(data.fileName || 'chrome-export.zip');
        const fileName = path.basename(fileNameRaw || 'chrome-export.zip');

        if (!transferId || !isSafeName(transferId)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', message: 'transferId is invalid' });
        }
        if (!pageName || !isSafeName(pageName)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'pageName is invalid' });
        }
        if (!isValidDisplayName(displayName)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'displayName is invalid' });
        }
        if (mode === 'zip' && (!Number.isFinite(totalChunks) || totalChunks <= 0)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'totalChunks is invalid' });
        }
        if (context.uploadSessions.has(transferId)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'transferId already exists' });
        }

        const transferDir = path.join(context.projectRoot, 'temp', 'chrome-export', transferId);
        const filesRoot = mode === 'files' ? path.join(transferDir, 'files') : undefined;
        if (filesRoot) {
          ensureDir(filesRoot);
        }

        const session: UploadSession = {
          transferId,
          pageName,
          displayName,
          fileName,
          mode,
          totalChunks,
          totalBytes,
          receivedChunks: 0,
          receivedBytes: 0,
          chunks: new Map(),
          filesRoot,
          filesReceived: 0,
          startedAt: Date.now()
        };

        context.uploadSessions.set(transferId, session);
        sendWsMessage(ws, { type: 'chrome-export:ack', transferId });
      }
      break;
    case 'chrome-export:chunk':
      {
        const data = (message.data ?? message.payload ?? {}) as any;
        const transferId = String(data.transferId || '').trim();
        const chunkIndex = Number(data.index);
        const chunkData = data.data;

        if (!transferId || !context.uploadSessions.has(transferId)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'unknown transferId' });
        }
        const session = context.uploadSessions.get(transferId)!;
        if (session.mode !== 'zip') {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'chunk not allowed for files mode' });
        }
        if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'invalid chunk index' });
        }
        if (typeof chunkData !== 'string' || !chunkData) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'invalid chunk data' });
        }
        if (chunkIndex >= session.totalChunks) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'chunk index out of range' });
        }

        if (!session.chunks.has(chunkIndex)) {
          const buffer = Buffer.from(chunkData, 'base64');
          session.chunks.set(chunkIndex, buffer);
          session.receivedChunks = session.chunks.size;
          session.receivedBytes += buffer.byteLength;
        }

        sendWsMessage(ws, {
          type: 'chrome-export:progress',
          transferId,
          receivedChunks: session.receivedChunks,
          totalChunks: session.totalChunks,
          receivedBytes: session.receivedBytes,
          totalBytes: session.totalBytes
        });
      }
      break;
    case 'chrome-export:file':
      {
        const data = (message.data ?? message.payload ?? {}) as any;
        const transferId = String(data.transferId || '').trim();
        const relativePath = String(data.path || data.relativePath || '').trim();
        const fileData = data.data;

        if (!transferId || !context.uploadSessions.has(transferId)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'unknown transferId' });
        }
        const session = context.uploadSessions.get(transferId)!;
        if (session.mode !== 'files') {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'file not allowed for zip mode' });
        }
        if (!isSafeRelativePath(relativePath)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'invalid file path' });
        }
        if (typeof fileData !== 'string' || !fileData) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'invalid file data' });
        }
        if (!session.filesRoot) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'files root not ready' });
        }

        const targetPath = path.join(session.filesRoot, relativePath);
        ensureDir(path.dirname(targetPath));

        const buffer = Buffer.from(fileData, 'base64');
        fs.writeFileSync(targetPath, buffer);
        session.filesReceived += 1;

        sendWsMessage(ws, {
          type: 'chrome-export:progress',
          transferId,
          filesReceived: session.filesReceived
        });
      }
      break;
    case 'chrome-export:complete':
      {
        const data = (message.data ?? message.payload ?? {}) as any;
        const transferId = String(data.transferId || '').trim();

        if (!transferId || !context.uploadSessions.has(transferId)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'unknown transferId' });
        }

        const session = context.uploadSessions.get(transferId)!;
        const inboxRoot = path.join(context.projectRoot, 'temp', 'chrome-export');
        const transferDir = path.join(inboxRoot, transferId);
        const extractDir = path.join(transferDir, 'extract');

        if (session.mode === 'zip') {
          const missing: number[] = [];
          for (let i = 0; i < session.totalChunks; i += 1) {
            if (!session.chunks.has(i)) {
              missing.push(i);
            }
          }

          if (missing.length > 0) {
            return sendWsMessage(ws, {
              type: 'chrome-export:error',
              transferId,
              message: 'missing chunks',
              missing
            });
          }

          const orderedBuffers: Buffer[] = new Array(session.totalChunks);
          for (let i = 0; i < session.totalChunks; i += 1) {
            orderedBuffers[i] = session.chunks.get(i)!;
          }

          const zipBuffer = Buffer.concat(orderedBuffers);
          const zipPath = path.join(transferDir, session.fileName);

          ensureDir(transferDir);
          fs.writeFileSync(zipPath, zipBuffer);

          if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
          }
          ensureDir(extractDir);

          sendWsMessage(ws, { type: 'chrome-export:status', transferId, stage: 'extracting' });

          extractZip(zipPath, { dir: extractDir })
          .then(() => {
            const inferred = inferExtractedRootFolder(extractDir);
            if (inferred.entryCount === 0) {
              throw new Error('empty zip');
            }
            const sourceDir = inferred.hasRootFolder
              ? path.join(extractDir, inferred.rootFolderName)
              : extractDir;

            const outputName = session.pageName;
            if (!isSafeName(outputName)) {
              throw new Error('invalid pageName');
            }

            const scriptPath = path.join(context.projectRoot, 'scripts', 'chrome-export-converter.mjs');
            const displayNameArg = session.displayName ? ` --display-name ${quoteForShell(session.displayName)}` : '';
            const command = `node "${scriptPath}" "${sourceDir}" "${outputName}"${displayNameArg}`;

            sendWsMessage(ws, { type: 'chrome-export:status', transferId, stage: 'importing' });

            exec(command, (error, stdout, stderr) => {
              if (error) {
                sendWsMessage(ws, {
                  type: 'chrome-export:error',
                  transferId,
                  message: error.message || 'import failed'
                });
              } else {
                const outputDir = path.join(context.projectRoot, 'src', 'pages', outputName);
                sendWsMessage(ws, {
                  type: 'chrome-export:done',
                  transferId,
                  pageName: outputName,
                  displayName: session.displayName,
                  sourceDir,
                  outputDir,
                  stdout: stdout ? String(stdout).trim() : undefined,
                  stderr: stderr ? String(stderr).trim() : undefined
                });
                if (fs.existsSync(transferDir)) {
                  fs.rmSync(transferDir, { recursive: true, force: true });
                }
                context.uploadSessions.delete(transferId);
              }
            });
          })
          .catch((error: any) => {
            sendWsMessage(ws, {
              type: 'chrome-export:error',
              transferId,
              message: error?.message || 'extract failed'
            });
          });
        } else {
          if (!session.filesRoot) {
            return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'files root not ready' });
          }

          const sourceDir = session.filesRoot;
          const outputName = session.pageName;
          if (!isSafeName(outputName)) {
            return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'invalid pageName' });
          }

          const scriptPath = path.join(context.projectRoot, 'scripts', 'chrome-export-converter.mjs');
          const displayNameArg = session.displayName ? ` --display-name ${quoteForShell(session.displayName)}` : '';
          const command = `node "${scriptPath}" "${sourceDir}" "${outputName}"${displayNameArg}`;

          sendWsMessage(ws, { type: 'chrome-export:status', transferId, stage: 'importing' });

          exec(command, (error, stdout, stderr) => {
            if (error) {
              sendWsMessage(ws, {
                type: 'chrome-export:error',
                transferId,
                message: error.message || 'import failed'
              });
            } else {
              const outputDir = path.join(context.projectRoot, 'src', 'pages', outputName);
              sendWsMessage(ws, {
                type: 'chrome-export:done',
                transferId,
                pageName: outputName,
                displayName: session.displayName,
                sourceDir,
                outputDir,
                stdout: stdout ? String(stdout).trim() : undefined,
                stderr: stderr ? String(stderr).trim() : undefined
              });
              if (fs.existsSync(transferDir)) {
                fs.rmSync(transferDir, { recursive: true, force: true });
              }
              context.uploadSessions.delete(transferId);
            }
          });
        }
      }
      break;
    case 'chrome-export:abort':
      {
        const data = (message.data ?? message.payload ?? {}) as any;
        const transferId = String(data.transferId || '').trim();
        if (!transferId || !context.uploadSessions.has(transferId)) {
          return sendWsMessage(ws, { type: 'chrome-export:error', transferId, message: 'unknown transferId' });
        }
        context.uploadSessions.delete(transferId);
        sendWsMessage(ws, { type: 'chrome-export:aborted', transferId });
      }
      break;

    default:
      // 未知消息类型，可以在这里添加自定义处理逻辑
      console.log('[WebSocket] 未处理的消息类型:', message.type);
      ws.send(JSON.stringify({
        type: 'unknown',
        message: `未知的消息类型: ${message.type}`
      }));
  }
}

/**
 * 广播消息给所有连接的客户端
 */
function broadcast(clients: Set<WebSocket>, message: WebSocketMessage) {
  const data = JSON.stringify(message);
  let count = 0;
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
      count += 1;
    }
  });
  return count;
}
