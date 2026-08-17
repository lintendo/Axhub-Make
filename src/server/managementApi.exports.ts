import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { createProjectCommunicationStore } from './projectCore/index.ts';

import { wrapSourceAsAxureExportCode } from './axureExportCodeWrap.ts';
import { buildOnDemand, replaceEmbeddedImageAssets } from './onDemandBuild.ts';
import { streamExportHtmlArchive } from './exportHtmlArchive.ts';
import {
  createReviewSubmitInjectionOptions,
  resolvePrototypeIdForReviewSubmit,
} from './reviewLanSubmitConfig.ts';
import {
  analyzeFigmaMakeArtifact,
  buildFigmaMakeExportPrompt,
  buildFigmaMakeProbePayload,
  ensureFigmaMakeAiChat,
  ensureFigmaMakeMeta,
  runFigmaMakePackAndInspect,
} from './exportMakeArtifacts.ts';
import { sendJson, sendText } from './http.ts';
import type { ManagementApiOptions } from './managementApi.ts';

interface SourceBackedExportContext {
  project: {
    id: string;
    root: string;
  };
}

interface SourceBackedExportHandlers {
  resolveProjectContext: (
    req: IncomingMessage,
    res: ServerResponse,
    options: ManagementApiOptions,
    mode: 'explicit-required',
  ) => SourceBackedExportContext | null;
  resolveSourceFileFromMetadata: (context: SourceBackedExportContext, targetPath: string) => string | null;
  getAxureArtifactPaths: (context: SourceBackedExportContext, targetPath: string) => {
    resource: any;
    runtimeBuiltJsPath: string | null;
    runtimeBuiltJsRelativePath: string;
    indexBundlePath: string | null;
  };
  readJsonFile: <T>(filePath: string, fallback: T) => T;
  getDeclaredResourceWriteDir?: (context: SourceBackedExportContext, type: 'media') => string | null;
  sendDisabledCapability: (
    res: ServerResponse,
    status: number,
    payload: {
      code: string;
      error: string;
      projectId?: string;
      projectRoot?: string;
      resourceId?: string;
      path?: string;
      adapterRequired?: boolean;
      sourceRequired?: boolean;
      runtime?: Record<string, unknown>;
      details?: Record<string, unknown>;
    },
  ) => void;
  buildAttachmentContentDisposition: (fileName: string) => string;
}

function createAdapterRequiredPayload(context: SourceBackedExportContext, targetPath: string, capability: string) {
  return {
    error: `${capability} requires project-side export capability or source metadata`,
    code: 'ADAPTER_REQUIRED',
    projectId: context.project.id,
    projectRoot: context.project.root,
    path: targetPath,
    adapterRequired: true,
  };
}

function createBuildArtifactRequiredPayload(
  context: SourceBackedExportContext,
  targetPath: string,
  details: Record<string, unknown> = {},
) {
  return {
    error: 'Runtime build artifact is required to export the runtime bundle',
    code: 'BUILD_ARTIFACT_REQUIRED',
    projectId: context.project.id,
    projectRoot: context.project.root,
    path: targetPath,
    resourceId: String((details as any).resourceId || ''),
    sourceRequired: true,
    adapterRequired: true,
    details,
  };
}

function createSourceMetadataRequiredPayload(
  context: SourceBackedExportContext,
  targetPath: string,
  details: Record<string, unknown> = {},
) {
  return {
    error: 'Source metadata is required to locate a runtime build artifact',
    code: 'SOURCE_METADATA_REQUIRED',
    projectId: context.project.id,
    projectRoot: context.project.root,
    path: targetPath,
    resourceId: String((details as any).resourceId || ''),
    sourceRequired: true,
    adapterRequired: true,
    details,
  };
}

/**
 * The Component bridge snippet that the Axure runtime expects.
 * On-demand build produces `var UserComponent = …` (via Vite lib.name),
 * so we just need to bridge `UserComponent` → `window.Component`.
 */
