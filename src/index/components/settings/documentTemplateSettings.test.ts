import { describe, expect, it } from 'vitest';

import {
  buildDocumentTemplateOpenUrl,
  buildDocumentTemplatesApiUrl,
  type DocumentTemplateSettingsItem,
} from './documentTemplateSettings';

const markdownTemplate: DocumentTemplateSettingsItem = {
  id: 'prd',
  displayName: 'PRD 模板',
  description: '产品需求文档',
  format: 'markdown',
  path: 'templates/prd.md',
  exists: true,
  contentUrl: '/api/document-templates/prd?projectId=make-project',
  previewUrl: '/spec-template.html?url=%2Fapi%2Fdocument-templates%2Fprd%3FprojectId%3Dmake-project',
  editUrl: '/spec-template.html?url=%2Fapi%2Fdocument-templates%2Fprd%3FprojectId%3Dmake-project&mode=edit',
};

describe('document template settings URLs', () => {
  it('scopes list and restore requests to the active project', () => {
    expect(buildDocumentTemplatesApiUrl('make-project')).toBe('/api/document-templates?projectId=make-project');
    expect(buildDocumentTemplatesApiUrl('make-project', 'prd', 'restore')).toBe('/api/document-templates/prd/restore?projectId=make-project');
  });

  it('opens the existing editable viewer from the single view link', () => {
    expect(buildDocumentTemplateOpenUrl(markdownTemplate, 'make-project')).toBe(
      'http://localhost/?projectId=make-project&docPath=templates%2Fprd.md',
    );
    expect(buildDocumentTemplateOpenUrl({
      ...markdownTemplate,
      id: 'prototype-spec-html',
      format: 'html',
      path: 'templates/prototype-spec.html',
      contentUrl: '/api/document-templates/prototype-spec-html?projectId=make-project',
      previewUrl: '/api/document-templates/prototype-spec-html?projectId=make-project',
      editUrl: '/api/document-templates/prototype-spec-html?projectId=make-project&mode=edit',
    }, 'make-project')).toBe(
      'http://localhost/?projectId=make-project&docPath=templates%2Fprototype-spec.html',
    );
  });
});
