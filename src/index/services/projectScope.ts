export interface ProjectScope {
    projectId: string;
}

export function requireProjectScope(projectId: string | null | undefined): ProjectScope {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) {
        throw new Error('请先选择项目');
    }
    return { projectId: normalizedProjectId };
}

export function withProjectScope(url: string, scope: ProjectScope): string {
    const { projectId } = requireProjectScope(scope?.projectId);
    const [pathname, rawQuery = ''] = url.split('?');
    const query = new URLSearchParams(rawQuery);
    query.set('projectId', projectId);
    return `${pathname}?${query.toString()}`;
}

export function withProjectScopeBody<T extends Record<string, unknown>>(
    body: T,
    scope: ProjectScope,
): T & { projectId: string } {
    const { projectId } = requireProjectScope(scope?.projectId);
    return {
        ...body,
        projectId,
    };
}
