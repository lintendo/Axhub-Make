/**
 * On-demand Vite build for Axure export.
 *
 * Mirrors the legacy `axhub-make` `generateAxureExportCode()` approach:
 * runs a full Vite lib-mode build in memory (`write: false`) for a single
 * prototype entry, producing a self-contained IIFE bundle with:
 *   - `lib.name = 'UserComponent'`
 *   - React / ReactDOM as external globals
 *   - CSS extracted separately for injection
 *
 * This guarantees the exported code always reflects the latest source,
 * without requiring a prior `pnpm build` step.
 */
export interface OnDemandBuildResult {
    /** The IIFE JS code with `var UserComponent = …` */
    jsCode: string;
    /** Extracted CSS text (empty string if none) */
    cssText: string;
    /** Build-time facts used by publishing integrations. */
    metadata: {
        usesAnnotationRuntime: boolean;
    };
}
export interface OnDemandBuildOptions {
    includeImageAssets?: boolean;
}
export declare function replaceEmbeddedImageAssets(source: string): string;
declare function getPackageExport<T = any>(module: any, exportName: string, packageName: string): T;
declare function getDefaultExport<T = any>(module: any, packageName: string): T;
declare function isAnnotationRuntimeModule(moduleId: string): boolean;
/**
 * Build a single prototype entry on-demand and return the IIFE JS + CSS.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param entryFilePath - Absolute path to the entry file (e.g. `src/prototypes/express-home/index.tsx`).
 */
export declare function buildOnDemand(projectRoot: string, entryFilePath: string, options?: OnDemandBuildOptions): Promise<OnDemandBuildResult>;
export declare const __onDemandBuildTestUtils: {
    getPackageExport: typeof getPackageExport;
    getDefaultExport: typeof getDefaultExport;
    isAnnotationRuntimeModule: typeof isAnnotationRuntimeModule;
    replaceEmbeddedImageAssets: typeof replaceEmbeddedImageAssets;
};
export {};
