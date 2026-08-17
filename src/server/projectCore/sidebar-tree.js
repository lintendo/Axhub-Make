import fs from 'node:fs';
import path from 'node:path';
import { getEntriesManifestPath, getSidebarTreeStorePath } from './paths.ts';
function createDefaultStore(version, model) {
    const store = {
        version,
        updatedAt: new Date().toISOString(),
        prototypes: [],
        docs: [],
        themesTree: [],
        themes: [],
        data: [],
        templates: [],
    };
    if (model === 'legacy') {
        store.components = [];
        store.canvas = [];
    }
    return store;
}
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
}
function cloneTree(nodes) {
    return nodes.map((node) => ({
        ...node,
        children: Array.isArray(node.children) ? cloneTree(node.children) : undefined,
    }));
}
function normalizeStore(data, version, model) {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const parsed = data;
    const updatedAt = typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : new Date().toISOString();
    const store = {
        version,
        updatedAt,
        prototypes: Array.isArray(parsed.prototypes) ? cloneTree(parsed.prototypes) : [],
        docs: Array.isArray(parsed.docs) ? cloneTree(parsed.docs) : [],
        themesTree: Array.isArray(parsed.themesTree) ? cloneTree(parsed.themesTree) : [],
        themes: Array.isArray(parsed.themes) ? parsed.themes.filter((key) => typeof key === 'string') : [],
        data: Array.isArray(parsed.data) ? parsed.data.filter((key) => typeof key === 'string') : [],
        templates: Array.isArray(parsed.templates) ? parsed.templates.filter((key) => typeof key === 'string') : [],
    };
    if (model === 'legacy') {
        store.components = Array.isArray(parsed.components) ? cloneTree(parsed.components) : [];
        store.canvas = Array.isArray(parsed.canvas) ? cloneTree(parsed.canvas) : [];
    }
    return store;
}
function readLegacySidebarTree(legacyEntriesPath, version, model) {
    const data = readJsonFile(legacyEntriesPath);
    if (!data || typeof data !== 'object') {
        return null;
    }
    const legacy = data.sidebarTree;
    if (!legacy || typeof legacy !== 'object') {
        return null;
    }
    const store = {
        version,
        updatedAt: new Date().toISOString(),
        prototypes: Array.isArray(legacy.prototypes) ? cloneTree(legacy.prototypes) : [],
        docs: Array.isArray(legacy.docs) ? cloneTree(legacy.docs) : [],
        themes: Array.isArray(legacy.themes) ? legacy.themes.filter((key) => typeof key === 'string') : [],
        data: Array.isArray(legacy.data) ? legacy.data.filter((key) => typeof key === 'string') : [],
        templates: Array.isArray(legacy.templates) ? legacy.templates.filter((key) => typeof key === 'string') : [],
    };
    if (model === 'legacy') {
        store.components = Array.isArray(legacy.components) ? cloneTree(legacy.components) : [];
        store.canvas = Array.isArray(legacy.canvas) ? cloneTree(legacy.canvas) : [];
    }
    return store;
}
function writeStoreAtomic(storePath, store) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(tempPath, storePath);
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
function resolveOptions(projectRoot, options) {
    return {
        version: options?.version ?? 1,
        legacyEntriesPath: options?.legacyEntriesPath ?? getEntriesManifestPath(projectRoot),
        model: options?.model ?? 'legacy',
        storePath: options?.storePath ?? getSidebarTreeStorePath(projectRoot),
    };
}
function assertTreeTabAllowed(model, tab) {
    if (model === 'project-metadata' && (tab === 'components' || tab === 'canvas')) {
        throw new Error(`${tab} is not part of the project metadata sidebar model`);
    }
}
export function createSidebarTreeStore(projectRoot, options) {
    const resolved = resolveOptions(projectRoot, options);
    const ensureStore = () => {
        const loaded = normalizeStore(readJsonFile(resolved.storePath), resolved.version, resolved.model);
        if (loaded) {
            return loaded;
        }
        const migrated = readLegacySidebarTree(resolved.legacyEntriesPath, resolved.version, resolved.model);
        const nextStore = migrated || createDefaultStore(resolved.version, resolved.model);
        writeStoreAtomic(resolved.storePath, nextStore);
        return nextStore;
    };
    const saveStore = (store) => {
        const nextStore = {
            version: resolved.version,
            updatedAt: new Date().toISOString(),
            prototypes: cloneTree(store.prototypes),
            docs: cloneTree(store.docs),
            themesTree: cloneTree(store.themesTree || []),
            themes: Array.isArray(store.themes) ? [...store.themes] : [],
            data: Array.isArray(store.data) ? [...store.data] : [],
            templates: Array.isArray(store.templates) ? [...store.templates] : [],
        };
        if (resolved.model === 'legacy') {
            nextStore.components = cloneTree(store.components || []);
            nextStore.canvas = cloneTree(store.canvas || []);
        }
        writeStoreAtomic(resolved.storePath, nextStore);
        return nextStore;
    };
    return {
        getStorePath() {
            return resolved.storePath;
        },
        getStore() {
            return ensureStore();
        },
        getTree(tab) {
            assertTreeTabAllowed(resolved.model, tab);
            const store = ensureStore();
            const storeKey = tab === 'themes' ? 'themesTree' : tab;
            return cloneTree(store[storeKey] || []);
        },
        setTree(tab, tree) {
            assertTreeTabAllowed(resolved.model, tab);
            const store = ensureStore();
            const storeKey = tab === 'themes' ? 'themesTree' : tab;
            return saveStore({
                ...store,
                [storeKey]: cloneTree(tree),
            });
        },
        getResourceOrder(type) {
            const store = ensureStore();
            return Array.isArray(store[type]) ? [...store[type]] : [];
        },
        setResourceOrder(type, order) {
            const store = ensureStore();
            return saveStore({
                ...store,
                [type]: Array.isArray(order) ? [...order] : [],
            });
        },
    };
}
