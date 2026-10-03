export const ASSISTANT_IMAGE_SAVED_EVENT_TYPE = 'acp.image.saved' as const;

export interface AssistantImageSavedEvent {
    paths: string[];
    savedCount: number;
    requestedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readAssistantImageSavedEvent(value: unknown): AssistantImageSavedEvent | null {
    if (!isRecord(value) || value.type !== ASSISTANT_IMAGE_SAVED_EVENT_TYPE || !isRecord(value.payload)) {
        return null;
    }
    const paths = Array.isArray(value.payload.paths)
        ? value.payload.paths.map((path) => String(path || '').trim()).filter(Boolean)
        : [];
    const savedCount = value.payload.savedCount;
    const requestedCount = value.payload.requestedCount;
    if (
        paths.length === 0
        || !Number.isInteger(savedCount)
        || savedCount !== paths.length
        || !Number.isInteger(requestedCount)
        || requestedCount < savedCount
    ) {
        return null;
    }
    return { paths, savedCount, requestedCount };
}
