import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { buildPrototypePageSegments } from '../sidebar/prototypePageGroups';
import { pagePrdId, PRD_OVERVIEW_ID, PRD_PROTOTYPE_ID } from '../../../common/pagePrd';
import PagePrdManagement from './PagePrdManagement';
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


describe('unified document management placement', () => {
  const scope = { projectId: 'project', targetPath: 'prototypes/demo' };
  const pages = buildPrototypePageSegments(scope.targetPath, [{ id: 'home', title: '首页' }]);

  it('creates in the overview by default and can insert before a prototype page', async () => {
    const onCreateAt = vi.fn(async () => true);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(PagePrdManagement, {
        scope, pages, records: {}, tree: [documentNode], creating: true,
        onCreateAt, onCancelCreate: vi.fn(), onOpen: vi.fn(), onBind: vi.fn(), renderDocument: () => null,
      }));
    });

    const selects = () => renderer.root.findAllByType('select');
    expect(selects()[0].props.value).toBe(PRD_OVERVIEW_ID);
    expect(renderer.root.findByProps({ 'aria-label': '尚未关联或编写页面 PRD' })).toBeTruthy();
    await act(async () => {
      selects()[0].props.onChange({ target: { value: PRD_PROTOTYPE_ID } });
    });
    await act(async () => {
      selects()[1].props.onChange({ target: { value: pagePrdId('home') } });
    });
    await act(async () => {
      renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });
    });
    expect(onCreateAt).toHaveBeenCalledWith({ parentId: PRD_PROTOTYPE_ID, beforeId: pagePrdId('home') });
  });

  it('moves an independent Markdown before another document in a native folder', async () => {
    const onPlaceDocument = vi.fn(async () => true);
    let renderer!: ReactTestRenderer;
    const folder = { type: 'folder' as const, id: 'folder', title: '文档目录', children: [htmlDocumentNode] };
    await act(async () => {
      renderer = create(React.createElement(PagePrdManagement, {
        scope, pages, records: {}, tree: [documentNode, folder], creating: false,
        onPlaceDocument, onCancelCreate: vi.fn(), onOpen: vi.fn(), onBind: vi.fn(),
        renderDocument: (node, _depth, onPlace) => onPlace ? React.createElement('button', { id: node.id, onClick: onPlace }) : null,
      }));
    });

    await act(async () => {
      renderer.root.findByProps({ id: documentNode.id }).props.onClick();
    });
    await act(async () => {
      renderer.root.findAllByType('select')[0].props.onChange({ target: { value: folder.id } });
    });
    await act(async () => {
      renderer.root.findAllByType('select')[1].props.onChange({ target: { value: htmlDocumentNode.id } });
    });
    await act(async () => {
      renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });
    });
    expect(onPlaceDocument).toHaveBeenCalledWith(documentNode.id, { parentId: folder.id, beforeId: htmlDocumentNode.id });
  });

  it('only shows open and edit buttons for pages that have bound PRD documents', async () => {
    let renderer!: ReactTestRenderer;
    const testPages = buildPrototypePageSegments(scope.targetPath, [
      { id: 'page-unbound', title: '未关联页面' },
      { id: 'page-bound', title: '已关联页面' },
    ]);
    const records = {
      'page-bound': { path: 'docs/bound.md' },
    };

    await act(async () => {
      renderer = create(React.createElement(PagePrdManagement, {
        scope, pages: testPages, records, tree: [], creating: false,
        onCancelCreate: vi.fn(), onOpen: vi.fn(), onBind: vi.fn(),
        renderDocument: () => null,
      }));
    });

    const buttons = renderer.root.findAllByType('button');
    const buttonTexts = buttons.map((b) => b.children.join(''));

    expect(buttonTexts).toEqual(['关联已有文档', '打开', '编辑', '更换关联']);
  });

  it('renders blue folder and monochrome file icons in DocumentRow and PagePrdManagement', async () => {
    let rowRenderer!: ReactTestRenderer;
    await act(async () => {
      rowRenderer = create(React.createElement(DocumentRow, {
        node: { type: 'folder', id: 'f1', title: '目录', children: [documentNode] },
        depth: 0,
        expanded: new Set<string>(['f1']),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
      }));
    });
    // 展开状态的文件夹应包含蓝色图标类名
    const folderSvgs = rowRenderer.root.findAllByType('svg');
    expect(folderSvgs.some((s) => typeof s.props.className === 'string' && s.props.className.includes('fill-blue-500/25'))).toBe(true);

    let docRenderer!: ReactTestRenderer;
    await act(async () => {
      docRenderer = create(React.createElement(DocumentRow, {
        node: documentNode,
        depth: 0,
        expanded: new Set<string>(),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
      }));
    });
    // 普通 markdown 文档渲染单色文件图标
    const docSvgs = docRenderer.root.findAllByType('svg');
    expect(docSvgs.some((s) => typeof s.props.className === 'string' && s.props.className.includes('text-muted-foreground'))).toBe(true);
  });
});
