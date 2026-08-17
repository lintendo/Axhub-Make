import { extname } from "node:path";
import { readFile } from "node:fs/promises";
const DATA_URL_PATTERN = /^data:image\/(?:png|svg\+xml);base64,[a-z0-9+/=]+$/i;
export async function hydrateEntryIcons(entries) {
    return Promise.all(entries.map(async (entry) => {
        if (!entry.icon)
            return entry;
        if (entry.icon.type === "data-url") {
            if (!DATA_URL_PATTERN.test(entry.icon.value))
                throw new Error(`Entry ${entry.id} has an unsupported icon data URL`);
            return entry;
        }
        const extension = extname(entry.icon.value).toLowerCase();
        const mimeType = extension === ".svg" ? "image/svg+xml" : extension === ".png" ? "image/png" : undefined;
        if (!mimeType)
            throw new Error(`Entry ${entry.id} icon must be SVG or PNG`);
        const data = await readFile(entry.icon.value);
        return {
            ...entry,
            icon: { type: "data-url", value: `data:${mimeType};base64,${data.toString("base64")}` },
        };
    }));
}
//# sourceMappingURL=icons.js.map