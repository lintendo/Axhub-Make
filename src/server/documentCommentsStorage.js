import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const COMMENTS_ROOT = path.join('.axhub', 'make', 'comments');
const ASSETS_ROOT = path.join('.axhub', 'make', 'comment-assets');
const PROTECTED_ROOTS = new Set(['.axhub', '.git', 'node_modules']);
const DOCUMENT_EXTENSIONS = new Set(['.md', '.mdx', '.html', '.htm']);
function isWindowsAbsolutePath(value) {
    return /^[a-z]:[\\/]/iu.test(value) || /^\\\\/u.test(value);
}
export function normalizeDocumentCommentPath(value) {
    const raw = String(value ?? '').trim().replace(/\\/gu, '/');
    if (!raw || raw.includes('\0') || raw.startsWith('/') || isWindowsAbsolutePath(raw)) {
        return null;
    }
    const segments = raw.split('/').filter(Boolean);
    if (segments.length === 0
        || segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))
        || PROTECTED_ROOTS.has(segments[0].toLowerCase())) {
        return null;
    }
    const extension = path.posix.extname(segments.at(-1) || '').toLowerCase();
    if (!DOCUMENT_EXTENSIONS.has(extension))
        return null;
    return segments.join('/');
}
export function documentCommentHash(documentPath) {
    const normalized = normalizeDocumentCommentPath(documentPath);
    if (!normalized)
        throw new Error('Invalid document comment path');
    return crypto.createHash('sha256')
        .update(`document-comments:v1\0${normalized}`)
        .digest('hex');
}
export function normalizePrototypeCommentTargetPath(value) {
    const raw = String(value ?? '').trim().replace(/\\/gu, '/').replace(/^\/+/, '');
    if (!raw || raw.includes('\0'))
        return null;
    const segments = raw.split('/').filter(Boolean);
    if (segments.length !== 2
        || segments[0] !== 'prototypes'
        || !segments[1]
        || segments[1].startsWith('.')
        || segments.some((segment) => segment === '.' || segment === '..')) {
        return null;
    }
    return `prototypes/${segments[1]}`;
}
export function prototypeCommentHash(targetPath) {
    const normalized = normalizePrototypeCommentTargetPath(targetPath);
    if (!normalized)
        throw new Error('Invalid prototype comment target path');
    return crypto.createHash('sha256')
        .update(`prototype-comments:v1\0${normalized}`)
        .digest('hex');
}
function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function validateExistingDirectory(root, directory) {
    if (!fs.existsSync(directory))
        return true;
    try {
        if (fs.lstatSync(directory).isSymbolicLink())
            return false;
        return isInside(fs.realpathSync.native(root), fs.realpathSync.native(directory));
    }
    catch {
        return false;
    }
}
function validateExistingFile(root, filePath) {
    if (!fs.existsSync(filePath))
        return true;
    try {
        if (fs.lstatSync(filePath).isSymbolicLink())
            return false;
        return isInside(fs.realpathSync.native(root), fs.realpathSync.native(filePath));
    }
    catch {
        return false;
    }
}
export function resolveDocumentCommentStorage(projectRoot, documentPath) {
    const normalized = normalizeDocumentCommentPath(documentPath);
    if (!normalized)
        return null;
    let realProjectRoot;
    try {
        realProjectRoot = fs.realpathSync.native(projectRoot);
    }
    catch {
        return null;
    }
    const sourcePath = path.resolve(projectRoot, normalized);
    if (!isInside(path.resolve(projectRoot), sourcePath))
        return null;
    if (fs.existsSync(sourcePath)) {
        try {
            if (!fs.statSync(sourcePath).isFile() || !isInside(realProjectRoot, fs.realpathSync.native(sourcePath))) {
                return null;
            }
        }
        catch {
            return null;
        }
    }
    else {
        const parent = path.dirname(sourcePath);
        if (!validateExistingDirectory(realProjectRoot, parent))
            return null;
    }
    const hash = documentCommentHash(normalized);
    const commentsRoot = path.resolve(projectRoot, COMMENTS_ROOT);
    const assetsRoot = path.resolve(projectRoot, ASSETS_ROOT);
    const commentFilePath = path.join(commentsRoot, `${hash}.json`);
    const assetDir = path.join(assetsRoot, hash);
    if (!validateExistingDirectory(realProjectRoot, path.resolve(projectRoot, '.axhub'))
        || !validateExistingDirectory(realProjectRoot, path.resolve(projectRoot, '.axhub', 'make'))
        || !validateExistingDirectory(realProjectRoot, commentsRoot)
        || !validateExistingDirectory(realProjectRoot, assetsRoot)
        || !validateExistingDirectory(realProjectRoot, assetDir)
        || !validateExistingFile(realProjectRoot, commentFilePath)) {
        return null;
    }
    return {
        documentPath: normalized,
        documentHash: hash,
        commentFilePath,
        assetDir,
        projectRelativeCommentPath: `${COMMENTS_ROOT.split(path.sep).join('/')}/${hash}.json`,
    };
}
export function resolvePrototypeCommentStorage(projectRoot, targetPath) {
    const normalized = normalizePrototypeCommentTargetPath(targetPath);
    if (!normalized)
        return null;
    let realProjectRoot;
    try {
        realProjectRoot = fs.realpathSync.native(projectRoot);
    }
    catch {
        return null;
    }
    const prototypeId = normalized.slice('prototypes/'.length);
    const prototypesDir = path.resolve(projectRoot, 'src', 'prototypes');
    const prototypeDir = path.resolve(prototypesDir, prototypeId);
    if (!isInside(path.resolve(projectRoot), prototypeDir)
        || !validateExistingDirectory(realProjectRoot, prototypesDir)
        || !validateExistingDirectory(realProjectRoot, prototypeDir)) {
        return null;
    }
    const hash = prototypeCommentHash(normalized);
    const commentsRoot = path.resolve(projectRoot, COMMENTS_ROOT);
    const assetsRoot = path.resolve(projectRoot, ASSETS_ROOT);
    const commentFilePath = path.join(commentsRoot, `${hash}.json`);
    const assetDir = path.join(assetsRoot, hash);
    if (!validateExistingDirectory(realProjectRoot, path.resolve(projectRoot, '.axhub'))
        || !validateExistingDirectory(realProjectRoot, path.resolve(projectRoot, '.axhub', 'make'))
        || !validateExistingDirectory(realProjectRoot, commentsRoot)
        || !validateExistingDirectory(realProjectRoot, assetsRoot)
        || !validateExistingDirectory(realProjectRoot, assetDir)
        || !validateExistingFile(realProjectRoot, commentFilePath)) {
        return null;
    }
    const projectRelativeAssetRoot = `${ASSETS_ROOT.split(path.sep).join('/')}/${hash}`;
    return {
        prototypeId,
        targetPath: normalized,
        prototypeHash: hash,
        prototypeDir,
        commentFilePath,
        assetDir,
        projectRelativeCommentPath: `${COMMENTS_ROOT.split(path.sep).join('/')}/${hash}.json`,
        projectRelativeAssetRoot,
    };
}
