import fs from 'node:fs';
import path from 'node:path';
import { getProjectMetadataPath, getProjectRegistryPath, resolveProjectRoot, } from './paths.ts';
import { createMakeStateNotWritableError, isMakeStateWritePermissionError } from './make-state-health.ts';
function nowIso() {
    return new Date().toISOString();
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
function writeJsonAtomic(filePath, value) {
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
    }
    catch (error) {
        if (isMakeStateWritePermissionError(error)) {
            throw createMakeStateNotWritableError(filePath, error);
        }
        throw error;
    }
    finally {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}
function normalizeProject(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const id = typeof input.id === 'string' ? input.id.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : id;
    const root = typeof input.root === 'string' ? resolveProjectRoot(input.root) : '';
    if (!id || !root) {
        return null;
    }
    const metadataPath = typeof input.metadataPath === 'string' && input.metadataPath.trim()
        ? path.resolve(input.metadataPath)
        : getProjectMetadataPath(root);
    const createdAt = typeof input.createdAt === 'string' && input.createdAt.trim() ? input.createdAt : nowIso();
    const updatedAt = typeof input.updatedAt === 'string' && input.updatedAt.trim() ? input.updatedAt : createdAt;
    return {
        id,
        name,
        root,
        metadataPath,
        createdAt,
        updatedAt,
    };
}
function createEmptyRegistry() {
    return {
        schemaVersion: 1,
        activeProjectId: null,
        projects: [],
    };
}
function normalizeRegistry(data) {
    if (!data || typeof data !== 'object') {
        return createEmptyRegistry();
    }
    const parsed = data;
    const projects = Array.isArray(parsed.projects)
        ? parsed.projects.map(normalizeProject).filter((project) => Boolean(project))
        : [];
    const activeProjectId = typeof parsed.activeProjectId === 'string'
        && projects.some((project) => project.id === parsed.activeProjectId)
        ? parsed.activeProjectId
        : null;
    return {
        schemaVersion: 1,
        activeProjectId,
        projects,
    };
}
function resolveRegistryPath(options) {
    if (options?.registryPath) {
        return path.resolve(options.registryPath);
    }
    return getProjectRegistryPath(options?.homeDir);
}
export function createProjectRegistry(options) {
    const registryPath = resolveRegistryPath(options);
    const load = () => normalizeRegistry(readJsonFile(registryPath));
    const save = (registry) => {
        const normalized = normalizeRegistry(registry);
        writeJsonAtomic(registryPath, normalized);
        return normalized;
    };
    return {
        getRegistryPath() {
            return registryPath;
        },
        getRegistry() {
            return load();
        },
        listProjects() {
            return load().projects;
        },
        getProject(id) {
            return load().projects.find((project) => project.id === id) ?? null;
        },
        getActiveProject() {
            const registry = load();
            return registry.projects.find((project) => project.id === registry.activeProjectId) ?? null;
        },
        addProject(input) {
            const registry = load();
            if (registry.projects.some((project) => project.id === input.id)) {
                throw new Error(`Project already exists: ${input.id}`);
            }
            const timestamp = nowIso();
            const root = resolveProjectRoot(input.root);
            const project = {
                id: input.id,
                name: input.name?.trim() ?? input.id,
                root,
                metadataPath: input.metadataPath ? path.resolve(input.metadataPath) : getProjectMetadataPath(root),
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            save({
                ...registry,
                activeProjectId: registry.activeProjectId ?? project.id,
                projects: [...registry.projects, project],
            });
            return project;
        },
        updateProject(id, input) {
            const registry = load();
            const index = registry.projects.findIndex((project) => project.id === id);
            if (index < 0) {
                throw new Error(`Project not found: ${id}`);
            }
            const current = registry.projects[index];
            const root = input.root ? resolveProjectRoot(input.root) : current.root;
            const nextProject = {
                ...current,
                ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                root,
                metadataPath: input.metadataPath ? path.resolve(input.metadataPath) : current.metadataPath,
                updatedAt: nowIso(),
            };
            const projects = [...registry.projects];
            projects[index] = nextProject;
            save({ ...registry, projects });
            return nextProject;
        },
        removeProject(id) {
            const registry = load();
            const projects = registry.projects.filter((project) => project.id !== id);
            const activeProjectId = registry.activeProjectId === id ? projects[0]?.id ?? null : registry.activeProjectId;
            save({ ...registry, activeProjectId, projects });
        },
        setActiveProject(id) {
            const registry = load();
            if (!registry.projects.some((project) => project.id === id)) {
                throw new Error(`Project not found: ${id}`);
            }
            save({ ...registry, activeProjectId: id });
        },
    };
}
