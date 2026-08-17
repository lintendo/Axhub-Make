import path from 'node:path';
const EXCALIDRAW_CJS_OPTIMIZED_DEPS = {
    'png-chunk-text': '@axhub_excalidraw___png-chunk-text.js',
    'png-chunks-encode': '@axhub_excalidraw___png-chunks-encode.js',
    'png-chunks-extract': '@axhub_excalidraw___png-chunks-extract.js',
    'lodash.throttle': '@axhub_excalidraw___lodash__throttle.js',
    'lodash.debounce': '@axhub_excalidraw___lodash__debounce.js',
    fuzzy: '@axhub_excalidraw___fuzzy.js',
    '@excalidraw/markdown-to-text': '@axhub_excalidraw___@excalidraw_markdown-to-text.js',
};
const TIPTAP_EDITOR_CJS_OPTIMIZED_DEPS = {
    'lodash.throttle': 'lodash__throttle.js',
};
const MARKDOWN_TO_TEXT_DEP = '@excalidraw/markdown-to-text';
const MARKDOWN_TO_TEXT_CJS_IMPORT = '__axhubMarkdownToTextCjs';
function normalizeFilePath(filePath) {
    return filePath.replace(/\\/gu, '/');
}
function isExcalidrawDevBundleId(id) {
    const normalizedId = normalizeFilePath(id.split('?')[0] || id);
    return normalizedId.includes('/@axhub/excalidraw/dist/dev/')
        || normalizedId.includes('/vendor/axhub-excalidraw/dist/dev/');
}
function isMermaidToExcalidrawBundleId(id) {
    const normalizedId = normalizeFilePath(id.split('?')[0] || id);
    return normalizedId.includes('/@excalidraw/mermaid-to-excalidraw/dist/');
}
function isExcalidrawDevCjsInteropId(id) {
    return isExcalidrawDevBundleId(id) || isMermaidToExcalidrawBundleId(id);
}
function isTiptapEditorVendorBundleId(id) {
    const normalizedId = normalizeFilePath(id.split('?')[0] || id);
    return normalizedId.includes('/vendor/tiptap-editor/dist/');
}
function toDevServerPath(filePath, root) {
    const normalizedFilePath = normalizeFilePath(path.resolve(filePath));
    const normalizedRoot = normalizeFilePath(path.resolve(root));
    const relativePath = normalizeFilePath(path.relative(normalizedRoot, normalizedFilePath));
    if (relativePath && !relativePath.startsWith('../') && relativePath !== '..' && !path.isAbsolute(relativePath)) {
        return `/${relativePath}`;
    }
    return `/@fs/${normalizedFilePath}`;
}
function createOptimizedDepUrl(depFileName, options) {
    return `${toDevServerPath(path.join(options.cacheDir, 'deps', depFileName), options.root)}`;
}
function rewriteImportSpecifiers(code, depName, optimizedDepUrl) {
    const escapedDepName = depName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const staticImportPattern = new RegExp(`(\\bfrom\\s*)(["'])${escapedDepName}\\2`, 'gu');
    const dynamicImportPattern = new RegExp(`(\\bimport\\(\\s*)(["'])${escapedDepName}\\2`, 'gu');
    return code
        .replace(staticImportPattern, (_match, prefix, quote) => `${prefix}${quote}${optimizedDepUrl}${quote}`)
        .replace(dynamicImportPattern, (_match, prefix, quote) => `${prefix}${quote}${optimizedDepUrl}${quote}`);
}
function rewriteMarkdownToTextNamedImport(code, optimizedDepUrl) {
    const escapedDepName = MARKDOWN_TO_TEXT_DEP.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const namedImportPattern = new RegExp(`\\bimport\\s*\\{\\s*removeMarkdown\\s*\\}\\s*from\\s*(["'])${escapedDepName}\\1\\s*;?`, 'gu');
    return code.replace(namedImportPattern, [
        `import ${MARKDOWN_TO_TEXT_CJS_IMPORT} from "${optimizedDepUrl}";`,
        `const { removeMarkdown } = ${MARKDOWN_TO_TEXT_CJS_IMPORT};`,
    ].join('\n'));
}
export function rewriteExcalidrawDevCjsImports(code, id, options) {
    if (!isExcalidrawDevCjsInteropId(id) && !isTiptapEditorVendorBundleId(id)) {
        return null;
    }
    let rewritten = code;
    const cjsOptimizedDeps = isTiptapEditorVendorBundleId(id)
        ? TIPTAP_EDITOR_CJS_OPTIMIZED_DEPS
        : EXCALIDRAW_CJS_OPTIMIZED_DEPS;
    for (const [depName, depFileName] of Object.entries(cjsOptimizedDeps)) {
        const optimizedDepUrl = createOptimizedDepUrl(depFileName, options);
        if (depName === MARKDOWN_TO_TEXT_DEP) {
            rewritten = rewriteMarkdownToTextNamedImport(rewritten, optimizedDepUrl);
        }
        rewritten = rewriteImportSpecifiers(rewritten, depName, optimizedDepUrl);
    }
    return rewritten === code ? null : rewritten;
}
export function excalidrawDevCjsInteropPlugin() {
    let resolvedConfig = null;
    return {
        name: 'axhub-excalidraw-dev-cjs-interop',
        enforce: 'pre',
        configResolved(config) {
            resolvedConfig = config;
        },
        transform(code, id) {
            if (!resolvedConfig || resolvedConfig.command !== 'serve') {
                return null;
            }
            const rewritten = rewriteExcalidrawDevCjsImports(code, id, {
                root: resolvedConfig.root,
                cacheDir: resolvedConfig.cacheDir,
            });
            return rewritten ? { code: rewritten, map: null } : null;
        },
    };
}
