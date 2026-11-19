import { buildPagePrdDirectory, type PagePrdRecords } from '../common/pagePrd';
import {
  buildPrototypePageSegments,
  normalizePrototypePageTree,
  type PrototypePageItem,
  type PrototypePageSegment,
} from '../index/components/sidebar/prototypePageGroups';
import type { AnnotationDocumentDirectoryNode } from '../index/types';
import { createFileIcon, createFolderIcon, createPagePrdReaderAdapter } from './pagePrdReader';
import { createPagePrdLayout } from './pagePrdLayout';

type ExportDirectoryNode =
  | { type: 'route'; id: string; title: string; route: string }
  | { type: 'folder'; id: string; title: string; children?: ExportDirectoryNode[]; defaultExpanded?: boolean }
  | { type: 'link'; id: string; title: string; href: string; target?: 'blank' | 'self' }
  | (Omit<AnnotationDocumentDirectoryNode, 'type' | 'children'> & { type: 'markdown' | 'html' });

type RouteInfo = { pages: PrototypePageItem[]; pageTree?: unknown; defaultPageId: string };
type DirectorySource = {
  directory?: { nodes: ExportDirectoryNode[] };
  documents?: { nodes: AnnotationDocumentDirectoryNode[] };
};
type Runtime = { replaceSource(source: DirectorySource): Promise<void> | void };
type DirectoryWindow = Window & {
  __AXHUB_ANNOTATION_SOURCE_DOCUMENT__?: DirectorySource;
  __AXHUB_ANNOTATION_RUNTIME__?: Runtime;
};

const ROUTE_EVENT = 'axhub:prototype-route-info';
const ROUTE_PREFIX = 'make-export:page:';
const BRANCH_PREFIX = 'make-export:branch:';
const GROUP_PREFIX = 'make-export:group:';
const PANEL = '[data-axhub-annotation-comment-target-id="directory-panel"]';
const BUTTON = 'button[data-directory-node-id]';
const TITLE = '.axhub-annotation-directory-node__title';
const CHEVRON = '.axhub-annotation-directory-node__icon';
const CHILDREN = ':scope > .axhub-annotation-directory-children';
const VISUAL = 'data-axhub-export-node-icon';

export function buildExportPageDirectory(segments: readonly PrototypePageSegment[]): ExportDirectoryNode[] {
  return segments.map((segment): ExportDirectoryNode => {
    const children = buildExportPageDirectory(segment.children);
    if (segment.kind === 'group') {
      return { type: 'folder', id: GROUP_PREFIX + segment.key, title: segment.title, children, defaultExpanded: true };
    }
    const { id, title } = segment.page;
    const route = { type: 'route' as const, id: ROUTE_PREFIX + id, route: id, title };
    return children.length
      ? { type: 'folder', id: BRANCH_PREFIX + id, title, children: [route, ...children], defaultExpanded: true }
      : route;
  });
}

function keepNonRouteNodes(nodes: ExportDirectoryNode[]): ExportDirectoryNode[] {
  return nodes.flatMap((node): ExportDirectoryNode[] => {
    if (node.type === 'route') return [];
    if (node.type !== 'folder') return [node];
    const children = keepNonRouteNodes(node.children ?? []);
    return children.length ? [{ ...node, children }] : [];
  });
}

function pageIdFromNode(id: string): string {
  if (id.startsWith(BRANCH_PREFIX)) return id.slice(BRANCH_PREFIX.length);
  return id.startsWith(ROUTE_PREFIX) ? id.slice(ROUTE_PREFIX.length) : '';
}

