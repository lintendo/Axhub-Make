import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { FileCode2 } from 'lucide-react';
import { DocumentRow, renameDocumentTitle } from './DocumentManagementDialog';
import type { AnnotationDocumentDirectoryNode } from '../../types';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => React.createElement('span', { role: 'tooltip' }, children),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

const documentNode: AnnotationDocumentDirectoryNode = {
  type: 'markdown',
  id: 'document',
  title: '新文档',
  markdownPath: 'docs/新文档.md',
};

const htmlDocumentNode: AnnotationDocumentDirectoryNode = {
  type: 'html',
  id: 'html-document',
  title: 'HTML 文档',
  htmlPath: 'docs/interactive.html',
};

describe('document management rename', () => {
  it('renames a nested document without changing the source tree', () => {
    const tree: AnnotationDocumentDirectoryNode[] = [{
      type: 'folder',
      id: 'docs',
      title: '文档',
      children: [documentNode],
    }];

    const renamed = renameDocumentTitle(tree, 'document', '  测试一下  ');

    expect(renamed).toEqual([{
      type: 'folder',
      id: 'docs',
      title: '文档',
      children: [{ ...documentNode, title: '测试一下' }],
    }]);
    expect(tree[0].children?.[0].title).toBe('新文档');
  });

  it('shows named tooltips for document icon actions and submits the trimmed title', async () => {
    const onRename = vi.fn();
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(DocumentRow, {
        node: documentNode,
        depth: 0,
        expanded: new Set<string>(),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename,
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }));
    });

    expect(renderer!.root.findAllByProps({ role: 'tooltip' }).map((item) => item.children.join(''))).toEqual([
      '编辑文档',
      '重命名目录标题',
      '删除文档',
    ]);

    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '重命名 新文档' }).props.onClick();
    });
    expect(renderer!.root.findAllByProps({ role: 'tooltip' }).map((item) => item.children.join(''))).toEqual([
      '保存名称',
      '取消重命名',
    ]);

    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '文档名称' }).props.onChange({ target: { value: '  测试一下  ' } });
    });
    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '保存名称' }).props.onClick();
    });

    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledWith(documentNode, '测试一下');
  });

  it('does not submit an empty document title', async () => {
    const onRename = vi.fn();
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(DocumentRow, {
        node: documentNode,
        depth: 0,
        expanded: new Set<string>(),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename,
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }));
    });
    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '重命名 新文档' }).props.onClick();
    });
    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '文档名称' }).props.onChange({ target: { value: '   ' } });
    });
    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '保存名称' }).props.onClick();
    });

    expect(onRename).not.toHaveBeenCalled();
  });

  it('cancels renaming with Escape and restores the original title', async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(DocumentRow, {
        node: documentNode,
        depth: 0,
        expanded: new Set<string>(),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }));
    });
    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': '重命名 新文档' }).props.onClick();
    });
    await act(async () => {
      const input = renderer!.root.findByProps({ 'aria-label': '文档名称' });
      const stopPropagation = vi.fn();
      input.props.onChange({ target: { value: '临时名称' } });
      input.props.onKeyDown({ key: 'Escape', preventDefault: vi.fn(), stopPropagation });
      expect(stopPropagation).toHaveBeenCalledOnce();
    });

    expect(renderer!.root.findByProps({ 'aria-label': '重命名 新文档' })).toBeTruthy();
    expect(renderer!.root.findAllByProps({ 'aria-label': '文档名称' })).toHaveLength(0);
  });

  it('labels an HTML document action as annotation', async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(React.createElement(DocumentRow, {
        node: htmlDocumentNode,
        depth: 0,
        expanded: new Set<string>(),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }));
    });

    expect(renderer!.root.findAllByProps({ role: 'tooltip' }).map((item) => item.children.join(''))).toContain('批注');
  });

  it('uses a code document icon for HTML rows while keeping Markdown on the text icon', async () => {
    let htmlRenderer: ReactTestRenderer;
    let markdownRenderer: ReactTestRenderer;

    await act(async () => {
      htmlRenderer = create(React.createElement(DocumentRow, {
        node: htmlDocumentNode,
        depth: 0,
        expanded: new Set<string>(),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }));
      markdownRenderer = create(React.createElement(DocumentRow, {
        node: documentNode,
        depth: 0,
        expanded: new Set<string>(),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }));
    });

    expect(htmlRenderer!.root.findAllByType(FileCode2)).toHaveLength(1);
    expect(markdownRenderer!.root.findAllByType(FileCode2)).toHaveLength(0);
  });
});
