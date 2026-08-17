import { readJsonBody, sendJson } from './http.ts';
import { getAxureApiPreviewFromFile, resolveCodeReviewFilePath, reviewFile } from './codeReview.ts';
export function handleCodeReviewApi(req, res, context, pathname, handlers) {
    if ((pathname !== '/api/code-review' && pathname !== '/api/axure-api-preview') || req.method !== 'POST') {
        return false;
    }
    readJsonBody(req).then((body) => {
        const targetPath = String(body?.path || '').trim();
        if (!targetPath) {
            sendJson(res, { error: 'Missing path parameter' }, { status: 400 });
            return;
        }
        const sourceFile = handlers.resolveSourceFileFromMetadata(context, targetPath);
        const filePath = sourceFile || resolveCodeReviewFilePath(context.project.root, targetPath);
        if (!filePath) {
            sendJson(res, { error: 'Invalid path' }, { status: 403 });
            return;
        }
        const matchingResource = handlers.findProjectResourceByPath(context.metadata, targetPath);
        const hasResourceWithoutSource = Boolean(matchingResource && !sourceFile);
        if (hasResourceWithoutSource) {
            handlers.sendDisabledCapability(res, 424, {
                error: 'Source metadata is required to inspect source code for this resource',
                code: 'SOURCE_METADATA_REQUIRED',
                projectId: context.project.id,
                projectRoot: context.project.root,
                path: targetPath,
                sourceRequired: true,
            });
            return;
        }
        if (pathname === '/api/code-review') {
            const result = reviewFile(filePath, {
                enforceComponentExportName: body?.enforceComponentExportName === true,
                mode: body?.mode === 'axure-export' ? 'axure-export' : 'default',
            });
            sendJson(res, result);
            return;
        }
        sendJson(res, getAxureApiPreviewFromFile(filePath));
    }).catch((error) => sendJson(res, { error: error.message }, { status: 400 }));
    return true;
}
