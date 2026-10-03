import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type PreprocessMode = 'serve' | 'build';

type AnnotationSourceMarkdownNode = {
  type?: unknown;
  markdownPath?: unknown;
  markdown?: unknown;
  children?: unknown;
  [key: string]: unknown;
};

type AnnotationSourceLike = {
  directory?: unknown;
  documents?: unknown;
  [key: string]: unknown;
};

const clientSourceRootSegment = 'src';

export type ResolvedAnnotationMarkdownPath =
  | {
    ok: true;
    absolutePath: string;
    projectRelativePath: string;
    prototypeDir: string;
  }
  | {
    ok: false;
    reason: string;
  };

export interface AnnotationSourceMarkdownPreprocessResult<T extends AnnotationSourceLike = AnnotationSourceLike> {
  source: T;
  watchFiles: string[];
}

export interface AnnotationSourceMarkdownPreprocessOptions<T extends AnnotationSourceLike = AnnotationSourceLike> {
  projectRoot: string;
  sourceFilePath: string;
  source: T;
  mode?: PreprocessMode;
}

function createProjectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (
    !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
  );
}

function safeDecodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-z]:[\\/]/iu.test(value);
}

const annotationImagePlaceholderPattern = /__ANNOTATION_IMAGE_([A-Z0-9]+(?:_[A-Z0-9]+)*)__/gu;
const annotationImageAssetExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

function getPrototypeDirFromAnnotationSourcePath(
  projectRoot: string,
  sourceFilePath: string,
): string | null {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedSourcePath = path.resolve(sourceFilePath);
  const relativeSourcePath = createProjectRelativePath(resolvedProjectRoot, resolvedSourcePath);
  const parts = relativeSourcePath.split('/');
  if (
    parts.length !== 4
    || parts[0] !== 'src'
    || parts[1] !== 'prototypes'
    || !parts[2]
    || parts[2].startsWith('.')
    || parts[2].includes('\0')
    || parts[3] !== 'annotation-source.json'
  ) {
    return null;
  }
  const prototypeDir = path.resolve(resolvedProjectRoot, 'src', 'prototypes', parts[2]);
  return isPathInside(resolvedProjectRoot, prototypeDir) ? prototypeDir : null;
}

export function resolveAnnotationMarkdownPath(
  projectRoot: string,
  sourceFilePath: string,
  markdownPath: unknown,
): ResolvedAnnotationMarkdownPath {
  const prototypeDir = getPrototypeDirFromAnnotationSourcePath(projectRoot, sourceFilePath);
  if (!prototypeDir) {
    return { ok: false, reason: 'annotation-source.json is not under src/prototypes/<id>' };
  }

  const rawPath = String(markdownPath ?? '').trim();
  const decodedPath = safeDecodePath(rawPath);
  if (!rawPath || !decodedPath) {
    return { ok: false, reason: 'markdownPath is empty or malformed' };
  }
  if (
    rawPath.includes('\0')
    || decodedPath.includes('\0')
    || path.isAbsolute(rawPath)
    || path.isAbsolute(decodedPath)
    || isWindowsAbsolutePath(rawPath)
    || isWindowsAbsolutePath(decodedPath)
    || rawPath.includes('\\')
    || decodedPath.includes('\\')
  ) {
    return { ok: false, reason: 'markdownPath must be a relative POSIX path' };
  }

  const rawSegments = rawPath.split('/');
  const decodedSegments = decodedPath.split('/');
  const hasUnsafeSegment = [...rawSegments, ...decodedSegments].some((segment) => (
    segment === ''
    || segment === '.'
    || segment === '..'
  ));
  if (hasUnsafeSegment) {
    return { ok: false, reason: 'markdownPath contains unsafe path segments' };
  }

  const absolutePath = path.resolve(prototypeDir, decodedPath);
  const resolvedProjectRoot = path.resolve(projectRoot);
  if (!isPathInside(prototypeDir, absolutePath) || !isPathInside(resolvedProjectRoot, absolutePath)) {
    return { ok: false, reason: 'markdownPath escapes the prototype directory' };
  }

  return {
    ok: true,
    absolutePath,
    projectRelativePath: createProjectRelativePath(resolvedProjectRoot, absolutePath),
    prototypeDir,
  };
}

function resolveAnnotationImageAssetPath(
  projectRoot: string,
  prototypeDir: string,
  placeholderName: string,
): { absolutePath: string; publicPath: string } | null {
  const assetBaseName = String(placeholderName || '').toLowerCase().replace(/_/gu, '-');
  if (!assetBaseName) {
    return null;
  }

  const assetsDir = path.resolve(prototypeDir, 'assets');
  if (!isPathInside(prototypeDir, assetsDir) || !isPathInside(projectRoot, assetsDir)) {
    return null;
  }

  for (const extension of annotationImageAssetExtensions) {
    const absolutePath = path.join(assetsDir, `${assetBaseName}${extension}`);
    if (!isPathInside(assetsDir, absolutePath) || !isPathInside(projectRoot, absolutePath)) {
      continue;
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      continue;
    }
    return {
      absolutePath,
      publicPath: `/${createProjectRelativePath(projectRoot, absolutePath).replace(new RegExp(`^${clientSourceRootSegment}/`, 'u'), '')}`,
    };
  }

  return null;
}

