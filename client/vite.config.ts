import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { forceInlineDynamicImportsOff } from './vite-plugins/forceInlineDynamicImportsOff';
import { injectStablePageIds } from './vite-plugins/injectStablePageIds';
import { clientPreviewPlugin } from './vite-plugins/clientPreviewPlugin';
import { autoStartMakeServerPlugin } from './vite-plugins/autoStartMakeServerPlugin';
import { writeDevServerInfoPlugin } from './vite-plugins/writeDevServerInfoPlugin';
import { axhubComponentEnforcer } from './vite-plugins/axhubComponentEnforcer';
import { websocketPlugin } from './vite-plugins/websocketPlugin';
import { canvasHotUpdateFilterPlugin } from './vite-plugins/canvasHotUpdateFilter';
import { annotationRuntimeOptimizeDepsPlugin } from './vite-plugins/annotationRuntimeOptimizeDeps';
import { createAnnotationSourceMarkdownPlugin } from './vite-plugins/annotationSourceMarkdown';
import {
  MAKE_ENTRIES_RELATIVE_PATH,
} from './vite-plugins/utils/makeConstants';
import {
  readEntriesManifest,
  scanProjectEntries,
  writeEntriesManifestAtomic,
} from './vite-plugins/utils/entriesManifest';

const projectRoot = process.cwd();
const OFFICIAL_CLIENT_DEV_PORT = 51720;

writeEntriesManifestAtomic(
  projectRoot,
  scanProjectEntries(projectRoot, ['prototypes', 'themes']),
);
const entries = readEntriesManifest(projectRoot);

const entryKey = process.env.ENTRY_KEY;
const jsEntries = entries.js as Record<string, string>;
const htmlEntries = entries.html as Record<string, string>;

const hasSingleEntry = typeof entryKey === 'string' && entryKey.length > 0;
let rollupInput: Record<string, string> = htmlEntries;

if (hasSingleEntry) {
  if (!jsEntries[entryKey as string]) {
    throw new Error(`ENTRY_KEY=${entryKey} was not found in ${MAKE_ENTRIES_RELATIVE_PATH}.`);
  }
  rollupInput = { [entryKey as string]: jsEntries[entryKey as string] };
}

const isIifeBuild = hasSingleEntry;
const devServerWatchIgnored = [
  '**/.axhub/make/**',
  '**/*.assets/**',
  '**/.spec/**',
  '**/*.excalidraw',
];

export default defineConfig(({ command }) => {
  const isServe = command === 'serve';

  const config: any = {
    plugins: [
      // Vitest 4 currently runs on Vite 7, while @tailwindcss/vite resolves
      // against this package's Vite 5. Skip the production-only CSS plugin
      // during test collection so CSS mocks can load without that mismatch.
      process.env.VITEST ? null : tailwindcss(),
      isServe ? canvasHotUpdateFilterPlugin() : null,
      isServe ? annotationRuntimeOptimizeDepsPlugin(projectRoot) : null,
      injectStablePageIds(),
      isServe ? writeDevServerInfoPlugin() : null,
      isServe ? autoStartMakeServerPlugin() : null,
      isServe ? websocketPlugin() : null,
      isServe ? clientPreviewPlugin() : null,
      createAnnotationSourceMarkdownPlugin(projectRoot, { mode: isServe ? 'serve' : 'build' }),
      forceInlineDynamicImportsOff(isIifeBuild),
      isIifeBuild ? axhubComponentEnforcer(jsEntries[entryKey as string]) : null,
      react({
        jsxRuntime: 'classic',
        babel: { configFile: false, babelrc: false },
      }),
    ].filter(Boolean) as Plugin[],

    root: 'src',
    publicDir: false,
    appType: 'mpa',

    optimizeDeps: {
      include: [
        'lucide-react',
      ],
    },

    resolve: {
      dedupe: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
      alias: [
        { find: '@', replacement: path.resolve(projectRoot, 'src') },
        !isIifeBuild && !isServe && fs.existsSync(path.resolve(projectRoot, 'src/common/react-shim.js')) && {
          find: /^react$/,
          replacement: path.resolve(projectRoot, 'src/common/react-shim.js'),
        },
        !isIifeBuild && !isServe && fs.existsSync(path.resolve(projectRoot, 'src/common/react-dom-shim.js')) && {
          find: /^react-dom$/,
          replacement: path.resolve(projectRoot, 'src/common/react-dom-shim.js'),
        },
      ].filter(Boolean) as { find: string | RegExp; replacement: string }[],
    },

    css: {
      preprocessorOptions: {
        scss: { api: 'modern' },
        sass: { api: 'modern' },
      },
    },

    server: {
      port: OFFICIAL_CLIENT_DEV_PORT,
      strictPort: false,
      host: '0.0.0.0',
      open: false,
      cors: true,
      hmr: { overlay: false },
      watch: {
        ignored: devServerWatchIgnored,
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    },

    build: {
      outDir: path.resolve(projectRoot, 'dist'),
      emptyOutDir: !isIifeBuild,
      target: isIifeBuild ? 'es2015' : 'esnext',
      assetsInlineLimit: 1024 * 1024,
      rollupOptions: {
        input: rollupInput,
        external: isIifeBuild ? ['react', 'react-dom'] : [],
        output: {
          entryFileNames: (chunkInfo: { name: string }) => `${chunkInfo.name}.js`,
          format: isIifeBuild ? 'iife' : 'es',
          name: 'UserComponent',
          ...(isIifeBuild
            ? {
              globals: {
                react: 'React',
                'react-dom': 'ReactDOM',
              },
              generatedCode: { constBindings: false },
            }
            : {}),
        },
      },
      minify: isIifeBuild ? 'esbuild' : false,
    },

    esbuild: isIifeBuild
      ? {
        target: 'es2015',
        legalComments: 'none',
        keepNames: true,
      }
      : {
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
      },

    test: {
      globals: true,
      environment: 'node',
      include: [
        'tests/**/*.test.ts',
        'tests/**/*.test.tsx',
        'scripts/**/*.test.ts',
        'scripts/**/*.test.mjs',
        'vite-plugins/**/*.test.ts',
      ],
      root: '.',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'text-summary', 'json-summary', 'html'],
        reportOnFailure: true,
        include: [
          'src/common/useHashPage.ts',
          'src/common/side-menu/side-menu-utils.ts',
          'scripts/sync-project-metadata.mjs',
          'vite-plugins/**/*.{ts,js}',
        ],
        exclude: [
          '**/*.d.ts',
          '**/*.test.*',
          'src/prototypes/**',
          'src/themes/**',
          'src/common/DesignMdBatchShowcase/**',
          'src/common/ThemeShell/**',
          'src/common/VariantSwitcher.tsx',
          'src/common/axure-types.ts',
          'src/common/config-panel-types.ts',
          'src/common/react-shim.js',
          'src/common/react-dom-shim.js',
          '**/templates/**',
          '**/dist/**',
          '**/node_modules/**',
        ],
      },
    },
  };

  return config;
});
