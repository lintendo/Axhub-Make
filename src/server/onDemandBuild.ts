/**
 * On-demand Vite build for Axure export.
 *
 * Mirrors the legacy `axhub-make` `generateAxureExportCode()` approach:
 * runs a full Vite lib-mode build in memory (`write: false`) for a single
 * prototype entry, producing a self-contained IIFE bundle with:
 *   - `lib.name = 'UserComponent'`
 *   - React / ReactDOM as external globals
 *   - CSS extracted separately for injection
 *
 * This guarantees the exported code always reflects the latest source,
 * without requiring a prior `pnpm build` step.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { createAnnotationSourceMarkdownPlugin } from '../../client/vite-plugins/annotationSourceMarkdown.ts';

const requireFromCurrentModule = createRequire(import.meta.url);

export interface OnDemandBuildResult {
  /** The IIFE JS code with `var UserComponent = …` */
  jsCode: string;
  /** Extracted CSS text (empty string if none) */
  cssText: string;
  /** Build-time facts used by publishing integrations. */
  metadata: {
    usesAnnotationRuntime: boolean;
  };
}

export interface OnDemandBuildOptions {
  includeImageAssets?: boolean;
}

interface ImageDimensions {
  width: number;
  height: number;
}

const DEFAULT_PLACEHOLDER_DIMENSIONS: ImageDimensions = { width: 1600, height: 900 };
const BASE64_IMAGE_DATA_URL_PATTERN = /data:image\/([a-z\d.+-]+)(?:;[^,;]+)*;base64,([a-z\d+/]+={0,2})/giu;

function normalizeImageDimensions(width: number, height: number): ImageDimensions | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    width: Math.min(100_000, Math.round(width)),
    height: Math.min(100_000, Math.round(height)),
  };
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return normalizeImageDimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }

  const format = buffer.toString('ascii', 12, 16);
  if (format === 'VP8X') {
    return normalizeImageDimensions(buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1);
  }
  if (format === 'VP8L' && buffer[20] === 0x2f) {
    const width = 1 + (((buffer[22] & 0x3f) << 8) | buffer[21]);
    const height = 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | (buffer[22] >> 6));
    return normalizeImageDimensions(width, height);
  }
  if (format === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return normalizeImageDimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }

  return null;
}

