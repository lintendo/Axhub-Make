export type GenerationArtifactKind = 'image' | 'prototype' | 'document' | 'drawio' | 'file' | 'link';
export type GenerationArtifactOperation = 'created' | 'updated';
export type GenerationArtifactStatus = 'running' | 'done' | 'error';

export interface GenerationArtifactScope {
  projectId: string;
  targetPath?: string | null;
}

export interface GenerationArtifactUpdateOptions {
  status?: GenerationArtifactStatus;
  scope?: GenerationArtifactScope;
}

export interface GenerationArtifactRecord {
  id: string;
  artifactId: string;
  taskId?: string;
  conversationId?: string;
  kind: GenerationArtifactKind;
  operation: GenerationArtifactOperation;
  title: string;
  prompt?: string;
  source: Record<string, unknown>;
  target: Record<string, unknown>;
  assetRef?: Record<string, unknown>;
  runId?: string;
  threadId?: string;
  createdAt: number;
  updatedAt: number;
  status: GenerationArtifactStatus;
  metadata: Record<string, unknown>;
}

export interface GenerationArtifactHistoryState {
  projectId?: string;
  targetPath?: string;
  artifacts: GenerationArtifactRecord[];
  loading: boolean;
  error: string | null;
}

export interface GenerationArtifactHistoryStore {
  configure(options: { projectId: string; targetPath?: string | null }): Promise<void>;
  load(): Promise<void>;
  subscribe(listener: (state: GenerationArtifactHistoryState) => void): () => void;
  getState(): GenerationArtifactHistoryState;
  upsertArtifact(artifact: unknown, options?: GenerationArtifactUpdateOptions): void;
  upsertArtifactAndPersist(artifact: unknown, options?: GenerationArtifactUpdateOptions): Promise<void>;
  deleteArtifact(id: string): Promise<void>;
}

function endpoint(projectId: string, targetPath: string): string {
  return withProjectScope(
    `/api/ai/artifact-history?targetPath=${encodeURIComponent(targetPath)}`,
    { projectId },
  );
}