function resolveAnnotationMarkdownImagePlaceholders(
  markdown: string,
  options: {
    projectRoot: string;
    prototypeDir: string;
    watchFiles: Set<string>;
  },
): string {
  return String(markdown || '').replace(annotationImagePlaceholderPattern, (placeholder, placeholderName) => {
    const resolved = resolveAnnotationImageAssetPath(options.projectRoot, options.prototypeDir, placeholderName);
    if (!resolved) {
      return placeholder;
    }
    options.watchFiles.add(resolved.absolutePath);
    return resolved.publicPath;
  });
}

function preprocessDirectoryNode(
  node: unknown,
  options: {
    projectRoot: string;
    sourceFilePath: string;
    mode: PreprocessMode;
    watchFiles: Set<string>;
  },
): unknown {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return node;
  }

  const record = node as AnnotationSourceMarkdownNode;
  if (record.type === 'folder') {
    return {
      ...record,
      children: Array.isArray(record.children)
        ? record.children.map((child) => preprocessDirectoryNode(child, options))
        : record.children,
    };
  }

  if (record.type !== 'markdown') {
    return record;
  }

  const nextNode: AnnotationSourceMarkdownNode = { ...record };
  delete nextNode.markdownEditUrl;

  if (typeof record.markdownPath !== 'string' || !record.markdownPath.trim()) {
    return nextNode;
  }

  const resolved = resolveAnnotationMarkdownPath(
    options.projectRoot,
    options.sourceFilePath,
    record.markdownPath,
  );
  if (resolved.ok === false) {
    if (options.mode === 'serve') {
      console.warn(`[annotation-source] Ignored unsafe markdownPath "${record.markdownPath}": ${resolved.reason}`);
    }
    return nextNode;
  }

  options.watchFiles.add(resolved.absolutePath);
  if (fs.existsSync(resolved.absolutePath)) {
    nextNode.markdown = resolveAnnotationMarkdownImagePlaceholders(
      fs.readFileSync(resolved.absolutePath, 'utf8'),
      {
        projectRoot: options.projectRoot,
        prototypeDir: resolved.prototypeDir,
        watchFiles: options.watchFiles,
      },
    );
  } else if (options.mode === 'serve') {
    console.warn(`[annotation-source] Markdown file not found for markdownPath "${record.markdownPath}": ${resolved.projectRelativePath}`);
  }

  return nextNode;
}

export function preprocessAnnotationSourceMarkdown<T extends AnnotationSourceLike>(
  options: AnnotationSourceMarkdownPreprocessOptions<T>,
): AnnotationSourceMarkdownPreprocessResult<T> {
  const mode = options.mode ?? 'build';
  const source = options.source;
  const directoryRecord = source?.directory && typeof source.directory === 'object' && !Array.isArray(source.directory)
    ? source.directory as Record<string, unknown>
    : null;
  const documentsRecord = source?.documents && typeof source.documents === 'object' && !Array.isArray(source.documents)
    ? source.documents as Record<string, unknown>
    : null;
  const directoryNodes = directoryRecord?.nodes;
  const documentNodes = documentsRecord?.nodes;
  if (
    (!Array.isArray(directoryNodes) && !Array.isArray(documentNodes))
    || !getPrototypeDirFromAnnotationSourcePath(options.projectRoot, options.sourceFilePath)
  ) {
    return { source, watchFiles: [] };
  }

  const watchFiles = new Set<string>();
  const nextSource = {
    ...source,
    ...(directoryRecord && Array.isArray(directoryNodes) ? {
      directory: {
        ...directoryRecord,
        nodes: directoryNodes.map((node) => preprocessDirectoryNode(node, {
          projectRoot: options.projectRoot,
          sourceFilePath: options.sourceFilePath,
          mode,
          watchFiles,
        })),
      },
    } : {}),
    ...(documentsRecord && Array.isArray(documentNodes) ? {
      documents: {
        ...documentsRecord,
        nodes: documentNodes.map((node) => preprocessDirectoryNode(node, {
          projectRoot: options.projectRoot,
          sourceFilePath: options.sourceFilePath,
          mode,
          watchFiles,
        })),
      },
    } : {}),
  } as T;

  return {
    source: nextSource,
    watchFiles: Array.from(watchFiles),
  };
}

function cleanModuleId(id: string): string {
  return id.split(/[?#]/u)[0] || id;
}

export function createAnnotationSourceMarkdownPlugin(
  projectRoot = process.cwd(),
  options: { mode?: PreprocessMode } = {},
): Plugin {
  const mode = options.mode ?? 'build';
  return {
    name: 'axhub-annotation-source-markdown',
    enforce: 'pre',
    transform(code, id) {
      const filePath = cleanModuleId(id);
      if (path.basename(filePath) !== 'annotation-source.json') {
        return null;
      }
      if (!getPrototypeDirFromAnnotationSourcePath(projectRoot, filePath)) {
        return null;
      }

      const source = JSON.parse(code) as AnnotationSourceLike;
      const result = preprocessAnnotationSourceMarkdown({
        projectRoot,
        sourceFilePath: filePath,
        source,
        mode,
      });
      for (const watchFile of result.watchFiles) {
        this.addWatchFile(watchFile);
      }
      return `${JSON.stringify(result.source, null, 2)}\n`;
    },
  };
}
