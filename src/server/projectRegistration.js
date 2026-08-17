import { resolveComparableProjectRoot, } from './projectCore/index.ts';
function normalizeComparableRoot(projectRoot, platform) {
    const comparableRoot = resolveComparableProjectRoot(projectRoot);
    return platform === 'win32' ? comparableRoot.toLowerCase() : comparableRoot;
}
export function findRegisteredProjectByRoot(projects, projectRoot, platform = process.platform) {
    const targetRoot = normalizeComparableRoot(projectRoot, platform);
    return projects.find((project) => (normalizeComparableRoot(project.root, platform) === targetRoot)) ?? null;
}
export function allocateRegisteredProjectId(sourceId, isTaken) {
    if (!isTaken(sourceId)) {
        return sourceId;
    }
    for (let suffix = 2;; suffix += 1) {
        const candidate = `${sourceId}-${suffix}`;
        if (!isTaken(candidate)) {
            return candidate;
        }
    }
}
