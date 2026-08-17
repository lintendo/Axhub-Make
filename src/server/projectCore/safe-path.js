import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectRoot } from './paths.ts';
export function isPathInside(parentPath, candidatePath) {
    const parent = path.resolve(parentPath);
    const candidate = path.resolve(candidatePath);
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
export function assertProjectRoot(projectRoot) {
    const resolved = resolveProjectRoot(projectRoot);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Project root does not exist: ${resolved}`);
    }
    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error(`Project root is not a directory: ${resolved}`);
    }
    return resolved;
}
export function resolveProjectPath(projectRoot, requestedPath) {
    const root = assertProjectRoot(projectRoot);
    const candidate = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(root, requestedPath);
    if (!isPathInside(root, candidate)) {
        throw new Error(`Resolved path is outside project root: ${requestedPath}`);
    }
    return candidate;
}
