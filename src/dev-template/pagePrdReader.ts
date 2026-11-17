import type { PagePrdEntry, PagePrdRecords } from '../common/pagePrd';

type DirectoryReaderMode = 'split' | 'full';

type PagePrdReaderEntry = PagePrdEntry;

interface PagePrdReaderOptions {
  navigate(pageId: string): void;
  getCurrentPageId(): string;
  getMakeOrigin(): string;
  onSaved?(): void;
  onEditClosed?(): void;
}

interface AnnotationRuntimeController {
  openDirectoryArticle(
    articleId: string,
    options?: { readerMode?: DirectoryReaderMode; directoryOpen?: boolean },
  ): boolean;
  closeDirectoryArticle(): void;
}

type AnnotationRuntimeWindow = Window & {
  __AXHUB_ANNOTATION_RUNTIME__?: AnnotationRuntimeController;
};

interface PendingNavigation {
  entry: PagePrdReaderEntry;
  followRoute?: boolean;
}

interface ActiveEdit {
  entry: PagePrdReaderEntry;
  iframe: HTMLIFrameElement;
  origin: string;
  returnPath: string;
  readerMode: DirectoryReaderMode;
  dirty?: boolean;
}

const ANNOTATION_HOST_SELECTOR = '#__axhub_annotation_host__';
const READER_SELECTOR = '.axhub-annotation-directory-reader';
const READER_HEADER_SELECTOR = '.axhub-annotation-directory-reader__header';
const READER_BODY_SELECTOR = '.axhub-annotation-directory-reader__body';
const READER_SURFACE_SELECTOR = '.axhub-annotation-directory-reader__surface';
const MARKDOWN_ID_SELECTOR = '[data-axhub-annotation-directory-markdown-id]';
const TREE_NODE_SELECTOR = 'button[data-directory-node-id]';
const FOLDER_TITLE_SELECTOR = '.axhub-annotation-directory-node__title';
const EDIT_BUTTON_ATTRIBUTE = 'data-axhub-page-prd-edit-button';
const EDIT_FRAME_ATTRIBUTE = 'data-axhub-page-prd-frame';
const ORIGINAL_BODY_STYLE_ATTRIBUTE = 'data-axhub-page-prd-original-style';
const ORIGINAL_SURFACE_HIDDEN_ATTRIBUTE = 'data-axhub-page-prd-original-hidden';
const PAGE_PRD_ID_PREFIX = 'make-page-prd:page:';
const PAGE_PRD_FOLDER_PREFIX = 'make-page-prd:branch:';
const CLOSE_BUTTON_LABEL = '关闭文档';
const DOCUMENT_PANEL_SELECTOR = '[data-axhub-annotation-comment-target-id="documents-panel"]';
const DIRECT_ACTION_ATTRIBUTE = 'data-axhub-annotation-direct-action';

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function isOrdinaryEntry(entry: PagePrdReaderEntry): boolean {
  return entry.all === true || !normalizeId(entry.pageId);
}

