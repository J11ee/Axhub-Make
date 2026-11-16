import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readContentPanelSource() {
  return readFileSync(resolve(__dirname, './ContentPanel.tsx'), 'utf8');
}

function readNewSidebarSource() {
  return readFileSync(resolve(__dirname, './NewSidebar.tsx'), 'utf8');
}

function readIndexPageSource() {
  return readFileSync(resolve(__dirname, '../../app/IndexPage.tsx'), 'utf8');
}

describe('ContentPanel Header refresh button', () => {
  it('renders the refresh button in header between menu and AI dropdown', () => {
    const source = readContentPanelSource();
    const headerSource = source.slice(
      source.indexOf('<div className="border-b border-border">'),
      source.indexOf('<div className="px-2 pb-2">'),
    );

    expect(headerSource).toContain('刷新数据与画布');
    expect(headerSource).toContain('<RefreshCw');
    expect(headerSource).toContain('animate-spin');
    expect(headerSource).toContain('aria-label="刷新数据与画布"');
    expect(headerSource).toContain('handleRefresh');
    expect(source).toContain("toast.success('数据与画布已刷新');");
  });

  it('wires onRefreshWorkspace from IndexPage to NewSidebar and ContentPanel', () => {
    const indexSource = readIndexPageSource();
    const sidebarSource = readNewSidebarSource();
    const contentSource = readContentPanelSource();

    expect(indexSource).toContain('const handleRefreshWorkspace = useCallback(async () => {');
    expect(indexSource).toContain('workspace.loadData()');
    expect(indexSource).toContain('workspace.reloadDocsItems()');
    expect(indexSource).toContain('workspace.reloadSidebarAssets()');
    expect(indexSource).toContain('workspace.loadSidebarTree(');
    expect(indexSource).toContain('preview.handleRefreshElement()');
    expect(indexSource).toContain('handleRefreshCanvasPrototypeItems()');
    expect(indexSource).toContain('workspace.reloadCanvasItems()');

    expect(sidebarSource).toContain('onRefreshWorkspace,');
    expect(sidebarSource).toContain('onRefreshWorkspace={onRefreshWorkspace}');
    expect(contentSource).toContain('onRefreshWorkspace?: () => void | Promise<void>;');
  });
});

describe('ContentPanel folder icon color enhancements', () => {
  it('uses two-tone amber colors for folder open and closed states', () => {
    const source = readContentPanelSource();

    expect(source).toContain('fill-amber-400/80 text-amber-600 dark:fill-amber-500/30 dark:text-amber-400');
    expect(source).toContain('fill-amber-300/80 text-amber-500 dark:fill-amber-500/20 dark:text-amber-300');
  });
});

describe('ContentPanel click interaction and shortcuts', () => {
  it('supports single click pure selection, double click open/toggle, and triple click rename', () => {
    const source = readContentPanelSource();
    const clickHandlerSource = source.slice(
      source.indexOf('onClick={(e) => {', source.indexOf('const renderTreeNodes =')),
      source.indexOf('onDoubleClick={(e) => {', source.indexOf('const renderTreeNodes =')),
    );

    expect(clickHandlerSource).toContain('setSelectedNodeId(node.id);');
    expect(clickHandlerSource).toContain('if (e.detail === 1)');
    expect(clickHandlerSource).toContain('if (e.detail === 2)');
    expect(clickHandlerSource).toContain('if (e.detail === 3)');
    expect(clickHandlerSource).toContain('toggleFolder(node.id);');
    expect(clickHandlerSource).toContain('onItemClick(item);');
    expect(clickHandlerSource).toContain('startFolderRename(node.id, node.title);');
    expect(clickHandlerSource).toContain('startItemRename(node.id, node.title || item.displayName || item.name);');
  });

  it('supports F2 rename and Tab/Shift+Tab indent/outdent on tree nodes', () => {
    const source = readContentPanelSource();
    const keyDownSource = source.slice(
      source.indexOf('onKeyDown={(e) => {', source.indexOf('const renderTreeNodes =')),
      source.indexOf('onDragStart={(e) => {', source.indexOf('const renderTreeNodes =')),
    );

    expect(keyDownSource).toContain("e.key === 'F2'");
    expect(keyDownSource).toContain("e.key === 'Tab'");
    expect(keyDownSource).toContain('handleIndentNode(node.id)');
    expect(keyDownSource).toContain('handleOutdentNode(node.id)');
    expect(source).toContain('function findNodeLocation');
    expect(source).toContain('handleIndentNode = useCallback');
    expect(source).toContain('handleOutdentNode = useCallback');
  });
});

describe('ContentPanel prototype page interaction and indentation visual alignment', () => {
  it('uses 16px indentation step and whitespace placeholder for leaf page rows', () => {
    const source = readContentPanelSource();
    const pageRowSource = source.slice(
      source.indexOf('const renderPrototypePageRow ='),
      source.indexOf('const renderTreeNodes ='),
    );

    expect(pageRowSource).toContain('paddingLeft={`${8 + depth * 16}px`}');
    expect(pageRowSource).toContain('<span className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />');
    expect(pageRowSource).toContain('setSelectedPageKey(pageRowKey);');
    expect(pageRowSource).toContain('if (e.detail === 2)');
    expect(pageRowSource).toContain('onPrototypePageSelect(item, page.id)');
  });
});
