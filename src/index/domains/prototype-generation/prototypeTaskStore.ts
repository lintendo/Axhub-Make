import type { ItemData, PromptClientPreference } from '../../types';
import type { ContextBundleV2 } from '@axhub/acp/runtime';
import { toAcpProvider } from '../../../common/promptExecution';
import type { AcpProvider as AcpPromptProvider } from '../../../common/assistant-context/types';
import { requireProjectScope } from '../../services/projectScope';
import {
  runAcpPrototypeAgent,
  type PrototypeGenerationAgentEvent,
  type PrototypeGenerationArtifact,
  type PrototypeGenerationPrototypeContext,
  type PrototypeGenerationSettings,
} from './acpPrototypeAgentClient';

export type PrototypeGenerationTaskStatus = 'running' | 'done' | 'error';
export type PrototypeGenerationTaskStage =
  | 'submitting'
  | 'running'
  | 'refreshing'
  | 'done'
  | 'error';

export interface PrototypeGenerationTaskRecord {
  id: string;
  prompt: string;
  status: PrototypeGenerationTaskStatus;
  stage: PrototypeGenerationTaskStage;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
  elapsed: number | null;
  sessionId?: string;
  acpxSessionName?: string;
  runId?: string;
  recoverable?: true;
  provider: AcpPromptProvider;
  outputPrototypeName?: string;
  note?: string;
}

export interface PrototypeGenerationSubmitRequest {
  prompt: string;
  preferredPromptClient?: PromptClientPreference;
  provider?: string | null;
  model?: string | null;
  mode?: string | null;
  thought?: string | null;
  contextBundle?: ContextBundleV2 | null;
  canvasFilePath?: string;
  canvasName?: string;
  generatorElementId: string;
  currentPrototype?: PrototypeGenerationPrototypeContext | null;
  knownPrototypes?: PrototypeGenerationPrototypeContext[];
  referenceImages?: string[];
  settings?: PrototypeGenerationSettings;
}

export interface PrototypeGenerationTaskStore {
  getTasks(): PrototypeGenerationTaskRecord[];
  configure(options: { projectId: string; targetPath?: string | null }): Promise<void>;
  subscribe(listener: () => void): () => void;
  submit(request: PrototypeGenerationSubmitRequest, options?: {
    onCreated?: (task: PrototypeGenerationTaskRecord) => void;
    onArtifact?: (artifact: PrototypeGenerationArtifact, task: PrototypeGenerationTaskRecord) => Promise<void> | void;
    onAgentDone?: (task: PrototypeGenerationTaskRecord) => Promise<ItemData | null>;
  }): Promise<PrototypeGenerationTaskRecord>;
  deleteTask(taskId: string): void;
}

interface PrototypeGenerationTaskStoreOptions {
  now?: () => number;
}

const HISTORY_LIMIT = 30;

