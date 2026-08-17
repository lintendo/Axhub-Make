export const MAIN_IDE_FILE_PROTOCOL_SCHEMES = {
    cursor: ['cursor'],
    trae: ['trae'],
    vscode: ['vscode', 'vscode-insiders'],
    trae_cn: ['trae-cn'],
    windsurf: ['windsurf'],
    qoder: ['qoder'],
    antigravity: ['antigravity'],
};
export function getIDEFileProtocolSchemes(ide) {
    return MAIN_IDE_FILE_PROTOCOL_SCHEMES[ide] || [];
}
function encodeFileProtocolPath(targetPath) {
    const normalizedPath = targetPath.replace(/\\/g, '/');
    return normalizedPath
        .split('/')
        .map((segment) => {
        if (!segment)
            return segment;
        return /^[a-z]:$/i.test(segment) ? segment : encodeURIComponent(segment);
    })
        .join('/');
}
export function buildIDEFileProtocolUrl(scheme, targetPath) {
    const encodedPath = encodeFileProtocolPath(targetPath);
    return `${scheme}://file${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
}
