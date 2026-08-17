export type AiExecutionRecentWorkspace = {
  path: string;
  lastUsedAt: number;
};

export type AiWorkspaceBreadcrumb = {
  label: string;
  path: string;
};

export const AI_EXECUTION_RECENT_WORKSPACES_LIMIT = 10;

const normalizePath = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const getPathComparisonKey = (value: string): string => {
  const slashPath = value.trim().replace(/\\/gu, "/");
  const withoutTrailingSlash =
    slashPath.length > 1 ? slashPath.replace(/\/+$/u, "") : slashPath;
  return /^[A-Za-z]:\//u.test(withoutTrailingSlash)
    ? withoutTrailingSlash.toLocaleLowerCase()
    : withoutTrailingSlash;
};

const normalizeRecentWorkspace = (
  value: unknown,
): AiExecutionRecentWorkspace | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AiExecutionRecentWorkspace>;
  const path = normalizePath(candidate.path);
  const lastUsedAt = Number(candidate.lastUsedAt);
  return path && Number.isFinite(lastUsedAt) ? { path, lastUsedAt } : null;
};

export function normalizeAiExecutionRecentWorkspaces(
  value: unknown,
): AiExecutionRecentWorkspace[] {
  const rawItems =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { items?: unknown }).items
      : value;
  if (!Array.isArray(rawItems)) return [];

  const seenPaths = new Set<string>();
  return rawItems
    .map(normalizeRecentWorkspace)
    .filter((item): item is AiExecutionRecentWorkspace => item !== null)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .filter((item) => {
      const key = getPathComparisonKey(item.path);
      if (seenPaths.has(key)) return false;
      seenPaths.add(key);
      return true;
    })
    .slice(0, AI_EXECUTION_RECENT_WORKSPACES_LIMIT);
}

export function recordAiExecutionRecentWorkspace(
  items: AiExecutionRecentWorkspace[],
  workspacePath: string,
  now = Date.now(),
): AiExecutionRecentWorkspace[] {
  const path = normalizePath(workspacePath);
  if (!path) return normalizeAiExecutionRecentWorkspaces(items);
  return normalizeAiExecutionRecentWorkspaces([
    { path, lastUsedAt: now },
    ...items,
  ]);
}

export function removeAiExecutionRecentWorkspace(
  items: AiExecutionRecentWorkspace[],
  workspacePath: string,
): AiExecutionRecentWorkspace[] {
  const key = getPathComparisonKey(workspacePath);
  return items.filter((item) => getPathComparisonKey(item.path) !== key);
}

export function getAiExecutionRecentWorkspaceName(
  workspacePath: string,
): string {
  const path = normalizePath(workspacePath);
  if (!path) return "";
  if (path === "/" || /^[A-Za-z]:[\\/]$/u.test(path)) return path;
  return (
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

export function filterAiExecutionRecentWorkspaces(
  items: AiExecutionRecentWorkspace[],
  query: string,
): AiExecutionRecentWorkspace[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) => {
    const path = item.path.toLocaleLowerCase();
    const name = getAiExecutionRecentWorkspaceName(
      item.path,
    ).toLocaleLowerCase();
    return path.includes(normalizedQuery) || name.includes(normalizedQuery);
  });
}

export function buildAiWorkspaceBreadcrumbs(
  workspacePath: string,
): AiWorkspaceBreadcrumb[] {
  const value = workspacePath.trim();
  if (!value) return [];

  if (/^[A-Za-z]:[\\/]/u.test(value)) {
    const root = `${value.slice(0, 2)}\\`;
    const segments = value
      .slice(3)
      .split(/[\\/]+/u)
      .filter(Boolean);
    const breadcrumbs: AiWorkspaceBreadcrumb[] = [{ label: root, path: root }];
    let current = root.replace(/\\$/u, "");
    for (const segment of segments) {
      current = `${current}\\${segment}`;
      breadcrumbs.push({ label: segment, path: current });
    }
    return breadcrumbs;
  }

  const segments = value.split(/\/+/u).filter(Boolean);
  if (value.startsWith("/")) {
    const breadcrumbs: AiWorkspaceBreadcrumb[] = [{ label: "/", path: "/" }];
    let current = "";
    for (const segment of segments) {
      current += `/${segment}`;
      breadcrumbs.push({ label: segment, path: current });
    }
    return breadcrumbs;
  }

  let current = "";
  return segments.map((segment) => {
    current = current ? `${current}/${segment}` : segment;
    return { label: segment, path: current };
  });
}
