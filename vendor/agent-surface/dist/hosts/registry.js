import { codexAdapter } from "./codex/index.js";
import { cursorAdapter } from "./cursor/index.js";
import { workbuddyAdapter } from "./workbuddy/index.js";
import { traeworkAdapter } from "./traework/index.js";
import { traeAdapter } from "./trae/index.js";
const adapters = {
    codex: codexAdapter,
    cursor: cursorAdapter,
    workbuddy: workbuddyAdapter,
    traework: traeworkAdapter,
    trae: traeAdapter,
};
export function getHostAdapter(host) {
    const adapter = adapters[host];
    if (!adapter)
        throw new Error(`Unsupported host: ${host}`);
    return adapter;
}
export function listHostAdapters() {
    return Object.values(adapters).filter((adapter) => Boolean(adapter));
}
//# sourceMappingURL=registry.js.map