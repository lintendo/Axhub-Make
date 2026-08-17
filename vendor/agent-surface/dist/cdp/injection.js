import { buildFrameRuntimeSource } from "./frame-runtime.js";
export function toInjectionEntry(entry, icon) {
    return {
        id: entry.id,
        name: entry.name,
        url: entry.url,
        order: entry.order ?? 0,
        ...(icon === undefined ? {} : { icon }),
        ...(entry.headerActions === undefined
            ? {}
            : { headerActions: { ...entry.headerActions } }),
    };
}
export function buildEntryInjection(entries, profile) {
    return buildFrameRuntimeSource(entries, profile);
}
//# sourceMappingURL=injection.js.map