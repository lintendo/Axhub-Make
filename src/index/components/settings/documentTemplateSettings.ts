import type { DocumentTemplateFormat, DocumentTemplateId } from '../../../common/documentTemplates';
import { buildIndexDeepLinkUrl } from '../../app/index-page/resourceDeepLink';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';

export interface DocumentTemplateSettingsItem {
    id: DocumentTemplateId;
    displayName: string;
    description: string;
    format: DocumentTemplateFormat;
    path: `templates/${string}`;
    exists: boolean;
    contentUrl: string;
    previewUrl: string;
    editUrl: string;
}

export function buildDocumentTemplatesApiUrl(
    projectId: string,
    templateId?: DocumentTemplateId,
    action?: 'restore',
): string {
    const scope = requireProjectScope(projectId);
    const templatePath = templateId ? `/${encodeURIComponent(templateId)}` : '';
    const actionPath = action ? `/${action}` : '';
    return withProjectScope(`/api/document-templates${templatePath}${actionPath}`, scope);
}

export function buildDocumentTemplateOpenUrl(
    template: DocumentTemplateSettingsItem,
    projectId: string,
): string {
    return buildIndexDeepLinkUrl({
        resourceType: 'project-doc',
        resourceId: template.path,
        projectId: requireProjectScope(projectId).projectId,
        collapseSidebar: false,
    });
}
