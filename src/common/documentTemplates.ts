export type DocumentTemplateId =
  | 'prd'
  | 'prototype-spec-md'
  | 'prototype-spec-html'
  | 'prototype-review'
  | 'ui-review';

export type DocumentTemplateFormat = 'markdown' | 'html';

export interface DocumentTemplateDefinition {
  id: DocumentTemplateId;
  displayName: string;
  description: string;
  format: DocumentTemplateFormat;
  path: `templates/${string}`;
}

export const DOCUMENT_TEMPLATES = [
  {
    id: 'prd',
    displayName: 'PRD 模板',
    description: '用于规划和编写产品需求文档',
    format: 'markdown',
    path: 'templates/prd.md',
  },
  {
    id: 'prototype-spec-md',
    displayName: 'Markdown 规格文档模板',
    description: '用于创建 Markdown 原型规格文档',
    format: 'markdown',
    path: 'templates/prototype-spec.md',
  },
  {
    id: 'prototype-spec-html',
    displayName: 'HTML 规格文档模板',
    description: '用于创建 HTML 原型规格文档',
    format: 'html',
    path: 'templates/prototype-spec.html',
  },
  {
    id: 'prototype-review',
    displayName: '原型评审报告模板',
    description: '用于记录原型业务评审结果',
    format: 'markdown',
    path: 'templates/prototype-review.md',
  },
  {
    id: 'ui-review',
    displayName: 'UI 评审报告模板',
    description: '用于记录原型界面评审结果',
    format: 'markdown',
    path: 'templates/ui-review.md',
  },
] as const satisfies readonly DocumentTemplateDefinition[];

export function getDocumentTemplate(id: unknown): DocumentTemplateDefinition | undefined {
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  return DOCUMENT_TEMPLATES.find((template) => template.id === normalizedId);
}
