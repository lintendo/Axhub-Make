import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempRoots = [];
function createTempRoot(prefix = 'axure-html-converter-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
}
function writeFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}
function createMinimalAxureExport(root) {
    writeFile(path.join(root, 'data', 'document.js'), `$axure.loadDocument(function() {
  return {
    sitemap: {
      rootNodes: [
        { type: 'Wireframe', pageName: '首页', url: '首页.html' },
        { type: 'Wireframe', pageName: '详情', url: 'detail.html' }
      ]
    }
  };
});`);
    writeFile(path.join(root, '首页.html'), `<!doctype html>
<html>
  <head>
    <title>首页</title>
    <link href="resources/css/axure_rp_page.css" type="text/css" rel="stylesheet"/>
    <link href="data/styles.css" type="text/css" rel="stylesheet"/>
    <link href="files/首页/styles.css" type="text/css" rel="stylesheet"/>
    <script src="resources/scripts/jquery-3.7.1.min.js"></script>
    <script src="resources/scripts/axure/axQuery.js"></script>
    <script src="resources/scripts/axutils.js"></script>
    <script src="resources/scripts/axure/visibility.js"></script>
    <script src="data/document.js"></script>
    <script src="files/首页/data.js"></script>
    <script type="text/javascript">
      $axure.utils.getTransparentGifPath = function() { return 'resources/images/transparent.gif'; };
    </script>
  </head>
  <body>
    <div id="base">
      <a id="u1" href="detail.html"><img src="images/首页/u1.png"/><span>欢迎宝宝</span></a>
      <img id="u2" src="images/首页/quote'asset.png"/>
      <script id="u3_script" type="axure-repeater-template"><div>模板不应执行</div></script>
      <script>window.__bodyScriptRan = true;</script>
    </div>
  </body>
</html>`);
    writeFile(path.join(root, 'detail.html'), `<!doctype html>
<html>
  <head>
    <title>详情</title>
    <link href="resources/css/axure_rp_page.css" type="text/css" rel="stylesheet"/>
    <script src="resources/scripts/jquery-3.7.1.min.js"></script>
    <script src="resources/scripts/axure/axQuery.js"></script>
    <script src="resources/scripts/axutils.js"></script>
    <script src="resources/scripts/axure/visibility.js"></script>
    <script src="data/document.js"></script>
    <script src="files/详情/data.js"></script>
  </head>
  <body>
    <div id="base"><div id="u4">详情页</div></div>
  </body>
</html>`);
    writeFile(path.join(root, 'resources', 'css', 'axure_rp_page.css'), 'body { margin: 0; }');
    writeFile(path.join(root, 'data', 'styles.css'), '#base { min-height: 100vh; }');
    writeFile(path.join(root, 'files', '首页', 'styles.css'), '#u1 { position: absolute; }');
    writeFile(path.join(root, 'resources', 'scripts', 'jquery-3.7.1.min.js'), 'window.jQuery = window.$ = function() { return { ready(fn) { fn(); }, off() {}, on() {}, bind() {} }; }; window.jQuery.fn = { ready(fn) { fn(); } };');
    writeFile(path.join(root, 'resources', 'scripts', 'axure', 'axQuery.js'), 'window.$axure = window.$axure || {}; $axure.internal = function(fn) { window.__ax = window.__ax || { public: $axure }; return fn(window.__ax); };');
    writeFile(path.join(root, 'resources', 'scripts', 'axure', 'visibility.js'), `$axure.internal(function($ax) {
  $ax.visibility = {};
  $ax.visibility.IsVisible = function(element) {
    return element.style.visibility != 'hidden';
  };
  $ax.visibility.SetVisible = function(element, visible) {
    if (visible) {
      var jElement = $(element);
      element.style.display = '';
    }
  };
});`);
    writeFile(path.join(root, 'resources', 'scripts', 'axutils.js'), `const START_URL_NAME = 'start.html';
const PAGE_ID_NAME = 'id';
const PAGE_URL_NAME = 'p';
const SITEMAP_COLLAPSE_VAR_NAME = 'c';
const SITEMAP_COLLAPSE_VALUE = "1";
const SITEMAP_CLOSE_VALUE = "2";
const GLOBAL_VAR_NAME = 'ZQZ=s&';
const GLOBAL_VAR_CHECKSUM = 'CSUM';
window.$axure = window.$axure || {};
window.$axure.utils = {};`);
    writeFile(path.join(root, 'files', '首页', 'data.js'), `$axure.loadCurrentPage(function() {
  return { url: '首页.html', page: { name: '首页' }, objectPaths: {} };
});`);
    writeFile(path.join(root, 'files', '详情', 'data.js'), `$axure.loadCurrentPage(function() {
  return { url: 'detail.html', page: { name: '详情' }, objectPaths: {} };
});`);
    writeFile(path.join(root, 'images', '首页', 'u1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFile(path.join(root, 'images', '首页', "quote'asset.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}
function runConverter(sourceRoot, outputName) {
    const projectRoot = createTempRoot('axure-html-project-');
    const outputBaseDir = path.join(projectRoot, 'src', 'prototypes');
    const stdout = execFileSync(process.execPath, [
        path.join(__dirname, 'axure-html-converter.mjs'),
        sourceRoot,
        outputName,
        '--target-type',
        'prototypes',
        '--project-root',
        projectRoot,
        '--output-base-dir',
        outputBaseDir,
    ], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return {
        projectRoot,
        outputBaseDir,
        outputDir: path.join(outputBaseDir, outputName),
        result: JSON.parse(stdout.trim().split(/\r?\n/u).at(-1) || '{}'),
    };
}
function readLegacyPages(outputDir) {
    const source = fs.readFileSync(path.join(outputDir, 'legacy-pages-data.ts'), 'utf8');
    const match = source.match(/export const legacyPages = ([\s\S]*?) as const;/u);
    if (!match) {
        throw new Error('legacyPages export was not found');
    }
    return JSON.parse(match[1]);
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('axure-html-converter', () => {
    it('converts Axure HTML exports into deterministic multi-page legacy-mounted React prototypes', () => {
        const sourceRoot = createTempRoot('axure-html-source-');
        createMinimalAxureExport(sourceRoot);
        const { outputDir, result } = runConverter(sourceRoot, 'baby-demo');
        const indexSource = fs.readFileSync(path.join(outputDir, 'index.tsx'), 'utf8');
        const pagesSource = fs.readFileSync(path.join(outputDir, 'legacy-pages-data.ts'), 'utf8');
        const rendererSource = fs.readFileSync(path.join(outputDir, 'LegacyAxurePage.tsx'), 'utf8');
        const agentsSource = fs.readFileSync(path.join(outputDir, 'AGENTS.md'), 'utf8');
        const report = JSON.parse(fs.readFileSync(path.join(outputDir, '.spec', 'axure-import-report.json'), 'utf8'));
        expect(result).toMatchObject({
            success: true,
            outputDir,
            requiresAi: false,
            pages: [
                { id: 'page-001', title: '首页' },
                { id: 'detail', title: '详情' },
            ],
            defaultPageId: 'page-001',
        });
        expect(result.warnings).toEqual(expect.any(Array));
        expect(indexSource).toContain("import { defineHashPageRoute, useHashPage } from '../../common/useHashPage';");
        expect(indexSource).toContain("defineHashPageRoute([\n  { id: 'page-001', title: '首页' },\n  { id: 'detail', title: '详情' },\n], { defaultPageId: 'page-001' })");
        expect(indexSource).toContain('return <LegacyAxurePage page={activePage} setPage={setPage} />;');
        expect(indexSource).not.toContain('key={activePage.id}');
        expect(pagesSource).toContain('legacyBasePath');
        expect(pagesSource).toContain('/prototypes/baby-demo/legacy/');
        expect(pagesSource).toContain('首页.html');
        expect(pagesSource).toContain('detail.html');
        expect(pagesSource).toContain('欢迎宝宝');
        expect(rendererSource).toContain('export function LegacyAxurePage');
        expect(rendererSource).toContain('let activeMountId = 0');
        expect(rendererSource).toContain('async function loadExternalScript');
        expect(rendererSource).toContain("fetch(src, { cache: 'force-cache' })");
        expect(rendererSource).toContain('if (!isActiveMount()) return false;');
        expect(rendererSource).toContain('function patchAxureNavigation');
        expect(rendererSource).toContain('internalAxure.navigate = patchedNavigate');
        expect(rendererSource).toContain('function handleContainerClick');
        expect(fs.existsSync(path.join(outputDir, 'legacy', 'images', '首页', 'u1.png'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'legacy', 'images', '首页', "quote'asset.png"))).toBe(true);
        expect(fs.readFileSync(path.join(outputDir, 'legacy', 'resources', 'scripts', 'axutils.js'), 'utf8')).toContain("var START_URL_NAME = 'start.html';");
        const visibilitySource = fs.readFileSync(path.join(outputDir, 'legacy', 'resources', 'scripts', 'axure', 'visibility.js'), 'utf8');
        expect(visibilitySource).toContain("return !!element && element.style.visibility != 'hidden';");
        expect(visibilitySource).toContain('if (!element) return;');
        expect(agentsSource).toContain('这是一个从 Axure HTML 导出转换来的原型项目');
        expect(agentsSource).toContain('绝对定位的视觉稿');
        expect(agentsSource).toContain('较大的结构、布局或交互修改');
        expect(agentsSource).toContain('legacy/');
        expect(agentsSource).toContain('data/document.js');
        expect(agentsSource).toContain('files/<page>/data.js');
        expect(agentsSource).toContain('legacy-pages-data.ts');
        expect(agentsSource).toContain('Axhub-Skills/tree/main/skills/extract-axure-data');
        expect(agentsSource).toContain('Page count: 2');
        expect(agentsSource).toContain('Default page: page-001');
        expect(report).toMatchObject({
            source: 'axure_html',
            pageCount: 2,
            assetCount: expect.any(Number),
            defaultPageId: 'page-001',
        });
    });
    it('preserves Axure body markup while executing only executable scripts through the controlled loader', () => {
        const sourceRoot = createTempRoot('axure-html-source-');
        createMinimalAxureExport(sourceRoot);
        const { outputDir } = runConverter(sourceRoot, 'markup-demo');
        const pages = readLegacyPages(outputDir);
        const homePage = pages.find((page) => page.id === 'page-001');
        expect(homePage.bodyHtml).toContain('type="axure-repeater-template"');
        expect(homePage.bodyHtml).toContain('/prototypes/markup-demo/legacy/images/首页/u1.png');
        expect(homePage.bodyHtml).toContain("/prototypes/markup-demo/legacy/images/首页/quote'asset.png");
        expect(homePage.bodyHtml).not.toContain('window.__bodyScriptRan = true;');
        expect(homePage.scripts).toContainEqual({ type: 'inline', value: 'window.__bodyScriptRan = true;' });
    });
    it('rejects directories that are not Axure HTML exports', () => {
        const sourceRoot = createTempRoot('not-axure-source-');
        writeFile(path.join(sourceRoot, 'index.html'), '<html><body>plain html</body></html>');
        expect(() => runConverter(sourceRoot, 'plain-html')).toThrow(/data\/document\.js/u);
    });
});
