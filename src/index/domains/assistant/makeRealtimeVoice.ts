import {
  MakeVoiceToolError,
  type MakeVoiceToolExecutionContext,
  type MakeVoiceToolRegistration,
} from './makeVoiceTools';
import { MakeVoiceCommentPersistenceError } from './makeVoiceCommentPersistence';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';

export interface MakeVoiceFoundationStatus {
  appId: string;
  hasAccessKey: boolean;
  ready: boolean;
}

interface MakeVoiceRuntimeStatus {
  health?: {
    status?: string;
    message?: string;
  };
}

export async function checkMakeVoiceConfiguration(
  projectId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<MakeVoiceFoundationStatus> {
  const endpoint = withProjectScope(
    '/api/config/voice-assistant',
    requireProjectScope(projectId),
  );
  const response = await fetchImpl(endpoint, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('无法读取 Make 豆包语音配置');
  const payload = await response.json();
  const doubao = payload?.settings?.doubao;
  const appId = typeof doubao?.appId === 'string' ? doubao.appId.trim() : '';
  const hasAccessKey = doubao?.hasAccessKey === true;
  return {
    appId,
    hasAccessKey,
    ready: Boolean(appId && hasAccessKey),
  };
}

export async function checkMakeVoiceConfigurationAfterRuntimeReady(
  projectId: string,
  connectRuntime: () => Promise<MakeVoiceRuntimeStatus | null | undefined>,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<MakeVoiceFoundationStatus> {
  const runtime = await connectRuntime();
  if (runtime?.health?.status !== 'ready') {
    throw new Error(runtime?.health?.message || 'ACP UI 服务未就绪，请稍后重试');
  }
  return checkMakeVoiceConfiguration(projectId, fetchImpl);
}

export type MakeRealtimeVoiceHostTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
  execute: (
    input: unknown,
    context: {
      requestId: string;
      sessionId: string;
      signal: AbortSignal;
      reportProgress(message: string): void;
    },
  ) => Promise<unknown>;
};

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError')
    || Boolean(error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError');
}

function structuredToolError(error: unknown): {
  ok: false;
  error: { code: string; message: string; recoverable: boolean };
} {
  const trusted = error instanceof MakeVoiceToolError
    || error instanceof MakeVoiceCommentPersistenceError;
  const code = trusted ? error.code : 'TOOL_EXECUTION_FAILED';
  return {
    ok: false,
    error: {
      code,
      message: trusted
        ? error.message.trim()
        : '工具暂时无法完成，请根据当前页面状态重试',
      recoverable: error instanceof MakeVoiceCommentPersistenceError
        ? error.recoverable
        : true,
    },
  };
}

export async function executeMakeVoiceTool(
  registration: MakeVoiceToolRegistration,
  input: unknown,
  context: MakeVoiceToolExecutionContext,
): Promise<unknown> {
  try {
    return await registration.execute(input, context);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return structuredToolError(error);
  }
}

/**
 * Maps Make business operations onto ACP's host-neutral room RPC contract.
 * No speech recognition, synthesis, conversation, or transport state lives here.
 */
export function toAcpVoiceHostTools(
  registrations: readonly MakeVoiceToolRegistration[],
): MakeRealtimeVoiceHostTool[] {
  return registrations.map((registration) => ({
    name: registration.name,
    title: registration.title,
    description: registration.description,
    inputSchema: registration.parameters,
    requiresConfirmation: registration.confirmation === 'required',
    execute: (input, context) => executeMakeVoiceTool(registration, input, {
      callId: context.requestId,
      operationId: context.requestId,
      signal: context.signal,
    }),
  }));
}