function configurePageButtons(shadow: ShadowRoot, currentPage: string, records: PagePrdRecords): void {
  const buttons = shadow.querySelector(PANEL)?.querySelectorAll<HTMLButtonElement>(BUTTON);
  if (!buttons) return;
  for (const button of buttons) {
    const id = button.dataset.directoryNodeId ?? '';
    const pageId = pageIdFromNode(id);
    const group = id.startsWith(GROUP_PREFIX);
    const branch = id.startsWith(BRANCH_PREFIX);
    if (!group && !pageId) continue;
    const wrapper = button.parentElement;
    if (!wrapper) continue;
    if (id.startsWith(ROUTE_PREFIX) && wrapper.parentElement?.previousElementSibling
      ?.getAttribute('data-directory-node-id') === BRANCH_PREFIX + pageId) {
      wrapper.hidden = true;
      continue;
    }
    const expanded = Boolean(wrapper.querySelector(CHILDREN));
    const icon = button.querySelector<SVGSVGElement>(`[${VISUAL}]`);
    if (!icon || (group && icon.dataset.expanded !== String(expanded))) {
      const nextIcon = group ? createFolderIcon(expanded) : createFileIcon();
      nextIcon.setAttribute(VISUAL, '');
      nextIcon.dataset.expanded = String(expanded);
      if (icon) icon.replaceWith(nextIcon);
      else button.insertBefore(nextIcon, button.querySelector(TITLE));
    }
    if (group || branch) button.setAttribute('aria-expanded', String(expanded));
    else {
      const chevron = button.querySelector<HTMLElement>(CHEVRON);
      if (chevron) chevron.style.visibility = 'hidden';
    }
    if (pageId) {
      const active = pageId === currentPage;
      button.classList.toggle('axhub-annotation-directory-node--active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      if (records[pageId] && !button.querySelector('[data-axhub-export-prd-dot]')) {
        const dot = document.createElement('span');
        dot.setAttribute('data-axhub-export-prd-dot', '');
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', '已关联页面需求');
        dot.title = '已关联页面需求';
        dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#F7A800;flex:none';
        button.append(dot);
      }
    }
  }
}