function buildComponentBridgeSnippet(): string {
  return `
console.log('[AXHUB_EXPORT] ===== 导出代码执行 =====');
console.log('[AXHUB_EXPORT] typeof UserComponent:', typeof UserComponent);
console.log('[AXHUB_EXPORT] UserComponent:', UserComponent);
console.log('[AXHUB_EXPORT] UserComponent && UserComponent.name:', UserComponent && UserComponent.name);
console.log('[AXHUB_EXPORT] typeof React:', typeof React);
console.log('[AXHUB_EXPORT] typeof window:', typeof window);
;var Component = UserComponent && (UserComponent.Component || UserComponent.default || UserComponent);
console.log('[AXHUB_EXPORT] Component 提取结果:', typeof Component, Component && Component.name);
if (typeof window !== 'undefined') {
  window.Component = Component;
  window.UserComponent = UserComponent;
}
console.log('[AXHUB_EXPORT] window.Component:', typeof window.Component);
console.log('[AXHUB_EXPORT] window.UserComponent:', typeof window.UserComponent);
console.log('[AXHUB_EXPORT] ===== 导出代码执行完毕 =====');
`;
}

export async function handleSourceBackedExports(
  req: IncomingMessage,
  res: ServerResponse,
  options: ManagementApiOptions,
  pathname: string,
  url: URL,
  handlers: SourceBackedExportHandlers,
): Promise<boolean> {
  if (pathname !== '/api/export-index-bundle' && pathname !== '/api/axure-export-code' && pathname !== '/api/export-html' && pathname !== '/api/export-make') {
    return false;
  }
  const context = handlers.resolveProjectContext(req, res, options, 'explicit-required');
  if (!context) {
    return true;
  }
  const targetPath = url.searchParams.get('path') || '';
  const includeSource = url.searchParams.get('includeSource') === '1' || url.searchParams.get('includeSource') === 'true';
  const includeImagesParam = url.searchParams.get('includeImages');
  const includeImageAssets = includeImagesParam === null
    || includeImagesParam === '1'
    || includeImagesParam === 'true';
  const axureCodeParams = new URLSearchParams({
    projectId: context.project.id,
    path: targetPath,
  });
  if (includeImagesParam !== null) {
    axureCodeParams.set('includeImages', includeImageAssets ? 'true' : 'false');
  }
  const axureCodePath = `/api/axure-export-code?${axureCodeParams.toString()}`;
  const sourceFile = handlers.resolveSourceFileFromMetadata(context, targetPath);
  const {
    resource,
    runtimeBuiltJsPath,
    runtimeBuiltJsRelativePath,
    indexBundlePath,
  } = handlers.getAxureArtifactPaths(context, targetPath);

  if (pathname === '/api/export-index-bundle' && req.method === 'GET') {
    // On-demand build: always build from source to guarantee freshness.
    if (sourceFile) {
      try {
        const buildResult = await buildOnDemand(context.project.root, sourceFile, { includeImageAssets });
        const entryName = String(resource?.name || resource?.id || path.basename(path.dirname(sourceFile)));
        const cssInjection = buildResult.cssText.trim()
          ? `(function(){if(typeof document==='undefined')return;var s=document.createElement('style');s.textContent=${JSON.stringify(buildResult.cssText)};document.head.appendChild(s)})();\n`
          : '';
        const axureCode = `${cssInjection}${buildResult.jsCode}${buildComponentBridgeSnippet()}`;
        sendJson(res, {
          entry: {
            name: entryName,
            group: targetPath.split('/')[0] || 'prototypes',
            displayName: String(resource?.title || resource?.name || resource?.id || entryName),
            code: buildResult.jsCode,
            axureCode,
            axureCodePath,
          },
          meta: {
            version: 1,
            exportedAt: new Date().toISOString(),
            source: 'on-demand-build',
          },
          projectId: context.project.id,
        });
      } catch (buildError: any) {
        sendJson(res, {
          error: `On-demand build failed: ${buildError?.message || 'unknown error'}`,
          code: 'BUILD_FAILED',
          projectId: context.project.id,
          projectRoot: context.project.root,
          path: targetPath,
        }, { status: 500 });
      }
      return true;
    }
    // Fallback: pre-built artifact (when source is not available, e.g. third-party project)
    if (runtimeBuiltJsPath) {
      const rawBuiltCode = fs.readFileSync(runtimeBuiltJsPath, 'utf8');
      const builtCode = includeImageAssets ? rawBuiltCode : replaceEmbeddedImageAssets(rawBuiltCode);
      const axureCode = wrapSourceAsAxureExportCode(builtCode);
      sendJson(res, {
        entry: {
          name: String(resource?.name || resource?.id || path.basename(path.dirname(runtimeBuiltJsPath))),
          group: targetPath.split('/')[0] || 'prototypes',
          displayName: String(resource?.title || resource?.name || resource?.id || path.basename(path.dirname(runtimeBuiltJsPath))),
          code: builtCode,
          axureCode,
          axureCodePath,
        },
        meta: {
          version: 1,
          exportedAt: new Date().toISOString(),
          source: 'runtime-built-js',
        },
        projectId: context.project.id,
      });
      return true;
    }
    const missingArtifactDetails = {
      resourceId: String(resource?.id || resource?.name || ''),
      builtJsPath: runtimeBuiltJsRelativePath || undefined,
    };
    handlers.sendDisabledCapability(res, 424, (
      runtimeBuiltJsRelativePath
        ? createBuildArtifactRequiredPayload(context, targetPath, missingArtifactDetails)
        : createSourceMetadataRequiredPayload(context, targetPath, missingArtifactDetails)
    ));
    return true;
  }

  if (pathname === '/api/axure-export-code' && req.method === 'GET') {
    // On-demand build from source (always fresh).
    if (sourceFile) {
      try {
        const buildResult = await buildOnDemand(context.project.root, sourceFile, { includeImageAssets });
        const cssInjection = buildResult.cssText.trim()
          ? `(function(){if(typeof document==='undefined')return;var s=document.createElement('style');s.textContent=${JSON.stringify(buildResult.cssText)};document.head.appendChild(s)})();\n`
          : '';
        const executableCode = `${cssInjection}${buildResult.jsCode}${buildComponentBridgeSnippet()}`;
        sendText(res, executableCode, 'text/javascript; charset=utf-8');
      } catch (buildError: any) {
        sendJson(res, {
          error: `On-demand build failed: ${buildError?.message || 'unknown error'}`,
          code: 'BUILD_FAILED',
          projectId: context.project.id,
          projectRoot: context.project.root,
          path: targetPath,
        }, { status: 500 });
      }
      return true;
    }
    // Fallback: pre-built artifact
    if (runtimeBuiltJsPath) {
      const rawBuiltCode = fs.readFileSync(runtimeBuiltJsPath, 'utf8');
      const builtCode = includeImageAssets ? rawBuiltCode : replaceEmbeddedImageAssets(rawBuiltCode);
      const executableCode = wrapSourceAsAxureExportCode(builtCode);
      sendText(res, executableCode, 'text/javascript; charset=utf-8');
      return true;
    }
    // No source available.
    handlers.sendDisabledCapability(res, 424, {
      error: 'Source metadata is required to build Axure export code',
      code: 'SOURCE_METADATA_REQUIRED',
      projectId: context.project.id,
      projectRoot: context.project.root,
      path: targetPath,
      sourceRequired: true,
    });
    return true;
  }

  if (pathname === '/api/export-make' && (req.method === 'GET' || req.method === 'POST')) {
    const snapshot = analyzeFigmaMakeArtifact({
      projectRoot: context.project.root,
      rawPath: targetPath,
      resource,
      sourceFile,
    });
    const prompt = () => buildFigmaMakeExportPrompt(snapshot);

    if (!sourceFile && !snapshot.hasCanvasFig) {
      handlers.sendDisabledCapability(res, 424, createAdapterRequiredPayload(context, targetPath, 'Figma Make export'));
      return true;
    }

    if (url.searchParams.get('probe') === '1') {
      sendJson(res, buildFigmaMakeProbePayload(snapshot));
      return true;
    }

    if (url.searchParams.get('prompt') === '1') {
      sendJson(res, {
        ok: true,
        path: snapshot.path,
        hasMakeAssets: snapshot.hasMakeAssets,
        fileName: snapshot.fileName,
        hasDriftRisk: snapshot.hasDriftRisk,
        driftReasons: snapshot.driftReasons,
        prompt: prompt(),
      });
      return true;
    }

    if (!snapshot.hasCanvasFig) {
      sendJson(res, {
        error: '当前页面尚未生成 .fig 导出所需资产，请先复制 Prompt 让 AI 补齐。',
        code: 'FIGMA_MAKE_ASSETS_REQUIRED',
        projectId: context.project.id,
        projectRoot: context.project.root,
        path: targetPath,
        hasMakeAssets: false,
        fileName: snapshot.fileName,
        hasDriftRisk: snapshot.hasDriftRisk,
        driftReasons: snapshot.driftReasons,
        prompt: prompt(),
      }, { status: 409 });
      return true;
    }

    if (snapshot.hasDriftRisk) {
      sendJson(res, {
        error: '检测到当前页面与 Figma 导出壳子可能未同步，请先按 Prompt 同步后再导出 .fig。',
        code: 'FIGMA_MAKE_DRIFT_RISK',
        projectId: context.project.id,
        projectRoot: context.project.root,
        path: targetPath,
        hasMakeAssets: true,
        fileName: snapshot.fileName,
        hasDriftRisk: true,
        driftReasons: snapshot.driftReasons,
        prompt: prompt(),
      }, { status: 409 });
      return true;
    }

    try {
      runFigmaMakePackAndInspect(context.project.root, snapshot);
      const meta = ensureFigmaMakeMeta(snapshot);
      ensureFigmaMakeAiChat(snapshot);
      const rawFileName = typeof meta.file_name === 'string' && meta.file_name.trim()
        ? meta.file_name.trim()
        : snapshot.fileName;
      const downloadFileName = rawFileName.endsWith('.fig') ? rawFileName : `${rawFileName}.fig`;

      const communicationStore = createProjectCommunicationStore(context.project.root);
      communicationStore.ensureDirectories();
      communicationStore.appendExportRecord({
        projectId: context.project.id,
        resourceId: snapshot.resourceId,
        resourceType: String(targetPath.split('/')[0] || 'prototype').replace(/s$/u, '') || 'prototype',
        operationType: 'make.export',
        status: 'success',
        metadata: {
          path: targetPath,
          fileName: downloadFileName,
          canvasFigPath: path.relative(context.project.root, snapshot.canvasFigPath).split(path.sep).join('/'),
        },
      });

      res.statusCode = 200;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', handlers.buildAttachmentContentDisposition(downloadFileName));
      fs.createReadStream(snapshot.canvasFigPath).pipe(res);
      return true;
    } catch (error: any) {
      const communicationStore = createProjectCommunicationStore(context.project.root);
      communicationStore.ensureDirectories();
      communicationStore.appendExportRecord({
        projectId: context.project.id,
        resourceId: snapshot.resourceId,
        resourceType: String(targetPath.split('/')[0] || 'prototype').replace(/s$/u, '') || 'prototype',
        operationType: 'make.export',
        status: 'failed',
        errorMessage: error?.message || 'Export Make failed',
        metadata: {
          path: targetPath,
        },
      });
      sendJson(res, { error: error?.message || 'Export Make failed' }, { status: 500 });
      return true;
    }
  }

  if (pathname === '/api/export-html' && (req.method === 'GET' || req.method === 'POST')) {
    if (!targetPath) {
      sendJson(res, { error: '缺少 path 参数' }, { status: 400 });
      return true;
    }

    // When source is available, perform actual HTML export
    if (sourceFile) {
      const communicationStore = createProjectCommunicationStore(context.project.root);
      communicationStore.ensureDirectories();
      const resourceId = String(resource?.id || resource?.name || targetPath);
      const resourceType = String(targetPath.split('/')[0] || 'prototype').replace(/s$/u, '') || 'prototype';
      const reviewSubmitPrototypeId = resolvePrototypeIdForReviewSubmit({
        resource,
        targetPath,
        sourceFile,
      });

      try {
        await streamExportHtmlArchive(res, {
          projectRoot: context.project.root,
          sourceFile,
          entryName: String(resource?.name || resource?.id || path.basename(path.dirname(sourceFile))),
          displayName: String(resource?.title || resource?.name || resource?.id || path.basename(path.dirname(sourceFile))),
          group: targetPath.split('/')[0] || 'prototypes',
          includeSource,
          mediaRoot: handlers.getDeclaredResourceWriteDir?.(context, 'media') || undefined,
          reviewSubmit: reviewSubmitPrototypeId
            ? createReviewSubmitInjectionOptions({
              projectRoot: context.project.root,
              projectId: context.project.id,
              prototypeId: reviewSubmitPrototypeId,
              makeOrigin: options.origin,
            })
            : undefined,
        }, handlers.buildAttachmentContentDisposition);

        communicationStore.appendExportRecord({
          projectId: context.project.id,
          resourceId,
          resourceType,
          operationType: 'export-html',
          status: 'success',
          metadata: {
            path: targetPath,
            ...(includeSource ? { includeSource: true } : {}),
          },
        });
      } catch (error: any) {
        communicationStore.appendExportRecord({
          projectId: context.project.id,
          resourceId,
          resourceType,
          operationType: 'export-html',
          status: 'failed',
          errorMessage: error?.message || 'Export HTML failed',
          metadata: { path: targetPath },
        });
        if (!res.headersSent) {
          sendJson(res, { error: error?.message || '导出 HTML 失败' }, { status: 500 });
        }
      }
      return true;
    }

    // Fallback: no source available
    const operationType = pathname.slice('/api/'.length);
    const communicationStore = createProjectCommunicationStore(context.project.root);
    communicationStore.ensureDirectories();
    communicationStore.appendExportRecord({
      projectId: context.project.id,
      resourceId: String(resource?.id || resource?.name || targetPath || operationType),
      resourceType: String(targetPath.split('/')[0] || 'prototype').replace(/s$/u, '') || 'prototype',
      operationType,
      status: 'pending',
      metadata: {
        path: targetPath,
        adapterRequired: true,
      },
    });
    handlers.sendDisabledCapability(res, 424, createAdapterRequiredPayload(context, targetPath, pathname.slice('/api/'.length)));
    return true;
  }

  return false;
}

export function handleUnavailableManagement(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  sendDisabledCapability: SourceBackedExportHandlers['sendDisabledCapability'],
): boolean {
  const exportRoutes = new Set([
    '/api/export-index-bundle',
    '/api/axure-export-code',
    '/api/export-html',
    '/api/export-make',
  ]);
  if (exportRoutes.has(pathname) && (req.method === 'GET' || req.method === 'POST')) {
    sendDisabledCapability(res, 501, {
      error: 'This make-server route requires client runtime capability or source metadata',
      code: 'MAKE_SERVER_CAPABILITY_UNAVAILABLE',
      adapterRequired: true,
      runtime: { available: false },
    });
    return true;
  }
  return false;
}
