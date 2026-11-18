import {
  buildPagePrdDirectory,
  PAGE_PRD_CONFIGURE,
  PAGE_PRD_READY,
  PAGE_PRD_SAVED,
  PAGE_PRD_SOURCE_CHANGED,
  pagePrdUrl,
  type PagePrdConfiguration,
  type PagePrdRecords,
} from '../common/pagePrd';
import { normalizeMakeServerOrigin } from '../common/makeServerOrigin';
import type { AnnotationDocumentDirectoryNode } from '../index/types';
import { createPagePrdReaderAdapter } from './pagePrdReader';
import { parseHashPage, parseSearchPage } from '../../client/src/common/useHashPage';

type AnnotationSource = {
  data?: { pageId?: string };
  documents?: { nodes: AnnotationDocumentDirectoryNode[] };
};
type AnnotationRuntime = {
  replaceSource(source: AnnotationSource): Promise<void> | void;
};
type AnnotationBrowser = {
  createAnnotationViewer(config: {
    source: AnnotationSource;
    options: {
      getCurrentPageId(): string;
      onDirectoryRoute(node: { id: string }): void;
      onTargetRoute(context: { pageId: string }): void;
    };
  }): { start(): Promise<void> };
};
type AnnotationWindow = Window & {
  __AXHUB_ANNOTATION_RUNTIME__?: AnnotationRuntime;
  __AXHUB_ANNOTATION_SOURCE_DOCUMENT__?: AnnotationSource;
  AxhubAnnotation?: AnnotationBrowser;
};

type PagePrdPayload = { pages: PagePrdRecords; source: AnnotationSource };

export function installPagePrdRuntimeBridge() {
  if (window.parent === window) return;
  const annotationWindow: AnnotationWindow = window;
  let config: PagePrdConfiguration | undefined;
  let data: PagePrdPayload | undefined;
  let dataRequest = 0;
  let runtimeWork: Promise<void> = Promise.resolve();
  let projectedSource: AnnotationSource | undefined;
  let baseSource: AnnotationSource | undefined;
  let directorySignature = '';
  let pageTreeSignature = '';
  let readerLoad: Promise<void> | undefined;
  let pendingSelection: PagePrdConfiguration['selection'];
  let fallback = false;

  const getPageId = () => parseHashPage(location.hash) ?? parseSearchPage(location.search) ?? config?.defaultPageId ?? 'home';
  const navigate = (pageId: string) => {
    if (!config || pageId === getPageId()) return;
    location.hash = `page=${encodeURIComponent(pageId)}`;
  };
  const adapter = createPagePrdReaderAdapter({
    navigate,
    getCurrentPageId: getPageId,
    getMakeOrigin: () => config?.makeOrigin || '',
    onEditClosed: () => update(),
    onSaved: () => {
      if (config) window.parent.postMessage({ type: PAGE_PRD_SAVED, ...scope(config) }, config.makeOrigin);
      void reload();
    },
  });

  function scope(value: PagePrdConfiguration) {
    return { projectId: value.projectId, targetPath: value.targetPath };
  }

  async function getRuntime(activeConfig: PagePrdConfiguration, source: AnnotationSource) {
    if (annotationWindow.__AXHUB_ANNOTATION_RUNTIME__) return annotationWindow.__AXHUB_ANNOTATION_RUNTIME__;
    if (!readerLoad) {
      readerLoad = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        const url = new URL('/api/prototype-annotation/reader.js', activeConfig.makeOrigin);
        url.searchParams.set('projectId', activeConfig.projectId);
        script.src = url.href;
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); reject(new Error('无法加载原生文档目录')); };
        document.head.append(script);
      }).catch((error) => {
        readerLoad = undefined;
        throw error;
      });
    }
    await readerLoad;
    if (!annotationWindow.__AXHUB_ANNOTATION_RUNTIME__) {
      const viewer = annotationWindow.AxhubAnnotation?.createAnnotationViewer({
        source,
        options: {
          getCurrentPageId: getPageId,
          onDirectoryRoute: (node) => navigate(node.id),
          onTargetRoute: ({ pageId }) => navigate(pageId),
        },
      });
      await viewer?.start();
      fallback = Boolean(viewer);
    }
    return annotationWindow.__AXHUB_ANNOTATION_RUNTIME__;
  }

  function update() {
    runtimeWork = runtimeWork.then(async () => {
      if (!config || !data) return;
      const { source, pages } = data;
      const mounted = annotationWindow.__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
      if (!baseSource || (mounted && mounted !== projectedSource && mounted.documents !== projectedSource?.documents)) {
        baseSource = mounted ?? source;
      }
      // Use saved document metadata but keep the mounted viewer's locators and page routes.
      const ordinary = source.documents?.nodes ?? baseSource.documents?.nodes ?? [];
      const { nodes, entries } = buildPagePrdDirectory(config, pages, ordinary);
      const nextSignature = JSON.stringify(nodes);
      const runtime = await getRuntime(config, source);
      if (runtime && (nextSignature !== directorySignature
        || annotationWindow.__AXHUB_ANNOTATION_SOURCE_DOCUMENT__ !== projectedSource)) {
        const replaced = await adapter.replaceSource(() => runtime.replaceSource({ ...baseSource, documents: { nodes } }));
        if (replaced) {
          projectedSource = annotationWindow.__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
          directorySignature = nextSignature;
        }
      }
      adapter.update(entries);
      if (pendingSelection && runtime) {
        const opened = 'current' in pendingSelection
          ? adapter.openCurrent()
          : adapter.open(pendingSelection.id, pendingSelection.edit);
        if (opened) pendingSelection = undefined;
      }
    }).catch((error: unknown) => console.error('[Axhub] 页面 PRD 目录更新失败', error));
  }

  async function reload() {
    if (!config) return;
    const sequence = ++dataRequest;
    try {
      const response = await fetch(new URL(pagePrdUrl(config), config.makeOrigin), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next: PagePrdPayload = await response.json();
      if (sequence !== dataRequest) return;
      data = next;
      adapter.refreshEditingPage(next.pages);
      if (fallback) baseSource = next.source;
      update();
    } catch (error) {
      console.error('[Axhub] 页面 PRD 加载失败', error);
    }
  }

  window.addEventListener('message', (event: MessageEvent<PagePrdConfiguration>) => {
    if (window.parent === window || event.source !== window.parent) return;
    const next = event.data;
    if (next?.type !== PAGE_PRD_CONFIGURE || normalizeMakeServerOrigin(next.makeOrigin) !== event.origin) return;
    if (!next.projectId || !next.targetPath || !Array.isArray(next.pages)) return;
    const scopeChanged = !config || config.projectId !== next.projectId || config.targetPath !== next.targetPath;
    const nextTreeSignature = JSON.stringify(next.pages);
    const treeChanged = nextTreeSignature !== pageTreeSignature;
    pageTreeSignature = nextTreeSignature;
    config = next;
    if (next.selection || scopeChanged) pendingSelection = next.selection;
    if (scopeChanged) {
      data = undefined;
      baseSource = undefined;
    }
    if (scopeChanged || treeChanged || next.reload || !data) void reload();
    else update();
  });
  window.addEventListener(PAGE_PRD_SOURCE_CHANGED, () => { void reload(); });
  window.addEventListener('hashchange', update);
  // The client loads the Make bootstrap asynchronously, after the iframe's load event.
  window.parent.postMessage({ type: PAGE_PRD_READY }, '*');
}
