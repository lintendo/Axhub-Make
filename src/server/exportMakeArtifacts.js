import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProjectPath, } from './projectCore/index.ts';
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const FIGMA_ARTIFACT_ROOT_RELATIVE = '.axhub/make/artifacts/figma';
function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeRelativePath(value) {
    return stringValue(value).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }
    catch {
        return null;
    }
}
function countFilesRecursive(dirPath) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return 0;
    }
    let total = 0;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            total += countFilesRecursive(entryPath);
            continue;
        }
        if (entry.isFile()) {
            total += 1;
        }
    }
    return total;
}
function resolveProjectFile(projectRoot, rawPath) {
    const candidate = stringValue(rawPath);
    if (!candidate) {
        return null;
    }
    try {
        const filePath = resolveProjectPath(projectRoot, candidate);
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : null;
    }
    catch {
        return null;
    }
}
function resolveProjectDir(projectRoot, rawPath) {
    const candidate = stringValue(rawPath);
    if (!candidate) {
        return null;
    }
    try {
        const dirPath = resolveProjectPath(projectRoot, candidate);
        return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory() ? dirPath : null;
    }
    catch {
        return null;
    }
}
function resolveProjectPathForArtifact(projectRoot, rawPath) {
    const candidate = stringValue(rawPath);
    if (!candidate) {
        return null;
    }
    try {
        return resolveProjectPath(projectRoot, candidate);
    }
    catch {
        return null;
    }
}
function getResourceId(resource, rawPath) {
    const normalizedPath = normalizeRelativePath(rawPath);
    return stringValue(resource?.id)
        || stringValue(resource?.name)
        || path.basename(normalizedPath)
        || 'project';
}
function getFigmaArtifactConfig(resource) {
    const artifacts = resource?.artifacts;
    const figma = artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts)
        ? artifacts.figma
        : null;
    return figma && typeof figma === 'object' && !Array.isArray(figma) ? figma : {};
}
function resolveSourceDir(sourceFile) {
    if (!sourceFile) {
        return null;
    }
    try {
        return fs.existsSync(sourceFile) && fs.statSync(sourceFile).isFile() ? path.dirname(sourceFile) : null;
    }
    catch {
        return null;
    }
}
function resolveArtifactRoot(projectRoot, resourceId, figma, sourceDir) {
    const explicitRoot = resolveProjectDir(projectRoot, figma.artifactRootPath || figma.artifactDir || figma.rootPath);
    if (explicitRoot) {
        return explicitRoot;
    }
    const defaultRoot = path.join(projectRoot, FIGMA_ARTIFACT_ROOT_RELATIVE, resourceId);
    const hasDefaultArtifact = fs.existsSync(defaultRoot);
    const hasExplicitArtifactPath = [
        figma.canvasFigPath,
        figma.metaPath,
        figma.metaJsonPath,
        figma.aiChatPath,
        figma.codeManifestPath,
        figma.manifestPath,
        figma.imagesDir,
    ].some((value) => Boolean(stringValue(value)));
    if (hasDefaultArtifact || hasExplicitArtifactPath || !sourceDir) {
        return defaultRoot;
    }
    const legacyCanvasFig = path.join(sourceDir, 'canvas.fig');
    return fs.existsSync(legacyCanvasFig) ? sourceDir : defaultRoot;
}
function createDefaultMakeMeta(baseName) {
    return {
        client_meta: {
            background_color: { r: 0.96, g: 0.96, b: 0.96, a: 1 },
            thumbnail_size: { width: 400, height: 300 },
            render_coordinates: { x: 0, y: 0, width: 1280, height: 960 },
        },
        file_name: baseName,
        developer_related_links: [],
        exported_at: new Date().toISOString(),
    };
}
function fileNameFromMeta(meta, fallback) {
    const rawFileName = stringValue(meta?.file_name);
    const normalizedFileName = rawFileName || fallback || 'project';
    return normalizedFileName.endsWith('.fig') ? normalizedFileName : `${normalizedFileName}.fig`;
}
function collectDriftReasons(sourceDir) {
    if (!sourceDir) {
        return [];
    }
    const driftReasons = [];
    const rootIndexPath = path.join(sourceDir, 'index.tsx');
    const rootStylePath = path.join(sourceDir, 'style.css');
    const appTsxPath = path.join(sourceDir, 'src', 'App.tsx');
    const indexCssPath = path.join(sourceDir, 'src', 'index.css');
    if (fs.existsSync(rootIndexPath) && fs.existsSync(appTsxPath)) {
        const rootIndexStat = fs.statSync(rootIndexPath);
        const appTsxStat = fs.statSync(appTsxPath);
        if (rootIndexStat.mtimeMs > appTsxStat.mtimeMs + 1000) {
            driftReasons.push('根目录 index.tsx 比 src/App.tsx 更新，Figma 导出壳子可能未同步最新页面逻辑。');
        }
    }
    if (fs.existsSync(rootStylePath) && fs.existsSync(indexCssPath)) {
        const rootStyleStat = fs.statSync(rootStylePath);
        const indexCssStat = fs.statSync(indexCssPath);
        if (rootStyleStat.mtimeMs > indexCssStat.mtimeMs + 1000) {
            driftReasons.push('根目录 style.css 比 src/index.css 更新，Figma 导出壳子的样式可能未同步。');
        }
    }
    return driftReasons;
}
export function analyzeFigmaMakeArtifact(options) {
    const projectRoot = path.resolve(options.projectRoot);
    const resourceId = getResourceId(options.resource, options.rawPath);
    const figma = getFigmaArtifactConfig(options.resource);
    const sourceDir = resolveSourceDir(options.sourceFile);
    const artifactRoot = resolveArtifactRoot(projectRoot, resourceId, figma, sourceDir);
    const canvasFigPath = resolveProjectFile(projectRoot, figma.canvasFigPath) || path.join(artifactRoot, 'canvas.fig');
    const metaJsonPath = resolveProjectFile(projectRoot, figma.metaPath || figma.metaJsonPath) || path.join(artifactRoot, 'meta.json');
    const aiChatPath = resolveProjectFile(projectRoot, figma.aiChatPath) || path.join(artifactRoot, 'ai_chat.json');
    const codeManifestPath = resolveProjectFile(projectRoot, figma.codeManifestPath || figma.canvasCodeManifestPath)
        || path.join(artifactRoot, 'canvas.code-manifest.json');
    const artifactManifestPath = resolveProjectFile(projectRoot, figma.manifestPath) || path.join(artifactRoot, 'manifest.json');
    const imagesDir = resolveProjectDir(projectRoot, figma.imagesDir) || path.join(artifactRoot, 'images');
    const thumbnailPath = resolveProjectFile(projectRoot, figma.thumbnailPath) || path.join(artifactRoot, 'thumbnail.png');
    const meta = readJsonFile(metaJsonPath);
    const fallbackFileName = stringValue(options.resource?.title) || stringValue(options.resource?.name) || resourceId;
    const driftReasons = collectDriftReasons(sourceDir);
    return {
        ok: true,
        path: normalizeRelativePath(options.rawPath),
        projectRoot,
        resourceId,
        artifactRoot,
        artifactRootRelativePath: toPosix(path.relative(projectRoot, artifactRoot)),
        sourceDir,
        canvasFigPath,
        metaJsonPath,
        aiChatPath,
        codeManifestPath,
        artifactManifestPath,
        imagesDir,
        thumbnailPath,
        hasMakeAssets: fs.existsSync(canvasFigPath),
        lastExportedAt: typeof meta?.exported_at === 'string' ? meta.exported_at : null,
        fileName: fileNameFromMeta(meta, fallbackFileName),
        hasCanvasFig: fs.existsSync(canvasFigPath),
        hasMetaJson: fs.existsSync(metaJsonPath),
        hasAiChat: fs.existsSync(aiChatPath),
        hasThumbnail: fs.existsSync(thumbnailPath),
        hasManifest: fs.existsSync(codeManifestPath),
        hasArtifactManifest: fs.existsSync(artifactManifestPath),
        hasImagesDir: fs.existsSync(imagesDir),
        imageCount: countFilesRecursive(imagesDir),
        hasDriftRisk: driftReasons.length > 0,
        driftReasons,
        meta,
    };
}
export function buildFigmaMakeProbePayload(snapshot) {
    return {
        ok: true,
        path: snapshot.path,
        hasMakeAssets: snapshot.hasMakeAssets,
        lastExportedAt: snapshot.lastExportedAt,
        fileName: snapshot.fileName,
        hasCanvasFig: snapshot.hasCanvasFig,
        hasMetaJson: snapshot.hasMetaJson,
        hasAiChat: snapshot.hasAiChat,
        hasThumbnail: snapshot.hasThumbnail,
        hasManifest: snapshot.hasManifest,
        hasImagesDir: snapshot.hasImagesDir,
        imageCount: snapshot.imageCount,
        hasDriftRisk: snapshot.hasDriftRisk,
        driftReasons: snapshot.driftReasons,
    };
}
export function ensureFigmaMakeMeta(snapshot) {
    const baseName = path.basename(snapshot.resourceId) || 'project';
    const existingMeta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta : {};
    const defaultMeta = createDefaultMakeMeta(baseName);
    const nextMeta = {
        ...defaultMeta,
        ...existingMeta,
        client_meta: {
            ...defaultMeta.client_meta,
            ...existingMeta.client_meta,
        },
        developer_related_links: Array.isArray(existingMeta.developer_related_links)
            ? existingMeta.developer_related_links
            : [],
        file_name: stringValue(existingMeta.file_name) || baseName,
        exported_at: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(snapshot.metaJsonPath), { recursive: true });
    fs.writeFileSync(snapshot.metaJsonPath, JSON.stringify(nextMeta, null, 2), 'utf8');
    return nextMeta;
}
export function ensureFigmaMakeAiChat(snapshot) {
    if (!fs.existsSync(snapshot.aiChatPath)) {
        fs.mkdirSync(path.dirname(snapshot.aiChatPath), { recursive: true });
        fs.writeFileSync(snapshot.aiChatPath, '{}\n', 'utf8');
    }
}
export function resolveCanvasFigSyncScript(projectRoot, options = {}) {
    const currentServerDir = options.serverDir || serverDir;
    const cwd = options.cwd || process.cwd();
    const env = options.env || process.env;
    const exists = options.exists || ((candidate) => fs.existsSync(candidate));
    const explicitScript = env.AXHUB_MAKE_CANVAS_FIG_SYNC?.trim();
    if (explicitScript) {
        return path.resolve(cwd, explicitScript);
    }
    const candidates = [
        path.resolve(currentServerDir, '../../vendor/axhub-export-core/scripts/canvas-fig-sync.mjs'),
        path.resolve(currentServerDir, '../../scripts/canvas-fig-sync.mjs'),
        path.resolve(path.dirname(options.execPath || process.execPath), 'scripts/canvas-fig-sync.mjs'),
        path.resolve(projectRoot, 'scripts/canvas-fig-sync.mjs'),
    ];
    const scriptPath = candidates.find((candidate) => exists(candidate));
    if (!scriptPath) {
        throw new Error('canvas-fig-sync.mjs not found; install axhub-export-core or provide scripts/canvas-fig-sync.mjs');
    }
    return scriptPath;
}
function commandErrorMessage(error) {
    const stderr = error?.stderr ? Buffer.from(error.stderr).toString('utf8').trim() : '';
    const stdout = error?.stdout ? Buffer.from(error.stdout).toString('utf8').trim() : '';
    return stderr || stdout || error?.message || 'canvas-fig-sync failed';
}
export function runFigmaMakePackAndInspect(projectRoot, snapshot) {
    const scriptPath = resolveCanvasFigSyncScript(projectRoot);
    const sourceDir = snapshot.sourceDir && fs.existsSync(snapshot.sourceDir) ? snapshot.sourceDir : snapshot.artifactRoot;
    fs.mkdirSync(path.dirname(snapshot.codeManifestPath), { recursive: true });
    try {
        childProcess.execFileSync(process.execPath, [
            scriptPath,
            'pack',
            '--fig',
            snapshot.canvasFigPath,
            '--from',
            sourceDir,
            '--prune-missing',
            '--sanitize-for-export',
            '--manifest',
            snapshot.codeManifestPath,
        ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
        childProcess.execFileSync(process.execPath, [
            scriptPath,
            'inspect',
            '--fig',
            snapshot.canvasFigPath,
            '--manifest',
            snapshot.codeManifestPath,
        ], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    catch (error) {
        throw new Error(commandErrorMessage(error));
    }
}
export function buildFigmaMakeExportPrompt(snapshot) {
    const sourceDir = snapshot.sourceDir || snapshot.artifactRoot;
    const sourceDirRelative = snapshot.sourceDir
        ? toPosix(path.relative(snapshot.projectRoot, sourceDir))
        : snapshot.artifactRootRelativePath;
    const relativeCanvasFig = toPosix(path.relative(snapshot.projectRoot, snapshot.canvasFigPath));
    const relativeMeta = toPosix(path.relative(snapshot.projectRoot, snapshot.metaJsonPath));
    const relativeManifest = toPosix(path.relative(snapshot.projectRoot, snapshot.codeManifestPath));
    const relativeAiChat = toPosix(path.relative(snapshot.projectRoot, snapshot.aiChatPath));
    const relativeImagesDir = toPosix(path.relative(snapshot.projectRoot, snapshot.imagesDir));
    const sceneLabel = snapshot.hasCanvasFig ? '场景 A（已有 Figma 导出资产）' : '场景 B（需要补齐 Figma Make 导出资产）';
    let prompt = `请将当前页面补齐为可导出的 Figma Make 资产结构，并确保最终可通过 \`/api/export-make?path=${snapshot.path}\` 下载产物 \`${snapshot.fileName}\`。\n\n`;
    prompt += `请先阅读以下技能文档：\n`;
    prompt += `- https://github.com/lintendo/Axhub-Skills/blob/main/skills/react-to-figma-make/SKILL.md\n\n`;
    prompt += `目标源码目录：\`${sourceDirRelative || '.'}/\`\n`;
    prompt += `目标产物目录：\`${snapshot.artifactRootRelativePath}/\`\n`;
    prompt += `当前判定：${sceneLabel}\n`;
    prompt += `最终产物说明：接口最终下载的是原始 \`canvas.fig\`，文件名为 \`${snapshot.fileName}\`。\n\n`;
    prompt += `当前资产状态：\n`;
    prompt += `- canvas.fig：${snapshot.hasCanvasFig ? '已存在' : '缺失'}\n`;
    prompt += `- meta.json：${snapshot.hasMetaJson ? '已存在' : '缺失'}\n`;
    prompt += `- ai_chat.json：${snapshot.hasAiChat ? '已存在' : '缺失'}\n`;
    prompt += `- canvas.code-manifest.json：${snapshot.hasManifest ? '已存在' : '缺失'}\n`;
    prompt += `- manifest.json：${snapshot.hasArtifactManifest ? '已存在' : '缺失'}\n`;
    prompt += `- images/：${snapshot.hasImagesDir ? `已存在（${snapshot.imageCount} 个文件）` : '缺失'}\n\n`;
    if (snapshot.hasDriftRisk) {
        prompt += `当前检测到导出壳子可能未同步：\n`;
        snapshot.driftReasons.forEach((reason) => {
            prompt += `- ${reason}\n`;
        });
        prompt += `\n`;
    }
    prompt += `执行要求：\n`;
    prompt += `1. 不要删除已有业务源码，也不要删除任何已存在的 Figma 原始资产。\n`;
    prompt += `2. 产物必须写入 \`${snapshot.artifactRootRelativePath}/\`，其中 \`canvas.fig\` 路径为 \`${relativeCanvasFig}\`。\n`;
    prompt += `3. 生成或更新 \`${relativeMeta}\`，至少包含 \`file_name\`、\`exported_at\`、\`client_meta\`、\`developer_related_links\`。\n`;
    prompt += `4. 确保 \`${relativeAiChat}\` 至少是空 JSON 对象 \`{}\`。\n`;
    prompt += `5. 生成或更新 \`${relativeManifest}\`：\n`;
    prompt += `   \`node scripts/canvas-fig-sync.mjs inspect --fig ${relativeCanvasFig} --manifest ${relativeManifest}\`\n`;
    prompt += `6. 如页面依赖图片资源，请把导出所需图片保留或同步到 \`${relativeImagesDir}/\`。\n\n`;
    prompt += `验收要求：\n`;
    prompt += `- \`node scripts/canvas-fig-sync.mjs inspect --fig ${relativeCanvasFig}\` 能成功执行\n`;
    prompt += `- \`${relativeMeta}\` 中 \`file_name\` 对应最终下载文件名 \`${snapshot.fileName}\`\n`;
    prompt += `- 再次访问 \`/api/export-make?path=${snapshot.path}&probe=1\` 时，返回 \`hasMakeAssets: true\`\n`;
    return prompt;
}
export function hasFigmaMakeArtifactCapability(projectRoot, metadata) {
    return metadata.resources.prototypes.some((resource) => {
        const figma = getFigmaArtifactConfig(resource);
        const explicitCanvas = resolveProjectFile(projectRoot, figma.canvasFigPath);
        if (explicitCanvas) {
            return true;
        }
        const resourceId = getResourceId(resource, resource.id || resource.name);
        if (fs.existsSync(path.join(projectRoot, FIGMA_ARTIFACT_ROOT_RELATIVE, resourceId, 'canvas.fig'))) {
            return true;
        }
        const sourceFile = resolveProjectPathForArtifact(projectRoot, resource.absoluteFilePath || resource.filePath);
        if (sourceFile && fs.existsSync(path.join(path.dirname(sourceFile), 'canvas.fig'))) {
            return true;
        }
        return false;
    });
}
