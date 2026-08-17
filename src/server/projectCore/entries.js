import fs from 'node:fs';
import path from 'node:path';
import { getEntriesManifestPath } from './paths.ts';
export { getEntriesManifestPath };
function scanGroup(projectRoot, group) {
    const groupDir = path.join(projectRoot, 'src', group);
    if (!fs.existsSync(groupDir)) {
        return [];
    }
    return fs
        .readdirSync(groupDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => fs.existsSync(path.join(groupDir, name, 'index.tsx')))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
        group,
        name,
        js: path.join(projectRoot, 'src', group, name, 'index.tsx'),
        html: path.join(projectRoot, 'src', group, name, 'index.html'),
    }));
}
export function scanProjectEntries(projectRoot, groups = ['components', 'prototypes', 'themes']) {
    const root = path.resolve(projectRoot);
    const items = {};
    const js = {};
    const html = {};
    for (const group of groups) {
        for (const item of scanGroup(root, group)) {
            const key = `${item.group}/${item.name}`;
            items[key] = item;
            js[key] = item.js;
            html[key] = item.html;
        }
    }
    return {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        items,
        js,
        html,
    };
}
export function writeEntriesManifest(projectRoot, manifest) {
    const manifestPath = getEntriesManifestPath(projectRoot);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    const tempPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), 'utf8');
        fs.renameSync(tempPath, manifestPath);
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
export function readEntriesManifest(projectRoot) {
    return JSON.parse(fs.readFileSync(getEntriesManifestPath(projectRoot), 'utf8'));
}
