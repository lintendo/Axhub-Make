/**
 * Wraps raw source code into a legacy-compatible Axure export code format.
 *
 * Produces an IIFE that:
 * 1. Injects extracted CSS into the document head.
 * 2. Wraps the source in a `UserComponent` IIFE namespace.
 * 3. Bridges the result to `window.Component` so the Axure runtime can consume it.
 *
 * This mirrors the output of the legacy `axhub-make` Vite-based
 * `generateAxureExportCode()` but operates on already-built / raw source
 * instead of invoking a full Vite build.
 */
/**
 * Replace `process.env.NODE_ENV` references with `"production"` to avoid
 * runtime errors in environments that don't define `process`.
 */
function sanitizeProcessEnv(code) {
    return String(code || '').replace(/\bprocess\.env\.NODE_ENV\b/g, '"production"');
}
/**
 * Build the CSS injection IIFE snippet.
 * Returns an empty string when there is no CSS to inject.
 */
function buildCssInjection(cssText) {
    const trimmed = (cssText || '').trim();
    if (!trimmed) {
        return '';
    }
    return `(function() {
  if (typeof document === 'undefined') { return; }
  var style = document.createElement("style");
  style.textContent = ${JSON.stringify(trimmed)};
  document.head.appendChild(style);
})();\n`;
}
/**
 * Build the `Component` / `window.Component` bridge snippet that the Axure
 * runtime expects after evaluating the IIFE.
 */
function buildComponentBridge() {
    return `;var Component = UserComponent && (UserComponent.Component || UserComponent.default || UserComponent);
console.log('[AXHUB_EXPORT_DEBUG] Component bridge 提取结果:', typeof Component, Component && Component.name);
if (typeof window !== 'undefined') {
  window.Component = Component;
}
console.log('[AXHUB_EXPORT_DEBUG] window.Component (最终):', typeof window.Component, window.Component && window.Component.name);
console.log('[AXHUB_EXPORT_DEBUG] ===== 导出代码执行完毕 =====');
`;
}
/**
 * Wrap raw JS source code into a self-executing Axure-compatible bundle.
 *
 * The output is directly consumable by the Axure runtime: it defines
 * `UserComponent` via an IIFE, then bridges `Component` / `window.Component`.
 *
 * @param sourceCode - The raw JS/TS source (typically the built `.js` output).
 * @param options    - Optional CSS injection and future flags.
 * @returns The wrapped, executable JS string.
 */
export function wrapSourceAsAxureExportCode(sourceCode, options = {}) {
    const sanitized = sanitizeProcessEnv(sourceCode);
    const cssBlock = buildCssInjection(options.css || '');
    // The built JS registers its component via `window.__AXHUB_DEFINE_COMPONENT__(Component)`.
    // We need to install a capture hook *before* the code runs, then extract the
    // captured reference into `UserComponent` for the bridge.
    //
    // For raw source that uses `export default` (Vite lib-mode IIFE output),
    // UserComponent would be assigned directly by the outer IIFE return.
    //
    // This wrapper handles both cases.
    const wrapped = `var UserComponent;
console.log('[AXHUB_EXPORT_DEBUG] ===== 导出代码开始执行 =====');
console.log('[AXHUB_EXPORT_DEBUG] window.React:', typeof window.React);
console.log('[AXHUB_EXPORT_DEBUG] window.ReactDOM:', typeof window.ReactDOM);
console.log('[AXHUB_EXPORT_DEBUG] window.__AXHUB_DEFINE_COMPONENT__:', typeof window.__AXHUB_DEFINE_COMPONENT__);
console.log('[AXHUB_EXPORT_DEBUG] window.Component (执行前):', typeof window.Component);
(function() {
  var __capturedComponent__ = null;
  var __origDefine__ = typeof window !== 'undefined' ? window.__AXHUB_DEFINE_COMPONENT__ : undefined;
  console.log('[AXHUB_EXPORT_DEBUG] 原始 __AXHUB_DEFINE_COMPONENT__:', typeof __origDefine__);
  if (typeof window !== 'undefined') {
    window.__AXHUB_DEFINE_COMPONENT__ = function(C) {
      console.log('[AXHUB_EXPORT_DEBUG] __AXHUB_DEFINE_COMPONENT__ 被调用, C:', typeof C, C && C.name);
      __capturedComponent__ = C;
      if (__origDefine__) { __origDefine__(C); }
      return C;
    };
  }
  try {
${sanitized}
    console.log('[AXHUB_EXPORT_DEBUG] 内部代码执行完成');
  } catch(e) {
    console.error('[AXHUB_EXPORT_DEBUG] 内部代码执行出错:', e.message, e.stack);
  }
  console.log('[AXHUB_EXPORT_DEBUG] __capturedComponent__:', typeof __capturedComponent__, __capturedComponent__ && __capturedComponent__.name);
  if (__capturedComponent__) {
    UserComponent = __capturedComponent__;
  }
  if (typeof window !== 'undefined' && __origDefine__ !== undefined) {
    window.__AXHUB_DEFINE_COMPONENT__ = __origDefine__;
  }
})();
console.log('[AXHUB_EXPORT_DEBUG] UserComponent:', typeof UserComponent, UserComponent && UserComponent.name);
`;
    return `${cssBlock}${wrapped}${buildComponentBridge()}`;
}
