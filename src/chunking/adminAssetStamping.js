const htmlAssetReferencePattern = /((?:href|src)=["'])(\/(?:assets|images)\/[^"'?#]+|(?:\.\.?\/)+(?:assets|images)\/[^"'?#]+)(?:\?[^"']*)?(["'])/g;
const cssAssetReferencePattern = /((?:url\(["']?))(\/(?:assets|images)\/[^"')#?]+|(?:\.\.?\/)+(?:assets|images)\/[^"')#?]+)(?:\?[^"')]*)?((?:["']?\)))/g;
export function stampAdminAssetUrlsForContent(content, buildVersion, extension) {
    if (extension === '.html') {
        return content.replace(htmlAssetReferencePattern, `$1$2?v=${buildVersion}$3`);
    }
    if (extension === '.css') {
        return content.replace(cssAssetReferencePattern, (_, prefix, assetPath, suffix) => {
            if (assetPath.startsWith('http://')
                || assetPath.startsWith('https://')
                || assetPath.startsWith('//')
                || assetPath.includes('?v=')) {
                return `${prefix}${assetPath}${suffix}`;
            }
            return `${prefix}${assetPath}?v=${buildVersion}${suffix}`;
        });
    }
    return content;
}