function createTaskId(): string {
  return `prototype-task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveProvider(preferredPromptClient?: PromptClientPreference, selectedProvider?: string | null): AcpPromptProvider {
  const normalizedProvider = String(selectedProvider || '').trim().toLowerCase();
  if (
    normalizedProvider === 'claude'
    || normalizedProvider === 'codex'
    || normalizedProvider === 'opencode'
  ) {
    return normalizedProvider;
  }
  return toAcpProvider(preferredPromptClient ?? null) || 'codex';
}

function normalizeTargetPath(value: string | null | undefined): string | undefined {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/u, '');
  if (normalized.startsWith('src/resources/') && normalized.endsWith('.excalidraw')) {
    const relativePath = normalized.slice('src/resources/'.length);
    const segments = relativePath.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
      return undefined;
    }
    return normalized;
  }
  const prototypeMatch = normalized.match(/^prototypes\/([^/]+)$/u);
  if (!prototypeMatch?.[1] || prototypeMatch[1].startsWith('.') || prototypeMatch[1].includes('..')) {
    return undefined;
  }
  return `prototypes/${prototypeMatch[1]}`;
}

function trimPrototypeTasks(input: PrototypeGenerationTaskRecord[]): PrototypeGenerationTaskRecord[] {
  return [...input]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, HISTORY_LIMIT);
}

function createScopeKey(projectId: string | undefined, targetPath: string | undefined): string {
  return projectId ? `${projectId}:${targetPath || ''}` : '';
}

export function createPrototypeGenerationTaskStore(
  options: PrototypeGenerationTaskStoreOptions = {},
): PrototypeGenerationTaskStore {
  const now = options.now || (() => Date.now());
  let tasks: PrototypeGenerationTaskRecord[] = [];
  let projectId: string | undefined;
  let targetPath: string | undefined;
  let loadRevision = 0;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const isCurrentScope = (scopeKey: string) => scopeKey === createScopeKey(projectId, targetPath);

  const upsertTask = (task: PrototypeGenerationTaskRecord, scopeKey?: string) => {
    if (scopeKey && !isCurrentScope(scopeKey)) return;
    tasks = trimPrototypeTasks([task, ...tasks.filter((item) => item.id !== task.id)]);
    emit();
  };

  const replaceTask = (previousTaskId: string, task: PrototypeGenerationTaskRecord, scopeKey?: string) => {
    if (scopeKey && !isCurrentScope(scopeKey)) return;
    tasks = trimPrototypeTasks([task, ...tasks.filter((item) => item.id !== previousTaskId && item.id !== task.id)]);
    emit();
  };

  const updateFromAgentEvent = (
    task: PrototypeGenerationTaskRecord,
    event: PrototypeGenerationAgentEvent,
    scopeKey: string,
  ) => {
    if (event.stage === 'activity') {
      const nextTask: PrototypeGenerationTaskRecord = {
        ...task,
        stage: 'running',
        ...(event.sessionId ? { sessionId: event.sessionId, acpxSessionName: event.sessionId } : {}),
      };
      upsertTask(nextTask, scopeKey);
      return nextTask;
    }
    const nextStage: PrototypeGenerationTaskStage = event.stage === 'accepted'
      ? 'submitting'
      : event.stage === 'completed'
        ? 'refreshing'
        : event.stage === 'error'
          ? 'error'
          : 'running';
    const nextTask: PrototypeGenerationTaskRecord = {
      ...task,
      stage: nextStage,
      ...(event.sessionId ? { sessionId: event.sessionId, acpxSessionName: event.sessionId } : {}),
      ...(event.stage === 'error' ? { status: 'error', error: event.message || 'AI 生成执行失败' } : {}),
    };
    upsertTask(nextTask, scopeKey);
    return nextTask;
  };

  return {
    getTasks: () => tasks,
    async configure({ projectId: nextProjectId, targetPath: nextTargetPath }) {
      const scope = requireProjectScope(nextProjectId);
      const normalizedTargetPath = normalizeTargetPath(nextTargetPath);
      const nextScopeKey = createScopeKey(scope.projectId, normalizedTargetPath);
      if (nextScopeKey === createScopeKey(projectId, targetPath)) return;
      projectId = scope.projectId;
      targetPath = normalizedTargetPath;
      loadRevision += 1;
      tasks = [];
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async submit(request, submitOptions = {}) {
      const scope = requireProjectScope(projectId);
      const submissionScopeKey = createScopeKey(scope.projectId, targetPath);
      const createdAt = now();
      let task: PrototypeGenerationTaskRecord = {
        id: createTaskId(),
        prompt: request.prompt,
        status: 'running',
        stage: 'submitting',
        error: null,
        createdAt,
        finishedAt: null,
        elapsed: null,
        runId: '',
        recoverable: true,
        provider: resolveProvider(request.preferredPromptClient, request.provider),
      };
      task = {
        ...task,
        runId: task.id,
      };
      upsertTask(task, submissionScopeKey);
      submitOptions.onCreated?.(task);
      const artifactHandlerPromises: Promise<void>[] = [];

      try {
        const result = await runAcpPrototypeAgent({
          projectId: scope.projectId,
          taskId: task.id,
          provider: task.provider,
          prompt: request.prompt,
          canvasFilePath: request.canvasFilePath,
          targetPath,
          canvasName: request.canvasName,
          generatorElementId: request.generatorElementId,
          currentPrototype: request.currentPrototype,
          knownPrototypes: request.knownPrototypes,
          referenceImages: request.referenceImages,
          settings: request.settings,
          model: request.model,
          mode: request.mode,
          thought: request.thought,
          contextBundle: request.contextBundle,
          onEvent: (event) => {
            if (!isCurrentScope(submissionScopeKey)) return;
            task = updateFromAgentEvent(task, event, submissionScopeKey);
            if (event.artifact) {
              const artifactHandlerPromise = Promise.resolve(submitOptions.onArtifact?.(event.artifact, task))
                .catch((error) => console.warn('[Axhub Prototype Generation] Failed to apply streamed artifact:', error));
              artifactHandlerPromises.push(artifactHandlerPromise);
            }
          },
        });
        if (!isCurrentScope(submissionScopeKey)) {
          const finishedAt = now();
          return {
            ...task,
            status: 'error',
            stage: 'error',
            error: '项目已切换',
            finishedAt,
            elapsed: Math.max(0, finishedAt - createdAt),
          };
        }
        await Promise.all(artifactHandlerPromises);

        const acpxSessionName = result.sessionId || task.acpxSessionName;
        const localTaskId = task.id;
        if (acpxSessionName) {
          task = {
            ...task,
            sessionId: acpxSessionName,
            acpxSessionName,
            runId: localTaskId,
          };
        }

        if (result.status === 'error') {
          throw new Error(result.error || 'AI 生成执行失败');
        }

        task = {
          ...task,
          stage: 'refreshing',
        };
        upsertTask(task, submissionScopeKey);

        const createdPrototype = await submitOptions.onAgentDone?.(task);
        const finishedAt = now();
        task = {
          ...task,
          id: localTaskId,
          status: 'done',
          stage: 'done',
          finishedAt,
          elapsed: Math.max(0, finishedAt - createdAt),
          outputPrototypeName: createdPrototype?.name,
          runId: localTaskId,
          recoverable: true,
          ...(createdPrototype ? {} : { note: 'AI 生成已完成，但暂未检测到新增原型资源。' }),
        };
        replaceTask(localTaskId, task, submissionScopeKey);
        return task;
      } catch (error: any) {
        const finishedAt = now();
        task = {
          ...task,
          status: 'error',
          stage: 'error',
          error: error?.message || '生成原型失败',
          finishedAt,
          elapsed: Math.max(0, finishedAt - createdAt),
        };
        upsertTask(task, submissionScopeKey);
        return task;
      }
    },
    deleteTask(taskId) {
      const nextTasks = tasks.filter((task) => task.id !== taskId);
      if (nextTasks.length === tasks.length) return;
      tasks = nextTasks;
      emit();
    },
  };
}

let singletonStore: PrototypeGenerationTaskStore | null = null;

export function getPrototypeGenerationTaskStore(): PrototypeGenerationTaskStore {
  if (!singletonStore) {
    singletonStore = createPrototypeGenerationTaskStore();
  }
  return singletonStore;
}
