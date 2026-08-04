import type { IncomingMessage } from 'node:http';

import {
  readMakeClientMarker,
  readServerInfo,
  resolveProjectRoot,
  type ProjectMetadata,
} from './projectCore/index.ts';

type RuntimeLinkRequest = Pick<IncomingMessage, 'headers'>;

function getFirstHeaderValue(value: string | string[] | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] || '' : value || '';
  return rawValue.split(',')[0].trim();
}

function isLoopbackHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/gu, '');
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getRequestHostname(request?: RuntimeLinkRequest): string {
  const rawHost = getFirstHeaderValue(request?.headers['x-forwarded-host'])
    || getFirstHeaderValue(request?.headers.host);
  if (!rawHost) {
    return '';
  }
  try {
    const parsed = new URL(`http://${rawHost}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return '';
    }
    return parsed.hostname;
  } catch {
    return '';
  }
}

function resolveRuntimeOriginForRequest(runtimeOrigin: string, request?: RuntimeLinkRequest): string {
  const requestHostname = getRequestHostname(request);
  if (!requestHostname || isLoopbackHostname(requestHostname)) {
    return runtimeOrigin;
  }
  try {
    const parsed = new URL(runtimeOrigin);
    if (!isLoopbackHostname(parsed.hostname)) {
      return runtimeOrigin;
    }
    parsed.hostname = requestHostname;
    return parsed.toString().replace(/\/+$/u, '');
  } catch {
    return runtimeOrigin;
  }
}

function getMakeClientRuntimeOrigin(
  projectRoot: string,
  runtimeOriginOverride?: string,
  request?: RuntimeLinkRequest,
): string {
  let runtimeOrigin = '';
  const marker = readMakeClientMarker(projectRoot);
  if (marker) {
    const runtime = readServerInfo(projectRoot, 'runtime');
    if (runtime?.origin && resolveProjectRoot(runtime.projectRoot) === resolveProjectRoot(projectRoot)) {
      runtimeOrigin = runtime.origin.replace(/\/+$/u, '');
    }
  }
  if (!runtimeOrigin) {
    runtimeOrigin = runtimeOriginOverride?.trim().replace(/\/+$/u, '') || '';
  }
  return resolveRuntimeOriginForRequest(runtimeOrigin, request);
}

function replaceResourceUrlOrigin(value: unknown, runtimeOrigin: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }
  const rawUrl = value.trim();
  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.startsWith('/prototypes/') || parsed.pathname.startsWith('/themes/')) {
      return `${runtimeOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    if (rawUrl.startsWith('/prototypes/') || rawUrl.startsWith('/themes/')) {
      return `${runtimeOrigin}${rawUrl}`;
    }
  }
  return rawUrl;
}

type ResourceWithUrls = {
  id?: string;
  name?: string;
  clientUrl?: string;
  previewUrl?: string;
};

function resolveResourceId(resource: ResourceWithUrls): string {
  return typeof resource.id === 'string' && resource.id.trim()
    ? resource.id.trim()
    : typeof resource.name === 'string' && resource.name.trim()
      ? resource.name.trim()
      : '';
}

export function backfillMakeClientThemePreviewLinks<T extends ResourceWithUrls>(
  themes: T[],
  projectRoot: string,
  runtimeOriginOverride?: string,
  request?: RuntimeLinkRequest,
): T[] {
  const runtimeOrigin = getMakeClientRuntimeOrigin(projectRoot, runtimeOriginOverride, request);
  if (!runtimeOrigin) {
    return themes;
  }

  let changed = false;
  const nextThemes = themes.map((theme) => {
    const nextClientUrl = replaceResourceUrlOrigin(theme.clientUrl, runtimeOrigin);
    const nextPreviewUrl = replaceResourceUrlOrigin(theme.previewUrl, runtimeOrigin);
    if (nextClientUrl || nextPreviewUrl) {
      if (nextClientUrl === theme.clientUrl && nextPreviewUrl === theme.previewUrl) {
        return theme;
      }
      changed = true;
      return {
        ...theme,
        ...(nextClientUrl ? { clientUrl: nextClientUrl } : {}),
        ...(nextPreviewUrl ? { previewUrl: nextPreviewUrl } : {}),
      };
    }
    const id = resolveResourceId(theme);
    if (!id) {
      return theme;
    }
    changed = true;
    const clientUrl = `${runtimeOrigin}/themes/${encodeURIComponent(id)}`;
    return {
      ...theme,
      clientUrl,
      previewUrl: clientUrl,
    };
  });

  return changed ? nextThemes : themes;
}

export function backfillMakeClientPrototypePreviewLinks<T extends ResourceWithUrls>(
  prototypes: T[],
  projectRoot: string,
  runtimeOriginOverride?: string,
  request?: RuntimeLinkRequest,
): T[] {
  const runtimeOrigin = getMakeClientRuntimeOrigin(projectRoot, runtimeOriginOverride, request);
  if (!runtimeOrigin) {
    return prototypes;
  }

  let changed = false;
  const nextPrototypes = prototypes.map((prototype) => {
    const nextClientUrl = replaceResourceUrlOrigin(prototype.clientUrl, runtimeOrigin);
    if (nextClientUrl) {
      if (nextClientUrl === prototype.clientUrl) {
        return prototype;
      }
      changed = true;
      return {
        ...prototype,
        clientUrl: nextClientUrl,
      };
    }
    const id = resolveResourceId(prototype);
    if (!id) {
      return prototype;
    }
    changed = true;
    const clientUrl = `${runtimeOrigin}/prototypes/${encodeURIComponent(id)}`;
    return {
      ...prototype,
      clientUrl,
    };
  });

  return changed ? nextPrototypes : prototypes;
}

export function backfillMakeClientResourcePreviewLinks(
  metadata: ProjectMetadata,
  projectRoot: string,
  runtimeOriginOverride?: string,
  request?: RuntimeLinkRequest,
): ProjectMetadata {
  const prototypes = backfillMakeClientPrototypePreviewLinks(
    metadata.resources.prototypes,
    projectRoot,
    runtimeOriginOverride,
    request,
  );
  const themes = backfillMakeClientThemePreviewLinks(
    metadata.resources.themes,
    projectRoot,
    runtimeOriginOverride,
    request,
  );
  if (prototypes === metadata.resources.prototypes && themes === metadata.resources.themes) {
    return metadata;
  }
  return {
    ...metadata,
    resources: {
      ...metadata.resources,
      prototypes,
      themes,
    },
  };
}
