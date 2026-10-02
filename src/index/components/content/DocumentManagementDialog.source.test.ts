import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readDialogSource() {
  return readFileSync(resolve(__dirname, './DocumentManagementDialog.tsx'), 'utf8');
}

describe('DocumentManagementDialog', () => {
  it('supports adding, editing, deleting, and moving documents in the annotation tree', () => {
    const source = readDialogSource();

    expect(source).toContain('> 新建');
    expect(source).toContain('onCreateDocument');
    expect(source).toContain('onEditDocument');
    expect(source).toContain('onRename');
    expect(source).toContain('renameDocumentTitle');
    expect(source).toContain('onDeleteDocument');
    expect(source).toContain('onTreePersist');
    expect(source).toContain('draggable');
    expect(source).toContain('onDrop');
  });

  it('keeps document operations in hover actions and groups the two primary actions at the top', () => {
    const source = readDialogSource();

    expect(source).toContain('group-hover:opacity-100');
    expect(source).toContain('重命名目录标题');
    expect(source).toContain('保存名称');
    expect(source).toContain('取消重命名');
    expect(source).toContain('onEscapeKeyDown');
    expect(source).toContain("getAttribute('aria-label') === '文档名称'");
    expect(source).toContain('<TooltipProvider');
    expect(source).toContain('> 新建');
    expect(source).toContain('AI 管理文档');
    expect(source).toContain('onCopyPrompt');
    expect(source).not.toContain('共 {countDocuments(visibleTree)} 个文档');
    expect(source).not.toContain('使用需求标注功能');
    expect(source).not.toContain('复制提示词');
    expect(source).not.toContain('border-b pb-3');
    expect(source).not.toContain('border-t pt-3');
  });

  it('uses the annotation source documents tree instead of the Make sidebar resource tree', () => {
    const source = readDialogSource();

    expect(source).toContain('AnnotationDocumentDirectoryNode');
    expect(source).toContain('markdownPath');
    expect(source).toContain('htmlPath');
    expect(source).toContain("node.type === 'html' ? '批注' : '编辑文档'");
    expect(source).not.toContain("dragged.type !== 'markdown'");
    expect(source).not.toContain('SidebarTreeNode');
    expect(source).not.toContain('docsItems');
    expect(source).not.toContain('sidebarTrees');
  });

  it('matches the annotation runtime by flattening a single transparent root folder', () => {
    const source = readDialogSource();

    expect(source).toContain('function resolveVisibleDocumentTree');
    expect(source).toContain("nodes.length === 1 && onlyNode?.type === 'folder' && onlyNode.children?.length");
    expect(source).toContain('function restoreDocumentTreeRoot');
    expect(source).toContain('resolveDefaultCreateFolderId');
  });
});
