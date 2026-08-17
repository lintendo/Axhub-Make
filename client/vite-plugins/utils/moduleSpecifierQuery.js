function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function shouldSkipModuleSpecifier(specifier, key, value) {
    const pathOnly = specifier.split(/[?#]/u)[0] || specifier;
    return !value
        || !specifier.startsWith('/')
        || pathOnly === '/@react-refresh'
        || pathOnly === '/@vite/client'
        || new RegExp(`[?&]${escapeRegExp(key)}=`).test(specifier);
}
export function rewriteModuleSpecifiersInCode(code, rewriteSpecifier) {
    return code
        .replace(/(\bfrom\s*["'])([^"']+)(["'])/gu, (_match, prefix, specifier, suffix) => `${prefix}${rewriteSpecifier(specifier)}${suffix}`)
        .replace(/(\bimport\s*["'])([^"']+)(["'])/gu, (_match, prefix, specifier, suffix) => `${prefix}${rewriteSpecifier(specifier)}${suffix}`)
        .replace(/(\bimport\s*\(\s*["'])([^"']+)(["']\s*\))/gu, (_match, prefix, specifier, suffix) => `${prefix}${rewriteSpecifier(specifier)}${suffix}`);
}
export function appendSearchParamToModuleSpecifier(specifier, key, value) {
    if (shouldSkipModuleSpecifier(specifier, key, value)) {
        return specifier;
    }
    const hashIndex = specifier.indexOf('#');
    const withoutHash = hashIndex >= 0 ? specifier.slice(0, hashIndex) : specifier;
    const hash = hashIndex >= 0 ? specifier.slice(hashIndex) : '';
    const separator = withoutHash.includes('?') ? '&' : '?';
    return `${withoutHash}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
}
export function appendSearchParamsToModuleSpecifier(specifier, params) {
    return params.reduce((nextSpecifier, param) => appendSearchParamToModuleSpecifier(nextSpecifier, param.key, param.value), specifier);
}
export function appendSearchParamToModuleSpecifiersInCode(code, key, value) {
    if (!value) {
        return code;
    }
    return rewriteModuleSpecifiersInCode(code, (specifier) => appendSearchParamToModuleSpecifier(specifier, key, value));
}
export function appendSearchParamsToModuleSpecifiersInCode(code, params) {
    const activeParams = params.filter((param) => param.value);
    if (activeParams.length === 0) {
        return code;
    }
    return rewriteModuleSpecifiersInCode(code, (specifier) => appendSearchParamsToModuleSpecifier(specifier, activeParams));
}
export function appendProjectIdToModuleSpecifiersInCode(code, projectId) {
    return appendSearchParamToModuleSpecifiersInCode(code, 'projectId', projectId);
}
