import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { stampAdminAssetUrlsForContent } from './src/chunking/adminAssetStamping';
import { excalidrawDevCjsInteropPlugin } from './src/chunking/excalidrawDevCjsInterop';
import { getManualChunkName } from './src/chunking/manualChunks';
import { canvasHotUpdateFilterPlugin } from './src/server/canvasHotUpdateFilter';
import { DEFAULT_MAKE_SERVER_PORT } from './src/server/defaults';
import { releaseListeningProcessesOnPort } from './src/server/portOccupancy';
const adminOutDir = path.resolve(__dirname, 'dist/admin');
const FRESH_VENDOR_ALIAS_PACKAGES = new Set(['@axhub/commentary']);
const REACT_SINGLETON_PACKAGES = ['react', 'react-dom'];
const ASSISTANT_UI_SINGLETON_PACKAGES = [
    '@assistant-ui/react',
    '@assistant-ui/react-ai-sdk',
];
const ADMIN_RUNTIME_ASSETS = [
    {
        source: 'assets/auto-debug-client.js',
        destination: 'auto-debug-client.js',
    },
    {
        source: 'assets/images/favicon.ico',
        destination: 'assets/favicon.ico',
    },
];
function discoverEntries() {
    const srcDir = path.resolve(__dirname, 'src');
    const entries = {};
    const excludeDirs = new Set(['article-editor', 'dev-template', 'spec-template', 'html-template', 'canvas-template']);
    const excludeRootHtmlFiles = new Set(['index.html']);
    if (fs.existsSync(srcDir)) {
        for (const item of fs.readdirSync(srcDir, { withFileTypes: true })) {
            if (!item.isDirectory() || excludeDirs.has(item.name)) {
                continue;
            }
            const htmlPath = path.join(srcDir, item.name, 'index.html');
            if (fs.existsSync(htmlPath)) {
                entries[item.name === 'index' ? 'index' : item.name] = htmlPath;
            }
        }
    }
    for (const htmlFile of fs.readdirSync(__dirname).filter((file) => file.endsWith('.html') && !excludeRootHtmlFiles.has(file))) {
        entries[htmlFile.replace(/\.html$/u, '')] = path.resolve(__dirname, htmlFile);
    }
    return entries;
}
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function createVendorResolveAliases() {
    const generatedAliases = readJsonFile(path.resolve(__dirname, 'vendor/vendor-aliases.generated.json'));
    return (generatedAliases?.packages || []).flatMap((pkg) => {
        if (!pkg.packageName || !pkg.outputDirRelative) {
            return [];
        }
        return [{
                find: new RegExp(`^${pkg.packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
                replacement: FRESH_VENDOR_ALIAS_PACKAGES.has(pkg.packageName)
                    ? path.resolve(__dirname, pkg.outputDirRelative)
                    : path.resolve(__dirname, 'node_modules', pkg.packageName),
            }];
    });
}
function createPackageSingletonAliases(packageNames) {
    return packageNames.flatMap((packageName) => {
        const packageRoot = path.resolve(__dirname, 'node_modules', packageName);
        const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return [
            { find: new RegExp(`^${escapedPackageName}$`), replacement: packageRoot },
            { find: new RegExp(`^${escapedPackageName}/`), replacement: `${packageRoot}/` },
        ];
    });
}
function copyHtmlTemplatePlugin(name, sourceRelativePath, outputFileName) {
    return {
        name,
        closeBundle() {
            const srcPath = path.resolve(__dirname, sourceRelativePath);
            const destPath = path.resolve(adminOutDir, outputFileName);
            if (!fs.existsSync(srcPath)) {
                return;
            }
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.copyFileSync(srcPath, destPath);
            console.log(`✓ ${outputFileName} copied to make-server dist/admin`);
        },
    };
}
function copyAssetsPlugin() {
    return {
        name: 'copy-assets',
        closeBundle() {
            for (const asset of ADMIN_RUNTIME_ASSETS) {
                const srcPath = path.resolve(__dirname, asset.source);
                if (!fs.existsSync(srcPath)) {
                    continue;
                }
                const destPath = path.resolve(adminOutDir, asset.destination);
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(srcPath, destPath);
            }
        },
    };
}
function renameHtmlPlugin() {
    return {
        name: 'rename-html',
        closeBundle() {
            const nestedSrcDir = path.join(adminOutDir, 'src');
            if (!fs.existsSync(nestedSrcDir)) {
                return;
            }
            for (const entry of fs.readdirSync(nestedSrcDir, { withFileTypes: true })) {
                if (!entry.isDirectory()) {
                    continue;
                }
                const indexHtmlPath = path.join(nestedSrcDir, entry.name, 'index.html');
                if (fs.existsSync(indexHtmlPath)) {
                    fs.renameSync(indexHtmlPath, path.join(adminOutDir, entry.name === 'index' ? 'index.html' : `${entry.name}.html`));
                }
            }
            fs.rmSync(nestedSrcDir, { recursive: true, force: true });
        },
    };
}
function stampAdminAssetUrlsPlugin() {
    const buildVersion = Date.now().toString();
    const collectFiles = (rootDir, extensions) => {
        const files = [];
        const walk = (currentDir) => {
            for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath);
                    continue;
                }
                if (extensions.has(path.extname(entry.name))) {
                    files.push(fullPath);
                }
            }
        };
        walk(rootDir);
        return files;
    };
    return {
        name: 'stamp-admin-asset-urls',
        closeBundle() {
            if (!fs.existsSync(adminOutDir)) {
                return;
            }
            for (const filePath of collectFiles(adminOutDir, new Set(['.html', '.css']))) {
                const originalContent = fs.readFileSync(filePath, 'utf8');
                const stampedContent = stampAdminAssetUrlsForContent(originalContent, buildVersion, path.extname(filePath).toLowerCase());
                if (stampedContent !== originalContent) {
                    fs.writeFileSync(filePath, stampedContent, 'utf8');
                }
            }
        },
    };
}
const ADMIN_ENTRY_PRELOAD_BLOCKLIST = [
    'vendor-excalidraw',
    'ExcalidrawCanvas',
    'vendor-export',
    'vendor-editor',
    'vendor-assistant',
    'vendor-genie',
];
function filterAdminEntryPreloadDependencies(filename, deps, context) {
    const isAdminIndexEntry = filename === 'assets/index.js'
        || context?.hostId === 'src/index/index.html'
        || context?.hostId === 'index.html';
    if (!isAdminIndexEntry) {
        return deps;
    }
    return deps.filter((dep) => !ADMIN_ENTRY_PRELOAD_BLOCKLIST.some((blocked) => dep.includes(blocked)));
}
/**
 * Resolve @excalidraw/* sibling packages to the copies bundled inside
 * @axhub/excalidraw/dist/siblings. The upstream Excalidraw build keeps these
 * as external imports; without this plugin Rollup/esbuild cannot find them.
 */
function excalidrawSiblingsPlugin() {
    const siblingsBase = path.resolve(__dirname, 'vendor/axhub-excalidraw/dist/siblings');
    const siblingMap = {
        '@excalidraw/common': path.join(siblingsBase, 'common/dev/index.js'),
        '@excalidraw/element': path.join(siblingsBase, 'element/dev/index.js'),
        '@excalidraw/math': path.join(siblingsBase, 'math/dev/index.js'),
        '@excalidraw/fractional-indexing': path.join(siblingsBase, 'fractional-indexing/dev/index.js'),
    };
    return {
        name: 'excalidraw-siblings',
        enforce: 'pre',
        resolveId(source) {
            // Exact match
            if (siblingMap[source]) {
                return siblingMap[source];
            }
            // Subpath match: @excalidraw/element/binding → same index.js
            const slashIndex = source.indexOf('/', '@excalidraw/'.length);
            if (slashIndex > 0) {
                const basePkg = source.substring(0, slashIndex);
                if (siblingMap[basePkg]) {
                    return siblingMap[basePkg];
                }
            }
            return null;
        },
    };
}
function portReleaseBeforeListenPlugin() {
    return {
        name: 'axhub-port-release-before-listen',
        configResolved(config) {
            if (config.command === 'serve' && !config.server.middlewareMode) {
                releaseListeningProcessesOnPort(config.server.port ?? DEFAULT_MAKE_SERVER_PORT);
            }
        },
    };
}
function adminRootDevEntryRedirectPlugin() {
    return {
        name: 'axhub-admin-root-dev-entry-redirect',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url) {
                    const requestUrl = new URL(req.url, 'http://localhost');
                    if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
                        const query = requestUrl.search;
                        res.statusCode = 302;
                        res.setHeader('Location', `/src/index/index.html${query}`);
                        res.end();
                        return;
                    }
                }
                next();
            });
        },
    };
}
export default defineConfig({
    css: {
        preprocessorOptions: {
            scss: { api: 'modern' },
            sass: { api: 'modern' },
        },
    },
    plugins: [
        portReleaseBeforeListenPlugin(),
        adminRootDevEntryRedirectPlugin(),
        excalidrawDevCjsInteropPlugin(),
        excalidrawSiblingsPlugin(),
        canvasHotUpdateFilterPlugin(),
        react(),
        tailwindcss(),
        copyAssetsPlugin(),
        renameHtmlPlugin(),
        copyHtmlTemplatePlugin('copy-dev-template', 'src/dev-template/index.html', 'dev-template.html'),
        copyHtmlTemplatePlugin('copy-spec-template', 'src/spec-template/index.html', 'spec-template.html'),
        copyHtmlTemplatePlugin('copy-canvas-template', 'src/canvas-template/index.html', 'canvas-template.html'),
        copyHtmlTemplatePlugin('copy-html-template', 'src/html-template/index.html', 'html-template.html'),
        stampAdminAssetUrlsPlugin(),
    ],
    root: path.resolve(__dirname),
    publicDir: false,
    server: {
        port: DEFAULT_MAKE_SERVER_PORT,
        open: '/',
        cors: true,
        strictPort: true,
        watch: {
            ignored: [
                '**/.axhub/**',
                '**/.spec/**',
                '**/automation-reports/**',
                '**/dist/**',
                '**/src/server/**',
                '**/client/**',
                '**/midscene/**',
                '**/vendor/**',
                '**/*.excalidraw',
                '**/*.assets/**',
            ],
        },
    },
    build: {
        outDir: adminOutDir,
        emptyOutDir: true,
        modulePreload: {
            resolveDependencies: filterAdminEntryPreloadDependencies,
        },
        rollupOptions: {
            preserveEntrySignatures: 'exports-only',
            input: {
                ...discoverEntries(),
                'dev-template-bootstrap': path.resolve(__dirname, 'src/dev-template/index.tsx'),
                'spec-template-styles': path.resolve(__dirname, 'src/spec-template/styles.ts'),
                'spec-template-bootstrap': path.resolve(__dirname, 'src/spec-template/index.tsx'),
                'canvas-template-bootstrap': path.resolve(__dirname, 'src/canvas-template/index.tsx'),
                'html-template-bootstrap': path.resolve(__dirname, 'src/html-template/index.tsx'),
                'runtime-export-core': path.resolve(__dirname, 'src/runtime-export-core.ts'),
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/chunks/[name].js',
                minifyInternalExports: false,
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name?.endsWith('.css')) {
                        return 'assets/[name].css';
                    }
                    return 'assets/[name].[ext]';
                },
                manualChunks: getManualChunkName,
                onlyExplicitManualChunks: true,
            },
        },
    },
    resolve: {
        dedupe: [
            ...REACT_SINGLETON_PACKAGES,
            ...ASSISTANT_UI_SINGLETON_PACKAGES,
        ],
        alias: [
            { find: '@', replacement: path.resolve(__dirname, 'src') },
            { find: /^next\/image$/, replacement: path.resolve(__dirname, 'src/compat/nextImage.tsx') },
            ...createVendorResolveAliases(),
            ...createPackageSingletonAliases(ASSISTANT_UI_SINGLETON_PACKAGES),
            { find: /^@axhub\/excalidraw\/index\.css$/, replacement: path.resolve(__dirname, 'vendor/axhub-excalidraw/dist/prod/index.css') },
            { find: '@ant-design/cssinjs', replacement: path.resolve(__dirname, 'node_modules/@ant-design/cssinjs') },
            { find: '@ant-design/icons', replacement: path.resolve(__dirname, 'node_modules/@ant-design/icons') },
            { find: 'antd', replacement: path.resolve(__dirname, 'node_modules/antd') },
            { find: /^assistant-stream$/, replacement: path.resolve(__dirname, 'node_modules/assistant-stream/dist/index.js') },
            { find: /^assistant-stream\/resumable$/, replacement: path.resolve(__dirname, 'node_modules/assistant-stream/dist/resumable/index.js') },
            { find: /^assistant-stream\/utils$/, replacement: path.resolve(__dirname, 'node_modules/assistant-stream/dist/utils.js') },
            { find: 'react', replacement: path.resolve(__dirname, 'node_modules/react') },
            { find: 'react-dom', replacement: path.resolve(__dirname, 'node_modules/react-dom') },
        ],
    },
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'antd',
            '@ant-design/icons',
            'cmdk',
            'lucide-react',
            'dayjs',
            '@braintree/sanitize-url',
            'lodash.throttle',
            '@axhub/excalidraw > png-chunk-text',
            '@axhub/excalidraw > png-chunks-encode',
            '@axhub/excalidraw > png-chunks-extract',
            '@axhub/excalidraw > lodash.throttle',
            '@axhub/excalidraw > lodash.debounce',
            '@axhub/excalidraw > fuzzy',
            '@axhub/excalidraw > @excalidraw/markdown-to-text',
            'use-sync-external-store/shim',
            'use-sync-external-store/shim/index.js',
            'use-sync-external-store/shim/with-selector',
            'use-sync-external-store/shim/with-selector.js',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
        ],
        exclude: [
            '@axhub/excalidraw',
            '@axhub/commentary',
            'axhub-export-core',
            'tiptap-editor',
        ],
        esbuildOptions: {
            plugins: [
                {
                    name: 'excalidraw-siblings-esbuild',
                    setup(build) {
                        const siblingsBase = path.resolve(__dirname, 'vendor/axhub-excalidraw/dist/siblings');
                        const siblingMap = {
                            '@excalidraw/common': path.join(siblingsBase, 'common/dev/index.js'),
                            '@excalidraw/element': path.join(siblingsBase, 'element/dev/index.js'),
                            '@excalidraw/math': path.join(siblingsBase, 'math/dev/index.js'),
                            '@excalidraw/fractional-indexing': path.join(siblingsBase, 'fractional-indexing/dev/index.js'),
                        };
                        build.onResolve({ filter: /^@excalidraw\// }, (args) => {
                            if (siblingMap[args.path]) {
                                return { path: siblingMap[args.path] };
                            }
                            // Subpath: @excalidraw/element/binding → element/dev/index.js
                            const slashIndex = args.path.indexOf('/', '@excalidraw/'.length);
                            if (slashIndex > 0) {
                                const basePkg = args.path.substring(0, slashIndex);
                                if (siblingMap[basePkg]) {
                                    return { path: siblingMap[basePkg] };
                                }
                            }
                            return undefined;
                        });
                    },
                },
            ],
        },
    },
});
