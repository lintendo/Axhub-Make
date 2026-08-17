import { sendJson } from './http.ts';
import { backfillMakeClientResourcePreviewLinks } from './makeClientRuntimeLinks.ts';
function prototypeResourceToEntry(projectId, resource) {
    const clientUrl = resource.clientUrl || '';
    return {
        name: resource.id,
        displayName: resource.title || resource.name || resource.id,
        specUrl: '',
        jsUrl: '',
        previewUrl: clientUrl,
        clientUrl,
        filePath: resource.filePath,
        absoluteFilePath: resource.absoluteFilePath,
        specFilePath: resource.specFilePath,
        artifacts: resource.artifacts,
        pages: resource.pages,
        defaultPageId: resource.defaultPageId,
        projectId,
        resourceId: resource.id,
        previewDisabled: resource.previewDisabled === true || !clientUrl,
        ...(resource.placeholder === true ? { placeholder: true } : {}),
        ...(resource.placeholderGuide ? { placeholderGuide: resource.placeholderGuide } : {}),
        ...(resource.generationStatus ? { generationStatus: resource.generationStatus } : {}),
    };
}
function projectMetadataToEntries(projectId, metadata) {
    return {
        components: [],
        prototypes: metadata.resources.prototypes.map((resource) => prototypeResourceToEntry(projectId, resource)),
    };
}
export function handleEntriesCompatibilityApi(req, res, options, context, pathname) {
    if (pathname !== '/api/entries.json') {
        return false;
    }
    const metadata = backfillMakeClientResourcePreviewLinks(context.metadata, context.project.root, options.runtimeOrigin, req);
    sendJson(res, projectMetadataToEntries(context.project.id, metadata));
    return true;
}