export function installExportPageDirectories(targetPath: string, records: PagePrdRecords): void {
  const annotationWindow = window as DirectoryWindow;
  let route: RouteInfo | undefined;
  let projectedSource: DirectorySource | undefined;
  let baseSource: DirectorySource | undefined;
  let projectedRoute: RouteInfo | undefined;
  let sourceInFlight = false;
  let shadow: ShadowRoot | undefined;
  const folderChoices = new Map<string, boolean>();
  const restoringFolders = new WeakSet<HTMLButtonElement>();

  const getCurrentPageId = () => {
    const hashPage = new URLSearchParams(window.location.hash.slice(1)).get('page')?.trim();
    const queryPage = new URLSearchParams(window.location.search).get('page')?.trim();
    return [hashPage, queryPage].find((id) => id && /^[a-z0-9-]+$/u.test(id)) ?? route?.defaultPageId ?? '';
  };
  const navigate = (pageId: string) => { window.location.hash = `page=${pageId}`; };
  const reader = createPagePrdReaderAdapter({
    navigate,
    getCurrentPageId,
    getMakeOrigin: () => '',
    directoryLabel: '需求目录',
  });
  const layout = createPagePrdLayout(reader.openCurrent);

  function onPageDirectoryClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(BUTTON);
    if (!button?.closest(PANEL)) return;
    const id = button.dataset.directoryNodeId ?? '';
    const togglesFolder = id.startsWith(GROUP_PREFIX)
      || (id.startsWith(BRANCH_PREFIX) && target.closest(CHEVRON));
    if (togglesFolder) {
      if (!restoringFolders.has(button)) {
        folderChoices.set(id, !button.parentElement?.querySelector(CHILDREN));
      }
      return;
    }
    const pageId = pageIdFromNode(id);
    if (!pageId) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(pageId);
  }

  function restoreFolderChoices(root: ShadowRoot): void {
    const folders = root.querySelector(PANEL)?.querySelectorAll<HTMLButtonElement>(`${BUTTON}[aria-expanded]`);
    for (const button of folders ?? []) {
      const expected = folderChoices.get(button.dataset.directoryNodeId ?? '');
      if (expected === undefined || expected === (button.getAttribute('aria-expanded') === 'true')) {
        restoringFolders.delete(button);
      } else if (!restoringFolders.has(button)) {
        // The native tree reapplies its defaults on every page change.
        const toggle = button.querySelector<HTMLElement>(CHEVRON);
        if (toggle) {
          restoringFolders.add(button);
          toggle.click();
        }
      }
    }
  }

  function onPageDirectoryKey(event: Event): void {
    const { key, target } = event as KeyboardEvent;
    if (!(target instanceof Element) || (key !== 'ArrowLeft' && key !== 'ArrowRight')) return;
    const button = target.closest<HTMLButtonElement>(BUTTON);
    if (!button?.closest(PANEL) || !button.dataset.directoryNodeId?.startsWith(BRANCH_PREFIX)) return;
    event.preventDefault();
    if ((button.getAttribute('aria-expanded') === 'true') === (key === 'ArrowRight')) return;
    button.querySelector(CHEVRON)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  const panelObserver = new MutationObserver(() => {
    if (shadow) {
      layout.sync(shadow);
      configurePageButtons(shadow, getCurrentPageId(), records);
      restoreFolderChoices(shadow);
    }
  });

  function sync(): void {
    const activeRoute = route;
    if (!activeRoute) return;
    const root = document.getElementById('__axhub_annotation_host__')?.shadowRoot;
    if (root && root !== shadow) {
      panelObserver.disconnect();
      shadow?.removeEventListener('click', onPageDirectoryClick, true);
      shadow?.removeEventListener('keydown', onPageDirectoryKey, true);
      shadow = root;
      shadow.addEventListener('click', onPageDirectoryClick, true);
      shadow.addEventListener('keydown', onPageDirectoryKey, true);
      panelObserver.observe(shadow, {
        childList: true,
        subtree: true,
        attributeFilter: ['data-axhub-annotation-comment-target-id', 'data-reader-mode'],
      });
      layout.sync(shadow);
    }
    const mountedSource = annotationWindow.__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
    const runtime = annotationWindow.__AXHUB_ANNOTATION_RUNTIME__;
    if (!runtime || !mountedSource || sourceInFlight) return;
    if (mountedSource === projectedSource && activeRoute === projectedRoute) return;
    if (mountedSource !== projectedSource) baseSource = mountedSource;
    const source = baseSource ?? mountedSource;
    const { pages: routePages, pageTree } = activeRoute;
    const pages = buildPrototypePageSegments(targetPath, routePages, normalizePrototypePageTree(pageTree, routePages));
    const documents = buildPagePrdDirectory({ projectId: '', targetPath, pages }, records, source.documents?.nodes ?? []);
    const entries = documents.entries.map(({ id, pageId, status }) => ({ id, pageId, status }));
    const nodes = [...buildExportPageDirectory(pages), ...keepNonRouteNodes(source.directory?.nodes ?? [])];
    sourceInFlight = true;
    void reader.replaceSource(() => runtime.replaceSource({
      ...source,
      // The native panel unwraps a single outer folder. Keep the first real group visible.
      directory: { nodes: [{ type: 'folder', id: 'make-export:root', title: '页面目录', children: nodes, defaultExpanded: true }] },
      documents: { nodes: documents.nodes },
    })).then(() => {
      projectedSource = annotationWindow.__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
      projectedRoute = activeRoute;
      reader.update(entries);
    }).catch((error: unknown) => {
      console.error('[Axhub] 导出目录初始化失败', error);
    }).finally(() => {
      sourceInFlight = false;
      if (route !== activeRoute) sync();
    });
  }

  const hostObserver = new MutationObserver(sync);
  hostObserver.observe(document.documentElement, { childList: true });
  hostObserver.observe(document.body, { childList: true });
  window.addEventListener(ROUTE_EVENT, (event) => {
    route = (event as CustomEvent<RouteInfo>).detail;
    sync();
  });
  window.addEventListener('hashchange', () => {
    if (shadow) configurePageButtons(shadow, getCurrentPageId(), records);
    reader.refresh();
  });
}
