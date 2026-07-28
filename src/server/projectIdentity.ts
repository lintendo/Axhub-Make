import fs from 'node:fs';

import {
  createProjectMetadataStore,
  readMakeClientMarker,
  writeMakeClientMarker,
  type ProjectMetadata,
} from './projectCore/index.ts';

export interface ProjectIdentity {
  id: string;
  name: string;
  source: 'make-client' | 'metadata' | 'fallback';
}

export interface ProjectIdentityFallback {
  id: string;
  name: string;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fallbackIdentity(fallback: ProjectIdentityFallback): ProjectIdentity {
  return {
    id: stringValue(fallback.id),
    name: stringValue(fallback.name),
    source: 'fallback',
  };
}

function metadataIdentity(metadata: ProjectMetadata): ProjectIdentity {
  return {
    id: stringValue(metadata.project.id),
    name: stringValue(metadata.project.name),
    source: 'metadata',
  };
}

function saveMetadataIdentity(
  metadataStore: ReturnType<typeof createProjectMetadataStore>,
  metadata: ProjectMetadata,
  identity: { id: string; name: string },
): ProjectMetadata {
  if (
    fs.existsSync(metadataStore.getMetadataPath())
    && metadata.project.id === identity.id
    && metadata.project.name === identity.name
  ) {
    return metadata;
  }
  return metadataStore.saveMetadata({
    ...metadata,
    project: {
      id: identity.id,
      name: identity.name,
    },
  });
}

export function readProjectIdentity(
  projectRoot: string,
  options: {
    metadataPath?: string;
    fallback?: ProjectIdentityFallback;
  } = {},
): ProjectIdentity {
  try {
    const marker = readMakeClientMarker(projectRoot);
    if (marker) {
      return {
        id: marker.project.id,
        name: marker.project.name,
        source: 'make-client',
      };
    }
    const metadata = createProjectMetadataStore(projectRoot, { metadataPath: options.metadataPath }).getMetadata();
    return metadataIdentity(metadata);
  } catch (error) {
    if (options.fallback) {
      return fallbackIdentity(options.fallback);
    }
    throw error;
  }
}

export function syncProjectIdentitySource(
  projectRoot: string,
  options: {
    metadataPath?: string;
    fallback?: ProjectIdentityFallback;
    projectId?: string;
  } = {},
): { identity: ProjectIdentity; metadata: ProjectMetadata } {
  const metadataStore = createProjectMetadataStore(projectRoot, { metadataPath: options.metadataPath });
  const metadata = metadataStore.getMetadata();
  const marker = readMakeClientMarker(projectRoot);

  if (marker) {
    const normalizedMarker = writeMakeClientMarker(projectRoot, {
      ...marker,
      project: {
        ...marker.project,
        id: stringValue(options.projectId) || marker.project.id,
      },
    });
    const savedMetadata = saveMetadataIdentity(metadataStore, metadata, normalizedMarker.project);
    return {
      identity: {
        id: normalizedMarker.project.id,
        name: normalizedMarker.project.name,
        source: 'make-client',
      },
      metadata: savedMetadata,
    };
  }

  const identity = metadataIdentity(metadata);
  if (!identity.id && options.fallback) {
    const nextIdentity = fallbackIdentity(options.fallback);
    const savedMetadata = saveMetadataIdentity(metadataStore, metadata, nextIdentity);
    return {
      identity: {
        ...nextIdentity,
        source: 'metadata',
      },
      metadata: savedMetadata,
    };
  }

  const savedMetadata = metadataStore.saveMetadata(metadata);
  return {
    identity,
    metadata: savedMetadata,
  };
}

export function updateProjectIdentityName(
  projectRoot: string,
  name: string,
  options: {
    metadataPath?: string;
    fallback?: ProjectIdentityFallback;
  } = {},
): { identity: ProjectIdentity; metadata: ProjectMetadata } {
  const metadataStore = createProjectMetadataStore(projectRoot, { metadataPath: options.metadataPath });
  const metadata = metadataStore.getMetadata();
  const marker = readMakeClientMarker(projectRoot);
  const nextName = stringValue(name);

  if (marker) {
    const normalizedMarker = writeMakeClientMarker(projectRoot, {
      ...marker,
      project: {
        ...marker.project,
        name: nextName,
      },
    });
    const savedMetadata = saveMetadataIdentity(metadataStore, metadata, normalizedMarker.project);
    return {
      identity: {
        id: normalizedMarker.project.id,
        name: normalizedMarker.project.name,
        source: 'make-client',
      },
      metadata: savedMetadata,
    };
  }

  const nextProject = {
    id: metadata.project.id || stringValue(options.fallback?.id),
    name: nextName,
  };
  const savedMetadata = saveMetadataIdentity(metadataStore, metadata, nextProject);
  return {
    identity: {
      id: savedMetadata.project.id,
      name: savedMetadata.project.name,
      source: 'metadata',
    },
    metadata: savedMetadata,
  };
}