function createScopeKey(projectId: string | undefined, targetPath: string | undefined): string {
  return projectId && targetPath ? `${projectId}:${targetPath}` : '';
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
  if (!prototypeMatch?.[1] || prototypeMatch[1].startsWith('.') || prototypeMatch[1].includes('..')) return undefined;
  return `prototypes/${prototypeMatch[1]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function resolveKind(value: unknown): GenerationArtifactKind {
  if (
    value === 'image'
    || value === 'prototype'
    || value === 'document'
    || value === 'drawio'
    || value === 'file'
    || value === 'link'
  ) {
    return value;
  }
  return 'file';
}

function resolveOperation(value: unknown): GenerationArtifactOperation {
  return value === 'updated' ? 'updated' : 'created';
}

function resolveStatus(value: unknown, fallback: GenerationArtifactStatus): GenerationArtifactStatus {
  if (value === 'running' || value === 'done' || value === 'error') return value;
  return fallback;
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/').split(/[?#]/u)[0] || '';
  return normalized.split('/').filter(Boolean).pop() || normalized;
}

function resolveTitle(record: Record<string, unknown>, kind: GenerationArtifactKind): string {
  const target = isRecord(record.target) ? record.target : {};
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  return stringField(record.title)
    || stringField(metadata.title)
    || stringField(metadata.name)
    || stringField(metadata.fileName)
    || basename(stringField(target.path) || stringField(target.uri) || stringField(target.url))
    || (kind === 'image' ? '生成图片' : 'AI 生成产物');
}

function normalizeArtifact(input: unknown, fallbackStatus: GenerationArtifactStatus): GenerationArtifactRecord | null {
  if (!isRecord(input)) return null;
  const now = Date.now();
  const kind = resolveKind(input.kind);
  const target = isRecord(input.target) ? input.target : {};
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const id = stringField(input.id);
  if (!id) return null;
  return {
    id,
    artifactId: stringField(input.artifactId) || id,
    ...(stringField(input.taskId) ? { taskId: stringField(input.taskId) } : {}),
    ...(stringField(input.conversationId) ? { conversationId: stringField(input.conversationId) } : {}),
    kind,
    operation: resolveOperation(input.operation),
    title: resolveTitle(input, kind),
    ...(stringField(input.prompt) ? { prompt: stringField(input.prompt) } : {}),
    source: isRecord(input.source) ? input.source : {},
    target,
    ...(isRecord(input.assetRef) ? { assetRef: input.assetRef } : {}),
    ...(stringField(input.runId) ? { runId: stringField(input.runId) } : {}),
    ...(stringField(input.threadId) ? { threadId: stringField(input.threadId) } : {}),
    createdAt: numberField(input.createdAt, now),
    updatedAt: numberField(input.updatedAt, numberField(input.createdAt, now)),
    status: resolveStatus(input.status, fallbackStatus),
    metadata,
  };
}

function sortArtifacts(artifacts: GenerationArtifactRecord[]): GenerationArtifactRecord[] {
  return [...artifacts].sort((left, right) => Number(right.updatedAt || right.createdAt || 0) - Number(left.updatedAt || left.createdAt || 0));
}

export function createGenerationArtifactHistoryStore(): GenerationArtifactHistoryStore {
  let state: GenerationArtifactHistoryState = {
    artifacts: [],
    loading: false,
    error: null,
  };
  let loadRevision = 0;
  const listeners = new Set<(state: GenerationArtifactHistoryState) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  const setState = (nextState: GenerationArtifactHistoryState) => {
    state = nextState;
    emit();
  };

  const matchesScope = (scope: GenerationArtifactScope | undefined): boolean => {
    if (!scope) return true;
    return createScopeKey(scope.projectId.trim(), normalizeTargetPath(scope.targetPath))
      === createScopeKey(state.projectId, state.targetPath);
  };

  const persistArtifact = async (artifact: GenerationArtifactRecord) => {
    const { projectId, targetPath } = state;
    if (!projectId || !targetPath) return;
    const scopeKey = createScopeKey(projectId, targetPath);
    const response = await fetch(endpoint(projectId, targetPath), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifact }),
    });
    if (!response.ok) {
      throw new Error(`保存生成记录失败 (${response.status})`);
    }
    if (scopeKey !== createScopeKey(state.projectId, state.targetPath)) return;
  };

  const upsertNormalizedArtifact = (
    artifact: unknown,
    fallbackStatus: GenerationArtifactStatus,
  ): GenerationArtifactRecord | null => {
    const normalized = normalizeArtifact(artifact, fallbackStatus);
    if (!normalized) return null;
    const previous = state.artifacts.find((item) => item.id === normalized.id);
    setState({
      ...state,
      artifacts: sortArtifacts([
        {
          ...previous,
          ...normalized,
          createdAt: previous?.createdAt || normalized.createdAt,
        },
        ...state.artifacts.filter((item) => item.id !== normalized.id),
      ]),
    });
    return state.artifacts.find((item) => item.id === normalized.id) || normalized;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async configure({ projectId, targetPath }) {
      const scope = requireProjectScope(projectId);
      const nextTargetPath = normalizeTargetPath(targetPath);
      const nextScopeKey = createScopeKey(scope.projectId, nextTargetPath);
      if (nextScopeKey === createScopeKey(state.projectId, state.targetPath)) return;
      loadRevision += 1;
      setState({
        projectId: scope.projectId,
        targetPath: nextTargetPath,
        artifacts: [],
        loading: Boolean(nextTargetPath),
        error: null,
      });
      if (nextTargetPath) await this.load();
    },
    async load() {
      const { projectId, targetPath } = state;
      if (!projectId || !targetPath) return;
      const revision = loadRevision;
      setState({ ...state, loading: true, error: null });
      try {
        const response = await fetch(endpoint(projectId, targetPath));
        if (!response.ok) {
          throw new Error(`加载生成记录失败 (${response.status})`);
        }
        const body = await response.json().catch(() => null);
        if (revision !== loadRevision) return;
        const artifacts = Array.isArray(body?.artifacts)
          ? body.artifacts
            .map((artifact: unknown) => normalizeArtifact(artifact, 'done'))
            .filter((artifact: GenerationArtifactRecord | null): artifact is GenerationArtifactRecord => Boolean(artifact))
          : [];
        setState({ ...state, artifacts: sortArtifacts(artifacts), loading: false, error: null });
      } catch (error) {
        if (revision !== loadRevision) return;
        setState({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    upsertArtifact(artifact, options = {}) {
      if (!matchesScope(options.scope)) return;
      upsertNormalizedArtifact(artifact, options.status || 'running');
    },
    async upsertArtifactAndPersist(artifact, options = {}) {
      if (!matchesScope(options.scope)) return;
      const scopeKey = createScopeKey(state.projectId, state.targetPath);
      const normalized = upsertNormalizedArtifact(artifact, options.status || 'running');
      if (!normalized) return;
      await persistArtifact(normalized).catch((error) => {
        if (scopeKey !== createScopeKey(state.projectId, state.targetPath)) return;
        setState({ ...state, error: error instanceof Error ? error.message : String(error) });
      });
    },
    async deleteArtifact(id) {
      setState({ ...state, artifacts: state.artifacts.filter((artifact) => artifact.id !== id) });
      const { projectId, targetPath } = state;
      if (!projectId || !targetPath) return;
      const scopeKey = createScopeKey(projectId, targetPath);
      await fetch(endpoint(projectId, targetPath), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`删除生成记录失败 (${response.status})`);
        }
      }).catch((error) => {
        if (scopeKey !== createScopeKey(state.projectId, state.targetPath)) return;
        setState({ ...state, error: error instanceof Error ? error.message : String(error) });
      });
    },
  };
}

let singleton: GenerationArtifactHistoryStore | null = null;

export function getGenerationArtifactHistoryStore(): GenerationArtifactHistoryStore {
  if (!singleton) singleton = createGenerationArtifactHistoryStore();
  return singleton;
}
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