function readSvgDimensions(svgText: string): ImageDimensions | null {
  const width = svgText.match(/\bwidth=["']([\d.]+)(?:px)?["']/iu)?.[1];
  const height = svgText.match(/\bheight=["']([\d.]+)(?:px)?["']/iu)?.[1];
  if (width && height) {
    return normalizeImageDimensions(Number(width), Number(height));
  }
  const viewBox = svgText.match(/\bviewBox=["']([^"']+)["']/iu)?.[1];
  if (!viewBox) return null;
  const values = viewBox.trim().split(/[\s,]+/u).map(Number);
  return values.length === 4 ? normalizeImageDimensions(values[2], values[3]) : null;
}

function readImageDimensions(mimeType: string, buffer: Buffer): ImageDimensions {
  const normalizedMimeType = mimeType.toLowerCase();
  let dimensions: ImageDimensions | null = null;

  if (normalizedMimeType === 'png' && buffer.length >= 24) {
    dimensions = normalizeImageDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  } else if ((normalizedMimeType === 'jpeg' || normalizedMimeType === 'jpg')) {
    dimensions = readJpegDimensions(buffer);
  } else if (normalizedMimeType === 'gif' && buffer.length >= 10) {
    dimensions = normalizeImageDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
  } else if (normalizedMimeType === 'webp') {
    dimensions = readWebpDimensions(buffer);
  } else if (normalizedMimeType === 'svg+xml') {
    dimensions = readSvgDimensions(buffer.toString('utf8'));
  }

  return dimensions || DEFAULT_PLACEHOLDER_DIMENSIONS;
}

function createImagePlaceholderDataUrl(dimensions: ImageDimensions): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}"><rect width="100%" height="100%" fill="#f2f4f7"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function replaceUriEncodedSvgImages(source: string): string {
  const lowerSource = source.toLowerCase();
  const prefix = 'data:image/svg+xml,';
  const closingTags = ['%3c/svg%3e', '%3c%2fsvg%3e', '</svg>'];
  let cursor = 0;
  let result = '';

  while (cursor < source.length) {
    const start = lowerSource.indexOf(prefix, cursor);
    if (start < 0) break;
    let end = -1;
    for (const closingTag of closingTags) {
      const closingIndex = lowerSource.indexOf(closingTag, start + prefix.length);
      if (closingIndex >= 0 && (end < 0 || closingIndex < end)) {
        end = closingIndex + closingTag.length;
      }
    }
    if (end < 0) break;

    const encodedSvg = source.slice(start + prefix.length, end);
    let dimensions = DEFAULT_PLACEHOLDER_DIMENSIONS;
    try {
      dimensions = readSvgDimensions(decodeURIComponent(encodedSvg)) || dimensions;
    } catch {
    }
    result += source.slice(cursor, start) + createImagePlaceholderDataUrl(dimensions);
    cursor = end;
  }

  return cursor === 0 ? source : result + source.slice(cursor);
}

export function replaceEmbeddedImageAssets(source: string): string {
  const withoutBase64Images = String(source || '').replace(
    BASE64_IMAGE_DATA_URL_PATTERN,
    (_match, mimeType: string, base64Payload: string) => {
      const dimensions = readImageDimensions(mimeType, Buffer.from(base64Payload, 'base64'));
      return createImagePlaceholderDataUrl(dimensions);
    },
  );
  return replaceUriEncodedSvgImages(withoutBase64Images);
}

/**
 * Sanitize `process.env.NODE_ENV` references so the bundle can run in
 * environments that don't define `process`.
 */
function sanitizeProcessEnv(code: string): string {
  return String(code || '').replace(/\bprocess\.env\.NODE_ENV\b/g, '"production"');
}

/**
 * Try to load vendor aliases from the project (best-effort).
 * Returns an empty array if the project doesn't use them.
 */
function loadVendorAliases(projectRoot: string): Array<{ packageName: string; runtimeEntryAbsolute: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadVendorPackagesConfig, createVendorAliases } = require(
      path.resolve(projectRoot, 'scripts/utils/vendor-packages.mjs'),
    );
    const config = loadVendorPackagesConfig(projectRoot);
    return createVendorAliases(projectRoot, config);
  } catch {
    return [];
  }
}

async function importPackageFromProject<T = any>(projectRoot: string, packageName: string): Promise<T> {
  let entryPath: string;
  const projectPackageRoot = path.join(projectRoot, 'node_modules', ...packageName.split('/'));
  if (fs.existsSync(projectPackageRoot)) {
    entryPath = requireFromCurrentModule.resolve(packageName, {
      paths: [projectRoot],
    });
  } else {
    entryPath = requireFromCurrentModule.resolve(packageName);
  }
  return import(pathToFileURL(entryPath).href) as Promise<T>;
}

function getPackageExport<T = any>(module: any, exportName: string, packageName: string): T {
  const value = module?.[exportName] ?? module?.default?.[exportName];
  if (!value) {
    throw new Error(`Package ${packageName} does not export ${exportName}`);
  }
  return value as T;
}

function getDefaultExport<T = any>(module: any, packageName: string): T {
  const value = module?.default ?? module;
  if (!value) {
    throw new Error(`Package ${packageName} does not provide a default export`);
  }
  return value as T;
}

function isAnnotationRuntimeModule(moduleId: string): boolean {
  const normalized = moduleId.replace(/\\/g, '/');
  return normalized.includes('/node_modules/@axhub/annotation/')
    || normalized.includes('/packages/axhub-annotation/src/')
    || normalized.includes('/packages/axhub-annotation/dist/');
}

function createEntryStylePlugin(entryFilePath: string) {
  const resolvedEntryPath = path.resolve(entryFilePath);
  const normalizedEntryPath = fs.realpathSync.native(resolvedEntryPath);
  const stylePath = path.join(path.dirname(resolvedEntryPath), 'style.css');

  return {
    name: 'axhub-make-entry-style',
    enforce: 'pre' as const,
    load(id: string) {
      const resolvedId = path.resolve(id.split('?', 1)[0]);
      const normalizedId = fs.existsSync(resolvedId) ? fs.realpathSync.native(resolvedId) : resolvedId;
      if (normalizedId !== normalizedEntryPath || !fs.existsSync(stylePath)) {
        return null;
      }
      return `import './style.css';\n${fs.readFileSync(resolvedEntryPath, 'utf8')}`;
    },
  };
}

