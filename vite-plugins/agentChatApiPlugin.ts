import type { Plugin } from 'vite';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { streamText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { codexCli } from 'ai-sdk-provider-codex-cli';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

type AIEngine = 'claude' | 'codex';

type ChatRequest = {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  engine: AIEngine;
  model?: string;
  requestId: string;
  options?: {
    systemPrompt?: string;
    systemPromptPreset?: 'claude_code';
    settingSources?: Array<'user' | 'project' | 'local'>;
    allowedTools?: string[];
    maxBudgetUsd?: number;
    reasoningEffort?: 'low' | 'medium' | 'high';
    approvalMode?: 'on-failure' | 'on-request' | 'never';
    sandboxMode?: 'workspace-write' | 'workspace-read' | 'read-only' | 'disabled';
  };
};

type StatusResponse = {
  ok: boolean;
  engines: {
    claude: boolean;
    codex: boolean;
  };
  versions?: {
    claude?: string | null;
    codex?: string | null;
  };
  timestamp: string;
  message?: string;
};

type ThreadStatus = 'regular' | 'archived';

type ThreadMessageItem = {
  parentId: string | null;
  message: any;
};

type ThreadRecord = {
  id: string;
  externalId?: string;
  title?: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  messages: ThreadMessageItem[];
};

type LowdbData = {
  threads: Record<string, ThreadRecord>;
};

const DEFAULT_MODELS: Record<AIEngine, string> = {
  claude: 'claude-sonnet-4-5',
  codex: 'gpt-5.1-codex'
};

function hasCommand(cmd: string): boolean {
  const checker = platform() === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

function getCommandVersion(cmd: string): string | null {
  try {
    const result = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (result.status !== 0) return null;
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    return output || null;
  } catch {
    return null;
  }
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: any, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function sendSse(res: any, payload: any) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isDebugEnabled(req: any) {
  const header = req?.headers?.['x-ai-chat-debug'];
  return header === '1' || header === 'true';
}

function debugLog(enabled: boolean, ...args: any[]) {
  if (!enabled) return;
  console.log('[agent-chat]', ...args);
}

function isAbortError(error: any): boolean {
  return Boolean(error?.name === 'AbortError' || error?.code === 'ABORT_ERR');
}

function formatErrorMessage(error: any): string {
  const base = error?.message || 'Unknown error';
  const stderr = typeof error?.data?.stderr === 'string' ? error.data.stderr.trim() : '';
  if (!stderr) return base;
  const trimmed = stderr.length > 800 ? `${stderr.slice(0, 800)}...` : stderr;
  return `${base}\n${trimmed}`;
}

const THREADS_PREFIX = '/api/agent/threads';
const DB_FILE = path.resolve(process.cwd(), 'apps/axhub-make/.data/ai-chat-db.json');
let db: Low<LowdbData> | null = null;

async function getDb() {
  if (!db) {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    db = new Low<LowdbData>(new JSONFile<LowdbData>(DB_FILE), { threads: {} });
  }
  await db.read();
  if (!db.data) {
    db.data = { threads: {} };
  }
  return db;
}

function toThreadMeta(thread: ThreadRecord) {
  return {
    status: thread.status,
    remoteId: thread.id,
    externalId: thread.externalId,
    title: thread.title
  };
}

export function agentChatApiPlugin(): Plugin {
  const activeRequests = new Map<string, AbortController>();

  return {
    name: 'agent-chat-api',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith(THREADS_PREFIX)) return next();

        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;
        if (!pathname.startsWith(THREADS_PREFIX)) return next();

        const parts = pathname.slice(THREADS_PREFIX.length).split('/').filter(Boolean);
        const method = req.method?.toUpperCase();
        const database = await getDb();

        if (parts.length === 0) {
          if (method === 'GET') {
            const threads = Object.values(database.data!.threads)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map(toThreadMeta);
            sendJson(res, 200, { threads });
            return;
          }

          if (method === 'POST') {
            const body = await readJsonBody(req);
            const externalId = typeof body?.externalId === 'string' ? body.externalId : undefined;
            if (externalId) {
              const existing = Object.values(database.data!.threads)
                .find((thread) => thread.externalId === externalId);
              if (existing) {
                sendJson(res, 200, { remoteId: existing.id, externalId: existing.externalId });
                return;
              }
            }

            const id = randomUUID();
            const now = new Date().toISOString();
            database.data!.threads[id] = {
              id,
              externalId,
              status: 'regular',
              createdAt: now,
              updatedAt: now,
              messages: []
            };
            await database.write();
            sendJson(res, 200, { remoteId: id, externalId });
            return;
          }

          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        const threadId = decodeURIComponent(parts[0]);
        const thread = database.data!.threads[threadId];

        if (parts.length === 1) {
          if (!thread) {
            sendJson(res, 404, { error: 'Thread not found' });
            return;
          }

          if (method === 'GET') {
            sendJson(res, 200, toThreadMeta(thread));
            return;
          }

          if (method === 'PATCH') {
            const body = await readJsonBody(req);
            if (typeof body?.title === 'string') {
              thread.title = body.title.trim() || undefined;
            }
            if (body?.status === 'archived' || body?.status === 'regular') {
              thread.status = body.status;
            }
            thread.updatedAt = new Date().toISOString();
            await database.write();
            sendJson(res, 200, toThreadMeta(thread));
            return;
          }

          if (method === 'DELETE') {
            delete database.data!.threads[threadId];
            await database.write();
            sendJson(res, 200, { success: true });
            return;
          }

          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        if (parts.length === 2 && parts[1] === 'messages') {
          if (!thread) {
            sendJson(res, 404, { error: 'Thread not found' });
            return;
          }

          if (method === 'GET') {
            sendJson(res, 200, { messages: thread.messages ?? [] });
            return;
          }

          if (method === 'POST') {
            const body = await readJsonBody(req);
            if (!body?.message?.id) {
              sendJson(res, 400, { error: 'Missing message payload' });
              return;
            }
            const existingIndex = thread.messages.findIndex(
              (item) => item.message?.id === body.message.id
            );
            if (existingIndex >= 0) {
              thread.messages[existingIndex] = body;
            } else {
              thread.messages.push(body);
            }
            thread.updatedAt = new Date().toISOString();
            await database.write();
            sendJson(res, 200, { success: true });
            return;
          }

          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
      });

      server.middlewares.use('/api/agent/status', (req: any, res: any, next: any) => {
        if (req.method !== 'GET') return next();
        const debug = isDebugEnabled(req);

        const claudeAvailable = hasCommand('claude');
        const codexAvailable = hasCommand('codex');

        const payload: StatusResponse = {
          ok: claudeAvailable || codexAvailable,
          engines: {
            claude: claudeAvailable,
            codex: codexAvailable
          },
          versions: {
            claude: claudeAvailable ? getCommandVersion('claude') : null,
            codex: codexAvailable ? getCommandVersion('codex') : null
          },
          timestamp: new Date().toISOString()
        };

        debugLog(debug, 'status', payload);
        sendJson(res, 200, payload);
      });

      server.middlewares.use('/api/agent/chat', async (req: any, res: any, next: any) => {
        if (req.method !== 'POST') return next();
        const debug = isDebugEnabled(req);

        let body: ChatRequest | null = null;

        try {
          body = await readJsonBody(req);
        } catch (error: any) {
          debugLog(debug, 'chat:invalid-body', error?.message);
          sendJson(res, 400, { error: error?.message || 'Invalid JSON body' });
          return;
        }

        const { messages, engine = 'claude', model, requestId, options } = body || ({} as ChatRequest);

        if (!requestId) {
          debugLog(debug, 'chat:missing-requestId');
          sendJson(res, 400, { error: 'Missing requestId' });
          return;
        }

        if (!Array.isArray(messages)) {
          debugLog(debug, 'chat:invalid-messages');
          sendJson(res, 400, { error: 'Invalid messages payload' });
          return;
        }

        const abortController = new AbortController();
        activeRequests.set(requestId, abortController);

        const cleanup = () => {
          activeRequests.delete(requestId);
        };

        req.on('close', () => {
          if (!abortController.signal.aborted) {
            abortController.abort();
          }
          cleanup();
        });

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        res.flushHeaders?.();

        try {
          debugLog(debug, 'chat:start', { engine, model, requestId });
          const resolvedEngine: AIEngine = engine === 'codex' ? 'codex' : 'claude';
          const modelName = model || DEFAULT_MODELS[resolvedEngine];
          const aiModel = resolvedEngine === 'codex'
            ? codexCli(modelName, {
              allowNpx: true,
              skipGitRepoCheck: true,
              approvalMode: options?.approvalMode ?? 'on-failure',
              sandboxMode: options?.sandboxMode ?? 'workspace-write',
              reasoningEffort: options?.reasoningEffort
            } as any)
            : claudeCode(modelName, {
              systemPrompt: options?.systemPrompt ?? (options?.systemPromptPreset ? { type: 'preset', preset: options.systemPromptPreset } : { type: 'preset', preset: 'claude_code' }),
              settingSources: options?.settingSources ?? ['project', 'user', 'local'],
              allowedTools: options?.allowedTools,
              maxBudgetUsd: options?.maxBudgetUsd
            } as any);

          const result = streamText({
            model: aiModel,
            messages: messages || [],
            abortSignal: abortController.signal
          });

          let usage: any;
          let streamedText = '';

          const stream: AsyncIterable<any> = (result as any).fullStream
            ? (result as any).fullStream
            : (async function* fallback() {
              for await (const delta of result.textStream) {
                yield { type: 'text-delta', textDelta: delta };
              }
            })();

          for await (const part of stream) {
            if (!part) continue;

            if (part.type === 'text-delta') {
              const delta = part.textDelta ?? part.delta ?? '';
              if (!delta) continue;
              streamedText += delta;
              debugLog(debug, 'chat:text-delta', { delta });
              sendSse(res, { type: 'text-delta', delta });
            } else if (part.type === 'reasoning-delta') {
              const delta = part.textDelta ?? part.delta ?? part.reasoningDelta ?? '';
              if (!delta) continue;
              debugLog(debug, 'chat:reasoning-delta', { delta });
              sendSse(res, { type: 'reasoning-delta', delta });
            } else if (part.type === 'reasoning') {
              const delta = part.text ?? '';
              if (!delta) continue;
              debugLog(debug, 'chat:reasoning', { delta });
              sendSse(res, { type: 'reasoning-delta', delta });
            } else if (part.type === 'tool-call') {
              const toolCall = part.toolCall ?? part;
              const toolInput =
                part.args ??
                toolCall?.args ??
                toolCall?.input ??
                toolCall?.arguments ??
                part.input ??
                part.argsText ??
                toolCall?.argsText;
              sendSse(res, {
                type: 'tool-call-start',
                toolName: part.toolName ?? toolCall?.name ?? 'tool',
                toolId: part.toolCallId ?? toolCall?.id ?? part.toolId ?? '',
                input: toolInput
              });
            } else if (part.type === 'tool-result') {
              debugLog(debug, 'chat:tool-result', { toolId: part.toolCallId ?? part.toolCall?.id ?? part.toolId ?? '' });
              sendSse(res, {
                type: 'tool-call-result',
                toolId: part.toolCallId ?? part.toolCall?.id ?? part.toolId ?? '',
                result: part.result
              });
            } else if (part.type === 'finish' && part.usage) {
              debugLog(debug, 'chat:finish', part.usage);
              usage = part.usage;
              const finishText = part.text ?? part.response?.text ?? '';
              if (finishText && !streamedText) {
                streamedText = finishText;
                sendSse(res, { type: 'text-delta', delta: finishText });
              }
            } else if (part.type === 'error') {
              debugLog(debug, 'chat:stream-error', part.error?.message);
              sendSse(res, { type: 'error', message: part.error?.message || 'Stream error' });
            }
          }

          if (!usage) {
            try {
              usage = await (result as any).usage;
            } catch {
              usage = undefined;
            }
          }

          if (!streamedText) {
            try {
              const finalText = await (result as any).text;
              if (finalText) {
                sendSse(res, { type: 'text-delta', delta: finalText });
              }
            } catch {
              // ignore missing final text
            }
          }

          debugLog(debug, 'chat:done', usage);
          sendSse(res, { type: 'done', usage });
        } catch (error: any) {
          console.error('[agent-chat] error:', error);
          if (abortController.signal.aborted || isAbortError(error)) {
            sendSse(res, { type: 'done' });
          } else {
            sendSse(res, { type: 'error', message: formatErrorMessage(error) });
          }
        } finally {
          cleanup();
          res.end();
        }
      });

      server.middlewares.use('/api/agent/cancel', async (req: any, res: any, next: any) => {
        if (req.method !== 'POST') return next();

        let body: { requestId?: string } = {};
        try {
          body = await readJsonBody(req);
        } catch (error: any) {
          sendJson(res, 400, { error: error?.message || 'Invalid JSON body' });
          return;
        }

        const requestId = body.requestId;
        if (requestId) {
          const controller = activeRequests.get(requestId);
          if (controller && !controller.signal.aborted) {
            controller.abort();
          }
          activeRequests.delete(requestId);
        }

        sendJson(res, 200, { success: true });
      });
    }
  };
}