function readMakeOrigin(options: PagePrdReaderOptions): string | null {
  try {
    const origin = new URL(options.getMakeOrigin(), window.location.origin).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

function readReturnPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getElementTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function readMessageIdentity(data: Record<string, unknown>): string {
  return normalizeId(data.documentId ?? data.articleId ?? data.id);
}

export function createPagePrdReaderAdapter(options: PagePrdReaderOptions) {
  let entries = new Map<string, PagePrdReaderEntry>();
  let shadowRoot: ShadowRoot | null = null;
  let shadowObserver: MutationObserver | null = null;
  let documentObserver: MutationObserver | null = null;
  let syncTimer: number | null = null;
  let activeEdit: ActiveEdit | null = null;
  let pendingNavigation: PendingNavigation | null = null;
  let pendingReaderClose = false;
  let pendingEditId: string | null = null;
  let requestedOpen: { id: string; edit: boolean; attemptedAgainst: string | null } | null = null;
  let pendingRoutePageId: string | null = null;
  let pinnedOrdinaryId: string | null = null;
  let lastFollowKey = '';
  let documentPanelWasOpen = false;
  let reopeningEditedArticle = false;
  let disposed = false;

  const runtime = () => (window as AnnotationRuntimeWindow).__AXHUB_ANNOTATION_RUNTIME__;

  function scheduleSync(): void {
    if (disposed || syncTimer !== null) return;
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      sync();
    }, 0);
  }

  function connectShadowRoot(): void {
    const host = document.querySelector(ANNOTATION_HOST_SELECTOR);
    const nextRoot = host?.shadowRoot ?? null;
    if (nextRoot === shadowRoot) return;

    shadowObserver?.disconnect();
    shadowRoot?.removeEventListener('click', handleShadowClick, true);
    shadowRoot = nextRoot;
    documentPanelWasOpen = false;
    if (!shadowRoot) return;

    shadowRoot.addEventListener('click', handleShadowClick, true);
    shadowObserver = new MutationObserver(scheduleSync);
    shadowObserver.observe(shadowRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-axhub-annotation-directory-markdown-id', 'hidden', 'style'],
    });
  }

  function getReaderBody(): HTMLElement | null {
    return shadowRoot?.querySelector<HTMLElement>(READER_BODY_SELECTOR) ?? null;
  }

  function getReaderMode(): DirectoryReaderMode {
    const mode = shadowRoot?.querySelector<HTMLElement>(READER_SELECTOR)?.dataset.readerMode;
    return mode === 'full' ? 'full' : 'split';
  }

  function getActiveArticleId(): string {
    const body = getReaderBody();
    return normalizeId(body?.querySelector<HTMLElement>(MARKDOWN_ID_SELECTOR)?.dataset.axhubAnnotationDirectoryMarkdownId
      ?? body?.querySelector<HTMLElement>('[data-axhub-annotation-directory-html-id]')?.dataset.axhubAnnotationDirectoryHtmlId);
  }

  function setPinnedEntry(entry: PagePrdReaderEntry | undefined): void {
    pinnedOrdinaryId = entry && isOrdinaryEntry(entry) ? entry.id : null;
  }

  function openNativeArticle(entry: PagePrdReaderEntry, mode: DirectoryReaderMode = 'split'): boolean {
    return runtime()?.openDirectoryArticle(entry.id, { readerMode: mode }) ?? false;
  }

  function findEntryForCurrentPage(): PagePrdReaderEntry | undefined {
    const currentPageId = normalizeId(options.getCurrentPageId());
    if (!currentPageId) return undefined;
    return [...entries.values()].find((entry) => normalizeId(entry.pageId) === currentPageId && !entry.all);
  }

  function findAllEntry(): PagePrdReaderEntry | undefined {
    return [...entries.values()].find((entry) => entry.all === true);
  }

  function navigateToEntry(entry: PagePrdReaderEntry): void {
    if (entry.all === true) return;
    const pageId = normalizeId(entry.pageId);
    if (!pageId || pageId === normalizeId(options.getCurrentPageId())) return;
    options.navigate(pageId);
  }

  function scheduleEntryNavigation(entry: PagePrdReaderEntry): void {
    const pageId = normalizeId(entry.pageId);
    if (!pageId || entry.all === true) return;
    pendingRoutePageId = pageId;
    window.setTimeout(() => {
      navigateToEntry(entry);
    }, 0);
  }

  function editUrl(entry: PagePrdReaderEntry, origin: string, returnPath: string): string | null {
    const contentUrl = normalizeId(entry.contentUrl);
    if (!contentUrl) return null;
    const url = new URL('/spec-template.html', origin);
    url.searchParams.set('url', contentUrl);
    if (entry.pageUrl && entry.pageUrl !== contentUrl) url.searchParams.set('pagePrdUrl', entry.pageUrl);
    url.searchParams.set('embeddedDocument', !isOrdinaryEntry(entry) ? 'page' : 'ordinary');
    url.searchParams.set('documentId', entry.id);
    url.searchParams.set('parentOrigin', window.location.origin);
    if (normalizeId(entry.pageId)) url.searchParams.set('pageId', normalizeId(entry.pageId));
    url.searchParams.set('returnPath', returnPath);
    return url.toString();
  }

  function restoreBodyStyle(body: HTMLElement): void {
    const surface = body.querySelector<HTMLElement>(`:scope > ${READER_SURFACE_SELECTOR}`);
    if (surface?.hasAttribute(ORIGINAL_SURFACE_HIDDEN_ATTRIBUTE)) {
      surface.hidden = surface.getAttribute(ORIGINAL_SURFACE_HIDDEN_ATTRIBUTE) === 'true';
      surface.removeAttribute(ORIGINAL_SURFACE_HIDDEN_ATTRIBUTE);
    }
    body.querySelector<HTMLIFrameElement>(`iframe[${EDIT_FRAME_ATTRIBUTE}="true"]`)?.remove();
    if (!body.hasAttribute(ORIGINAL_BODY_STYLE_ATTRIBUTE)) return;
    const originalStyle = body.getAttribute(ORIGINAL_BODY_STYLE_ATTRIBUTE) ?? '';
    if (originalStyle) body.setAttribute('style', originalStyle);
    else body.removeAttribute('style');
    body.removeAttribute(ORIGINAL_BODY_STYLE_ATTRIBUTE);
  }

  function mountEditButton(header: HTMLElement, entry: PagePrdReaderEntry): void {
    let button = header.querySelector<HTMLButtonElement>(`button[${EDIT_BUTTON_ATTRIBUTE}]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'we-runtime-prop-panel__header-action ant-btn ant-btn-text ant-btn-sm';
      button.setAttribute(DIRECT_ACTION_ATTRIBUTE, 'true');
      button.setAttribute(EDIT_BUTTON_ATTRIBUTE, 'true');
      const closeButton = header.querySelector<HTMLButtonElement>(`button[aria-label="${CLOSE_BUTTON_LABEL}"]`);
      header.insertBefore(button, closeButton);
    }

    button.dataset.documentId = entry.id;
    const editing = activeEdit?.entry.id === entry.id;
    const label = editing ? '完成' : '编辑';
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute('aria-label', editing ? '退出文档编辑' : '编辑需求文档');
    button.title = editing ? '退出文档编辑' : '编辑需求文档';
  }

  function ensureEditMounted(): void {
    const edit = activeEdit;
    if (!edit || !shadowRoot) return;

    const reader = shadowRoot.querySelector<HTMLElement>(READER_SELECTOR);
    const body = getReaderBody();
    if (!reader || !body) {
      if (!reopeningEditedArticle) {
        reopeningEditedArticle = true;
        runtime()?.openDirectoryArticle(edit.entry.id, { readerMode: edit.readerMode });
      }
      return;
    }

    reopeningEditedArticle = false;
    if (!body.hasAttribute(ORIGINAL_BODY_STYLE_ATTRIBUTE)) {
      body.setAttribute(ORIGINAL_BODY_STYLE_ATTRIBUTE, body.getAttribute('style') ?? '');
    }
    if (body.style.position !== 'relative') body.style.position = 'relative';
    body.style.padding = '0';
    body.style.overflow = 'hidden';
    const surface = body.querySelector<HTMLElement>(`:scope > ${READER_SURFACE_SELECTOR}`);
    if (surface) {
      if (!surface.hasAttribute(ORIGINAL_SURFACE_HIDDEN_ATTRIBUTE)) {
        surface.setAttribute(ORIGINAL_SURFACE_HIDDEN_ATTRIBUTE, String(surface.hidden));
      }
      surface.hidden = true;
    }
    if (edit.iframe.parentElement !== body) body.append(edit.iframe);
    const header = shadowRoot.querySelector<HTMLElement>(READER_HEADER_SELECTOR);
    if (header) mountEditButton(header, edit.entry);
  }

  function createEdit(entry: PagePrdReaderEntry): boolean {
    const origin = readMakeOrigin(options);
    const body = getReaderBody();
    if (!origin || !body) return false;
    const returnPath = readReturnPath();
    const src = editUrl(entry, origin, returnPath);
    if (!src) return false;

    const iframe = document.createElement('iframe');
    iframe.title = `编辑：${entry.id}`;
    iframe.src = src;
    iframe.setAttribute(EDIT_FRAME_ATTRIBUTE, 'true');
    iframe.dataset.documentId = entry.id;
    iframe.dataset.pageId = normalizeId(entry.pageId);
    iframe.dataset.makeOrigin = origin;
    iframe.dataset.returnPath = returnPath;
    iframe.dataset.readerMode = 'split';
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
    iframe.style.cssText = 'position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;min-height:0;border:0;background:transparent;';

    activeEdit = {
      entry,
      iframe,
      origin,
      returnPath,
      readerMode: 'split',
    };
    pendingEditId = null;
    pendingNavigation = null;
    pendingReaderClose = false;
    if (getReaderMode() === 'full') openNativeArticle(entry, 'split');
    ensureEditMounted();
    return true;
  }

  function adoptExistingEdit(): void {
    if (activeEdit || !shadowRoot) return;
    const iframe = shadowRoot.querySelector<HTMLIFrameElement>(`iframe[${EDIT_FRAME_ATTRIBUTE}="true"]`);
    if (!iframe) return;
    const id = normalizeId(iframe.dataset.documentId);
    const entry = entries.get(id);
    const origin = readMakeOrigin(options);
    if (!entry || !origin || iframe.dataset.makeOrigin !== origin) return;
    activeEdit = {
      entry,
      iframe,
      origin,
      returnPath: iframe.dataset.returnPath ?? readReturnPath(),
      readerMode: iframe.dataset.readerMode === 'full' ? 'full' : 'split',
    };
  }

  function requestEditClose(reason: 'close' | 'navigation', navigation?: PendingNavigation, closeReader = reason === 'close'): void {
    const edit = activeEdit;
    if (!edit) return;
    pendingReaderClose = closeReader;
    pendingNavigation = navigation ?? null;
    if (!isOrdinaryEntry(edit.entry)) {
      // Page PRDs persist each content change before any route can detach the frame.
      finishEdit();
      return;
    }
    edit.iframe.contentWindow?.postMessage({
      type: 'AXHUB_EMBEDDED_DOCUMENT_REQUEST_CLOSE',
      reason,
      documentId: edit.entry.id,
      ...(normalizeId(edit.entry.pageId) ? { pageId: normalizeId(edit.entry.pageId) } : {}),
      returnPath: edit.returnPath,
      ...(navigation ? {
        destinationDocumentId: navigation.entry.id,
        ...(normalizeId(navigation.entry.pageId) ? { destinationPageId: normalizeId(navigation.entry.pageId) } : {}),
      } : {}),
    }, edit.origin);
  }

  function finishEdit(): void {
    const edit = activeEdit;
    if (!edit) return;
    const navigation = pendingNavigation;
    const closeReader = pendingReaderClose;
    activeEdit = null;
    options.onEditClosed?.();
    pendingNavigation = null;
    pendingReaderClose = false;
    reopeningEditedArticle = false;

    const body = getReaderBody();
    if (body) restoreBodyStyle(body);
    if (closeReader) {
      pinnedOrdinaryId = null;
      runtime()?.closeDirectoryArticle();
      return;
    }

    if (navigation) {
      setPinnedEntry(navigation.entry);
      if (!navigation.followRoute) scheduleEntryNavigation(navigation.entry);
      openNativeArticle(navigation.entry, edit.readerMode);
      scheduleSync();
      return;
    }

    openNativeArticle(edit.entry, edit.readerMode);
    scheduleSync();
  }

  function matchesEditMessage(event: MessageEvent, data: Record<string, unknown>): boolean {
    const edit = activeEdit;
    if (!edit || event.source !== edit.iframe.contentWindow || event.origin !== edit.origin) return false;
    if (readMessageIdentity(data) !== edit.entry.id) return false;
    const pageId = normalizeId(edit.entry.pageId);
    if (pageId && normalizeId(data.pageId) !== pageId) return false;
    if (normalizeId(data.returnPath) !== edit.returnPath) return false;
    return true;
  }

  function handleWindowMessage(event: MessageEvent): void {
    if (!event.data || typeof event.data !== 'object') return;
    const data = event.data as Record<string, unknown>;
    if (data.type === 'SPEC_EDIT_STATUS' && activeEdit
      && event.source === activeEdit.iframe.contentWindow && event.origin === activeEdit.origin) {
      activeEdit.dirty = data.dirty === true;
      return;
    }
    if (!matchesEditMessage(event, data)) return;
    if (data.type === 'AXHUB_EMBEDDED_DOCUMENT_SAVED') {
      options.onSaved?.();
      return;
    }
    if (data.type === 'AXHUB_EMBEDDED_DOCUMENT_CLOSE_CANCELLED') {
      pendingNavigation = null;
      pendingReaderClose = false;
      pendingEditId = null;
      requestedOpen = null;
    }
    if (data.type === 'AXHUB_EMBEDDED_DOCUMENT_CLOSED') finishEdit();
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!activeEdit?.dirty || !isOrdinaryEntry(activeEdit.entry)) return;
    event.preventDefault();
    event.returnValue = '';
  }

  function handleFolderTitleClick(event: MouseEvent, entry: PagePrdReaderEntry): void {
    event.preventDefault();
    event.stopPropagation();
    setPinnedEntry(entry);
    scheduleEntryNavigation(entry);
    openNativeArticle(entry);
  }

  function handleShadowClick(nativeEvent: Event): void {
    const event = nativeEvent as MouseEvent;
    const target = getElementTarget(event.target);
    if (!target) return;

    const editButton = target.closest<HTMLButtonElement>(`button[${EDIT_BUTTON_ATTRIBUTE}]`);
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();
      if (activeEdit) requestEditClose('close', undefined, false);
      else {
        const entry = entries.get(normalizeId(editButton.dataset.documentId));
        if (entry) createEdit(entry);
      }
      return;
    }

    const closeButton = target.closest<HTMLButtonElement>(`button[aria-label="${CLOSE_BUTTON_LABEL}"]`);
    if (closeButton) {
      if (activeEdit) {
        event.preventDefault();
        event.stopPropagation();
        requestEditClose('close');
      } else {
        window.setTimeout(() => {
          if (!getActiveArticleId()) pinnedOrdinaryId = null;
        }, 0);
      }
      return;
    }

    const nodeButton = target.closest<HTMLButtonElement>(TREE_NODE_SELECTOR);
    if (!nodeButton) return;
    const nodeId = normalizeId(nodeButton.dataset.directoryNodeId);
    const folderEntry = [...entries.values()].find((entry) => (
      normalizeId(entry.pageId) && nodeId === `${PAGE_PRD_FOLDER_PREFIX}${normalizeId(entry.pageId)}`
    ));
    const folderTitle = target.closest(FOLDER_TITLE_SELECTOR) || event.detail === 0;
    const selectedEntry = folderEntry && folderTitle
      ? folderEntry
      : entries.get(nodeId);
    if (!selectedEntry) {
      if (!activeEdit) pinnedOrdinaryId = null;
      return;
    }

    requestedOpen = null;
    if (activeEdit) {
      event.preventDefault();
      event.stopPropagation();
      if (selectedEntry.id !== activeEdit.entry.id) {
        requestEditClose('navigation', { entry: selectedEntry });
      }
      return;
    }

    if (folderEntry && folderTitle) {
      handleFolderTitleClick(event, folderEntry);
      return;
    }

    setPinnedEntry(selectedEntry);
    scheduleEntryNavigation(selectedEntry);
  }

  function openDefaultFromToolbar(): void {
    if (activeEdit) return;
    const activeId = getActiveArticleId();
    const activeEntry = entries.get(activeId);
    if (activeEntry && isOrdinaryEntry(activeEntry)) {
      pinnedOrdinaryId = activeEntry.id;
      return;
    }
    if (pinnedOrdinaryId) {
      const pinned = entries.get(pinnedOrdinaryId);
      if (pinned && openNativeArticle(pinned, getReaderMode())) return;
      pinnedOrdinaryId = null;
    }
    const entry = findEntryForCurrentPage() ?? findAllEntry();
    if (!entry) return;
    setPinnedEntry(entry);
    openNativeArticle(entry, getReaderMode());
  }

  function configureGeneratedFolders(): void {
    if (!shadowRoot) return;
    for (const entry of entries.values()) {
      const pageId = normalizeId(entry.pageId);
      if (!pageId || entry.id !== `${PAGE_PRD_ID_PREFIX}${pageId}`) continue;

      const folderId = `${PAGE_PRD_FOLDER_PREFIX}${pageId}`;
      const folderButton = [...shadowRoot.querySelectorAll<HTMLButtonElement>(TREE_NODE_SELECTOR)]
        .find((button) => button.dataset.directoryNodeId === folderId);
      const childButton = [...shadowRoot.querySelectorAll<HTMLButtonElement>(TREE_NODE_SELECTOR)]
        .find((button) => button.dataset.directoryNodeId === entry.id);
      const folderChildren = folderButton?.parentElement?.querySelector<HTMLElement>(
        ':scope > .axhub-annotation-directory-children',
      );
      const childWrap = childButton?.parentElement;
      if (folderChildren && childWrap?.parentElement === folderChildren) childWrap.hidden = true;

      const active = getActiveArticleId() === entry.id;
      folderButton?.classList.toggle('axhub-annotation-directory-node--active', active);
    }
  }

  function sync(): void {
    if (disposed || typeof document === 'undefined') return;
    connectShadowRoot();
    if (!shadowRoot) return;

    const documentPanelOpen = Boolean(shadowRoot.querySelector(DOCUMENT_PANEL_SELECTOR));
    if (!requestedOpen && entries.size && documentPanelOpen && !documentPanelWasOpen) openDefaultFromToolbar();
    documentPanelWasOpen = documentPanelOpen && entries.size > 0;

    adoptExistingEdit();
    configureGeneratedFolders();
    if (activeEdit) {
      const currentEntry = entries.get(activeEdit.entry.id);
      if (currentEntry) activeEdit.entry = currentEntry;
      const routeEntry = findEntryForCurrentPage();
      if (activeEdit.entry.pageId && routeEntry && routeEntry.id !== activeEdit.entry.id) {
        requestEditClose('navigation', { entry: routeEntry, followRoute: true });
        return;
      }
      ensureEditMounted();
      return;
    }

    const body = getReaderBody();
    const activeId = getActiveArticleId();
    const activeEntry = entries.get(activeId);
    if (requestedOpen) {
      const entry = entries.get(requestedOpen.id);
      if (!entry) {
        requestedOpen = null;
      } else {
        if (entry.pageId && entry.pageId !== options.getCurrentPageId()) return;
        if (activeId !== entry.id) {
          if (requestedOpen.attemptedAgainst !== activeId) {
            requestedOpen.attemptedAgainst = activeId;
            openNativeArticle(entry, 'split');
          }
          return;
        }
        const edit = requestedOpen.edit;
        requestedOpen = null;
        setPinnedEntry(entry);
        if (edit && createEdit(entry)) return;
      }
    }
    if (activeEntry && isOrdinaryEntry(activeEntry)) pinnedOrdinaryId = activeEntry.id;

    if (pendingEditId && body && pendingEditId === activeId) {
      const pendingEntry = entries.get(pendingEditId);
      if (pendingEntry?.pageId && pendingRoutePageId && pendingEntry.pageId !== options.getCurrentPageId()) return;
      if (pendingEntry && createEdit(pendingEntry)) return;
    }

    if (body && activeEntry?.contentUrl) {
      const header = shadowRoot.querySelector<HTMLElement>(READER_HEADER_SELECTOR);
      if (header) mountEditButton(header, activeEntry);
    } else {
      shadowRoot.querySelector(`button[${EDIT_BUTTON_ATTRIBUTE}]`)?.remove();
    }

    const currentPageId = normalizeId(options.getCurrentPageId());
    if (pendingRoutePageId && currentPageId === pendingRoutePageId) pendingRoutePageId = null;
    if (pendingRoutePageId && normalizeId(activeEntry?.pageId) === pendingRoutePageId) return;
    if (!activeEntry || isOrdinaryEntry(activeEntry) || !currentPageId || normalizeId(activeEntry.pageId) === currentPageId) {
      lastFollowKey = '';
      return;
    }

    const nextEntry = findEntryForCurrentPage() ?? findAllEntry();
    if (nextEntry?.id === activeEntry.id) return;
    const followKey = `${currentPageId}:${activeEntry.id}:${nextEntry?.id ?? 'none'}`;
    if (followKey === lastFollowKey) return;
    lastFollowKey = followKey;
    if (!nextEntry) {
      pinnedOrdinaryId = null;
      runtime()?.closeDirectoryArticle();
      return;
    }
    setPinnedEntry(nextEntry);
    openNativeArticle(nextEntry, getReaderMode());
  }

  function update(nextEntries: readonly PagePrdReaderEntry[]): void {
    entries = new Map();
    for (const input of nextEntries) {
      const id = normalizeId(input?.id);
      if (!id) continue;
      entries.set(id, {
        id,
        ...(normalizeId(input.pageId) ? { pageId: normalizeId(input.pageId) } : {}),
        ...(normalizeId(input.contentUrl) ? { contentUrl: normalizeId(input.contentUrl) } : {}),
        ...(input.pageUrl ? { pageUrl: input.pageUrl } : {}),
        ...(input.all === true ? { all: true } : {}),
      });
    }
    scheduleSync();
  }

  function open(id: string, edit = false): boolean {
    const entry = entries.get(normalizeId(id));
    if (!entry || !runtime()) return false;
    if (activeEdit) {
      if (activeEdit.entry.id === entry.id) return true;
      requestedOpen = { id: entry.id, edit, attemptedAgainst: null };
      requestEditClose('navigation', { entry });
      return true;
    }
    setPinnedEntry(entry);
    requestedOpen = { id: entry.id, edit, attemptedAgainst: null };
    scheduleEntryNavigation(entry);
    scheduleSync();
    return true;
  }

  function refreshEditingPage(pages: PagePrdRecords): void {
    const edit = activeEdit;
    const pageId = edit?.entry.pageId;
    if (!edit || !pageId) return;
    edit.iframe.contentWindow?.postMessage({
      type: 'AXHUB_EMBEDDED_PAGE_PRD_REFRESH',
      documentId: edit.entry.id,
      pageId,
      returnPath: edit.returnPath,
      content: pages[pageId]?.content ?? '',
    }, edit.origin);
  }

  async function replaceSource(replace: () => void | Promise<void>): Promise<boolean> {
    // Replacing the directory can detach the editor iframe and reset its live state.
    if (activeEdit?.entry.pageId) return false;
    connectShadowRoot();
    const articleId = requestedOpen ? '' : activeEdit?.entry.id ?? getActiveArticleId();
    const readerMode = getReaderMode();
    await replace();
    if (requestedOpen) requestedOpen.attemptedAgainst = null;
    if (articleId) runtime()?.openDirectoryArticle(articleId, { readerMode });
    scheduleSync();
    return true;
  }

  function dispose(): void {
    disposed = true;
    documentObserver?.disconnect();
    shadowObserver?.disconnect();
    shadowRoot?.removeEventListener('click', handleShadowClick, true);
    window.removeEventListener('message', handleWindowMessage);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    shadowRoot?.querySelector(`button[${EDIT_BUTTON_ATTRIBUTE}]`)?.remove();
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    documentObserver = new MutationObserver(scheduleSync);
    documentObserver.observe(document.documentElement, { childList: true });
    window.addEventListener('message', handleWindowMessage);
    window.addEventListener('beforeunload', handleBeforeUnload);
    connectShadowRoot();
    scheduleSync();
  }

  return { update, open, replaceSource, refreshEditingPage, dispose };
}