/**
 * Build a single prototype entry on-demand and return the IIFE JS + CSS.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param entryFilePath - Absolute path to the entry file (e.g. `src/prototypes/express-home/index.tsx`).
 */
export async function buildOnDemand(
  projectRoot: string,
  entryFilePath: string,
  options: OnDemandBuildOptions = {},
): Promise<OnDemandBuildResult> {
  const vendorAliases = loadVendorAliases(projectRoot);
  const [viteModule, reactModule, tailwindcssModule] = await Promise.all([
    importPackageFromProject(projectRoot, 'vite'),
    importPackageFromProject(projectRoot, '@vitejs/plugin-react'),
    importPackageFromProject(projectRoot, '@tailwindcss/vite'),
  ]);
  const viteBuild = getPackageExport<typeof import('vite')['build']>(viteModule, 'build', 'vite');
  const react = getDefaultExport<any>(reactModule, '@vitejs/plugin-react');
  const tailwindcss = getDefaultExport<any>(tailwindcssModule, '@tailwindcss/vite');

  const bundleResult = await viteBuild({
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    root: projectRoot,
    plugins: [
      createEntryStylePlugin(entryFilePath),
      tailwindcss(),
      createAnnotationSourceMarkdownPlugin(projectRoot, { mode: 'build' }),
      react({
        jsxRuntime: 'classic',
        babel: { configFile: false, babelrc: false },
      }),
    ],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(projectRoot, 'src') },
        ...vendorAliases.map((alias: any) => ({
          find: new RegExp(`^${String(alias.packageName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
          replacement: alias.runtimeEntryAbsolute,
        })),
      ],
    },
    css: {
      preprocessorOptions: {
        scss: { api: 'modern' as any },
        sass: { api: 'modern' as any },
      },
    },
    build: {
      write: false,
      emptyOutDir: false,
      minify: 'esbuild',
      cssCodeSplit: false,
      target: 'es2015',
      assetsInlineLimit: 1024 * 1024,
      lib: {
        entry: entryFilePath,
        formats: ['iife'],
        name: 'UserComponent',
        fileName: () => 'axure-export.js',
      },
      rollupOptions: {
        external: ['react', 'react-dom'],
        output: {
          inlineDynamicImports: true,
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
          },
          generatedCode: {
            constBindings: false,
          },
        },
      },
    },
    esbuild: {
      target: 'es2015',
      legalComments: 'none',
      keepNames: true,
    },
  });

  // Extract JS and CSS from the in-memory build output
  const outputs = Array.isArray(bundleResult) ? bundleResult : [bundleResult];
  const outputBundle = outputs.find(
    (item: any) => item && item.output && Array.isArray(item.output),
  ) as { output: Array<{ type: string; fileName: string; code?: string; source?: string | Uint8Array; modules?: Record<string, unknown> }> } | undefined;

  const jsChunk = outputBundle?.output.find(
    (item) => item.type === 'chunk' && typeof item.code === 'string',
  );
  if (!jsChunk || typeof jsChunk.code !== 'string') {
    throw new Error('On-demand Vite build produced no JS output');
  }

  const cssAsset = outputBundle?.output.find(
    (item) =>
      item.type === 'asset' &&
      typeof item.fileName === 'string' &&
      item.fileName.endsWith('.css'),
  );
  const cssText =
    typeof cssAsset?.source === 'string'
      ? cssAsset.source
      : cssAsset?.source instanceof Uint8Array
        ? Buffer.from(cssAsset.source).toString('utf8')
        : '';

  const jsCode = sanitizeProcessEnv(jsChunk.code);
  const includeImageAssets = options.includeImageAssets !== false;

  return {
    jsCode: includeImageAssets ? jsCode : replaceEmbeddedImageAssets(jsCode),
    cssText: includeImageAssets ? cssText : replaceEmbeddedImageAssets(cssText),
    metadata: {
      usesAnnotationRuntime: Object.keys(jsChunk.modules || {}).some(isAnnotationRuntimeModule),
    },
  };
}

export const __onDemandBuildTestUtils = {
  getPackageExport,
  getDefaultExport,
  isAnnotationRuntimeModule,
  replaceEmbeddedImageAssets,
};
