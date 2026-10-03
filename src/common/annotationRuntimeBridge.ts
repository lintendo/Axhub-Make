export const ANNOTATION_RUNTIME_SOURCE_REPLACE_MESSAGE = 'AXHUB_ANNOTATION_RUNTIME_SOURCE_REPLACE' as const;

export type AnnotationRuntimeSourceReplaceMessage = {
  type: typeof ANNOTATION_RUNTIME_SOURCE_REPLACE_MESSAGE;
  source: unknown;
};

export function createAnnotationRuntimeSourceReplaceMessage(
  source: unknown,
): AnnotationRuntimeSourceReplaceMessage {
  return {
    type: ANNOTATION_RUNTIME_SOURCE_REPLACE_MESSAGE,
    source,
  };
}

export function isAnnotationRuntimeSourceReplaceMessage(
  value: unknown,
): value is AnnotationRuntimeSourceReplaceMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const source = record.source;
  return record.type === ANNOTATION_RUNTIME_SOURCE_REPLACE_MESSAGE
    && Boolean(source && typeof source === 'object' && !Array.isArray(source));
}
