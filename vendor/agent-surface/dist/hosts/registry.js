import { codexAdapter } from "./codex/index.js";
import { cursorAdapter } from "./cursor/index.js";
import { workbuddyAdapter } from "./workbuddy/index.js";
import { traeworkAdapter } from "./traework/index.js";
import { qoderworkAdapter } from "./qoderwork/index.js";
import { traeAdapter } from "./trae/index.js";
const adapters = {
    codex: codexAdapter,
    cursor: cursorAdapter,
    workbuddy: workbuddyAdapter,
    traework: traeworkAdapter,
    qoderwork: qoderworkAdapter,
    trae: traeAdapter,
};
export function getHostAdapter(host) {
    return adapters[host];
}
export function listHostAdapters() {
    return Object.values(adapters);
}
//# sourceMappingURL=registry.js.map