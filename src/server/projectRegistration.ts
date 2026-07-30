import {
  resolveComparableProjectRoot,
  type RegisteredProject,
} from './projectCore/index.ts';

function normalizeComparableRoot(
  projectRoot: string,
  platform: NodeJS.Platform,
): string {
  const comparableRoot = resolveComparableProjectRoot(projectRoot);
  return platform === 'win32' ? comparableRoot.toLowerCase() : comparableRoot;
}

export function findRegisteredProjectByRoot(
  projects: RegisteredProject[],
  projectRoot: string,
  platform: NodeJS.Platform = process.platform,
): RegisteredProject | null {
  const targetRoot = normalizeComparableRoot(projectRoot, platform);
  return projects.find((project) => (
    normalizeComparableRoot(project.root, platform) === targetRoot
  )) ?? null;
}

export function allocateRegisteredProjectId(
  sourceId: string,
  isTaken: (projectId: string) => boolean,
): string {
  if (!isTaken(sourceId)) {
    return sourceId;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${sourceId}-${suffix}`;
    if (!isTaken(candidate)) {
      return candidate;
    }
  }
}
