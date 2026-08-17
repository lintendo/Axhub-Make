interface GitVersionEntryProbeOptions {
    commitHash: string;
    targetPath: string;
    projectId: string;
}

type GitVersionEntryFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'body'>>;

export function buildGitVersionEntryProbeUrl(options: GitVersionEntryProbeOptions): string {
  const versionId = String(options.commitHash || '').trim().slice(0, 8);
  const encodedPath = String(options.targetPath || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const pathname = `/api/git/version-file/${encodeURIComponent(versionId)}/${encodedPath}/index.tsx`;
  return `${pathname}?projectId=${encodeURIComponent(options.projectId)}`;
}

export async function probeGitVersionEntry(
  options: GitVersionEntryProbeOptions,
  fetchEntry: GitVersionEntryFetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchEntry(buildGitVersionEntryProbeUrl(options), { cache: 'no-store' });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}
