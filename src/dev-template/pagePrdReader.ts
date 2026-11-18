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
  setDirectoryPanelOpen(open: boolean): void;
}

type AnnotationRuntimeWindow = Window & {
  __AXHUB_ANNOTATION_RUNTIME__?: AnnotationRuntimeController;
};

interface PendingNavigation {
  entry: PagePrdReaderEntry;
  followRoute?: boolean;
  closeDirectory?: boolean;
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
const NODE_TITLE_SELECTOR = '.axhub-annotation-directory-node__title';
const NODE_ICON_SELECTOR = '.axhub-annotation-directory-node__icon';
const NATIVE_DOCUMENTS_BUTTON = 'button.axhub-annotation-edge-button[aria-label="文档目录"]';
const DIRECTORY_BUTTON_ATTRIBUTE = 'data-axhub-page-prd-directory-button';
const NODE_VISUAL_ATTRIBUTE = 'data-axhub-page-prd-node-visual';
const NODE_STATUS_ATTRIBUTE = 'data-axhub-page-prd-node-status';
const ARTICLE_STATUS_ATTRIBUTE = 'data-axhub-page-prd-article-status';

const FILE_ICON = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>';
const FOLDER_ICON = '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.81-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>';
const FOLDER_OPEN_ICON = '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>';
const STATUS_ICON = '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>';

function createIcon(paths: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.flexShrink = '0';
  svg.innerHTML = paths;
  return svg;
}

function createFolderIcon(expanded: boolean): SVGSVGElement {
  const svg = createIcon(expanded ? FOLDER_OPEN_ICON : FOLDER_ICON);
  svg.style.color = '#2563eb';
  svg.style.fill = expanded ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.2)';
  svg.style.stroke = 'currentColor';
  return svg;
}

function createFileIcon(): SVGSVGElement {
  const svg = createIcon(FILE_ICON);
  svg.style.color = 'currentColor';
  svg.style.fill = 'none';
  svg.style.stroke = 'currentColor';
  return svg;
}
const EDIT_BUTTON_ATTRIBUTE = 'data-axhub-page-prd-edit-button';
const EDIT_FRAME_ATTRIBUTE = 'data-axhub-page-prd-frame';
const ORIGINAL_BODY_STYLE_ATTRIBUTE = 'data-axhub-page-prd-original-style';
const ORIGINAL_SURFACE_HIDDEN_ATTRIBUTE = 'data-axhub-page-prd-original-hidden';
const PAGE_PRD_ID_PREFIX = 'make-page-prd:page:';
const PAGE_PRD_FOLDER_PREFIX = 'make-page-prd:branch:';
const CLOSE_BUTTON_LABEL = '关闭文档';
const DOCUMENT_PANEL_SELECTOR = '[data-axhub-annotation-comment-target-id="documents-panel"]';
const DIRECT_ACTION_ATTRIBUTE = 'data-axhub-annotation-direct-action';

function entryStatusReason(entry: PagePrdReaderEntry | undefined): string {
  if (entry?.status === 'missing') return '已绑定的 PRD 文件不存在';
  return entry?.status === 'unbound' ? '未绑定 PRD' : '';
}

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function isOrdinaryEntry(entry: PagePrdReaderEntry): boolean {
  return !normalizeId(entry.pageId);
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
  let requestedOpen: { id: string; edit: boolean; closeDirectory: boolean; attemptedAgainst: string | null } | null = null;
  let pendingRoutePageId: string | null = null;
  let lastFollowKey = '';
  let delegatingDirectoryToggle = false;
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
    shadowRoot?.removeEventListener('keydown', handleShadowKeydown, true);
    shadowRoot = nextRoot;
    if (!shadowRoot) return;

    shadowRoot.addEventListener('click', handleShadowClick, true);
    shadowRoot.addEventListener('keydown', handleShadowKeydown, true);
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

  function toggleDocumentsPanel(): void {
    const button = shadowRoot?.querySelector<HTMLButtonElement>(NATIVE_DOCUMENTS_BUTTON);
    if (!button) return;
    delegatingDirectoryToggle = true;
    try {
      button.click();
    } finally {
      delegatingDirectoryToggle = false;
    }
  }

  function closeNavigationPanel(): void {
    if (shadowRoot?.querySelector(NATIVE_DOCUMENTS_BUTTON)?.getAttribute('aria-pressed') === 'true') {
      toggleDocumentsPanel();
    } else runtime()?.setDirectoryPanelOpen(false);
  }

  function openNativeArticle(entry: PagePrdReaderEntry, mode: DirectoryReaderMode = 'split', closeDirectory = false): boolean {
    return runtime()?.openDirectoryArticle(entry.id, {
      readerMode: mode,
      ...(closeDirectory ? { directoryOpen: false } : {}),
    }) ?? false;
  }

  function findEntryForCurrentPage(): PagePrdReaderEntry | undefined {
    const currentPageId = normalizeId(options.getCurrentPageId());
    return currentPageId ? entries.get(`${PAGE_PRD_ID_PREFIX}${currentPageId}`) : undefined;
  }

  function navigateToEntry(entry: PagePrdReaderEntry): void {
    const pageId = normalizeId(entry.pageId);
    if (!pageId || pageId === normalizeId(options.getCurrentPageId())) return;
    options.navigate(pageId);
  }

  function scheduleEntryNavigation(entry: PagePrdReaderEntry): void {
    const pageId = normalizeId(entry.pageId);
    if (!pageId) return;
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
      button.style.cssText = 'flex:none;white-space:nowrap;width:auto;min-width:24px;padding-inline:4px';
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

  function syncDirectoryButton(): void {
    const header = shadowRoot?.querySelector<HTMLElement>(READER_HEADER_SELECTOR);
    if (!header) return;
    let button = header.querySelector<HTMLButtonElement>(`button[${DIRECTORY_BUTTON_ATTRIBUTE}]`);
    if (!shadowRoot?.querySelector(NATIVE_DOCUMENTS_BUTTON)) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'we-runtime-prop-panel__header-action ant-btn ant-btn-text ant-btn-sm';
      button.style.cssText = 'flex:none;white-space:nowrap;width:auto;min-width:24px;padding-inline:4px';
      button.setAttribute(DIRECT_ACTION_ATTRIBUTE, 'true');
      button.setAttribute(DIRECTORY_BUTTON_ATTRIBUTE, 'true');
      button.textContent = '目录';
      const closeButton = header.querySelector<HTMLButtonElement>(`button[aria-label="${CLOSE_BUTTON_LABEL}"]`);
      header.insertBefore(button, closeButton);
    }
    const open = Boolean(shadowRoot.querySelector(DOCUMENT_PANEL_SELECTOR));
    button.setAttribute('aria-pressed', String(open));
    button.setAttribute('aria-label', '文档目录');
    button.title = open ? '隐藏文档目录' : '显示文档目录';
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
      runtime()?.closeDirectoryArticle();
      return;
    }

    if (navigation) {
      if (!navigation.followRoute) scheduleEntryNavigation(navigation.entry);
      openNativeArticle(navigation.entry, edit.readerMode, navigation.closeDirectory);
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
    scheduleEntryNavigation(entry);
    openNativeArticle(entry);
  }

  function handleShadowKeydown(nativeEvent: Event): void {
    const event = nativeEvent as KeyboardEvent;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const button = getElementTarget(event.target)?.closest<HTMLButtonElement>(TREE_NODE_SELECTOR);
    if (!button?.dataset.directoryNodeId?.startsWith(PAGE_PRD_FOLDER_PREFIX)) return;
    event.preventDefault();
    if ((button.getAttribute('aria-expanded') === 'true') === (event.key === 'ArrowRight')) return;
    button.querySelector(NODE_ICON_SELECTOR)?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  }

  function handleShadowClick(nativeEvent: Event): void {
    const event = nativeEvent as MouseEvent;
    const target = getElementTarget(event.target);
    if (!target) return;

    if (target.closest(`button[${DIRECTORY_BUTTON_ATTRIBUTE}]`)) {
      event.preventDefault();
      event.stopPropagation();
      toggleDocumentsPanel();
      return;
    }

    if (target.closest(NATIVE_DOCUMENTS_BUTTON)) {
      if (delegatingDirectoryToggle) return;
      if (openCurrent()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

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

    if (target.closest(`button[aria-label="${CLOSE_BUTTON_LABEL}"]`)) {
      if (activeEdit) {
        event.preventDefault();
        event.stopPropagation();
        requestEditClose('close');
      }
      return;
    }

    const nodeButton = target.closest<HTMLButtonElement>(TREE_NODE_SELECTOR);
    if (!nodeButton) return;
    const nodeId = normalizeId(nodeButton.dataset.directoryNodeId);
    const isFolder = nodeId.startsWith(PAGE_PRD_FOLDER_PREFIX);
    const id = isFolder ? `${PAGE_PRD_ID_PREFIX}${nodeId.slice(PAGE_PRD_FOLDER_PREFIX.length)}` : nodeId;
    if (isFolder && event.detail !== 0 && target.closest(NODE_ICON_SELECTOR)) return;
    const entry = entries.get(id);
    if (!entry) return;

    requestedOpen = null;
    if (activeEdit) {
      event.preventDefault();
      event.stopPropagation();
      if (entry.id !== activeEdit.entry.id) requestEditClose('navigation', { entry });
      return;
    }

    if (isFolder) handleFolderTitleClick(event, entry);
    else scheduleEntryNavigation(entry);
  }

  function configurePageNodes(): void {
    if (!shadowRoot) return;
    const documentsPanel = shadowRoot.querySelector(DOCUMENT_PANEL_SELECTOR);
    if (!documentsPanel) return;
    const buttons = new Map([...documentsPanel.querySelectorAll<HTMLButtonElement>(TREE_NODE_SELECTOR)]
      .map((button) => [button.dataset.directoryNodeId, button]));
    for (const button of buttons.values()) {
      const type = button.dataset.directoryNodeType;
      if (type !== 'folder' && type !== 'markdown' && type !== 'html') continue;
      const isPageBranch = button.dataset.directoryNodeId?.startsWith(PAGE_PRD_FOLDER_PREFIX);
      const isFolder = type === 'folder' && !isPageBranch;
      const isExpanded = Boolean(button.parentElement?.querySelector(':scope > .axhub-annotation-directory-children'));

      const nativeIcon = button.querySelector<HTMLElement>(NODE_ICON_SELECTOR);
      if (nativeIcon && type !== 'folder') {
        nativeIcon.style.display = 'inline-flex';
        nativeIcon.style.visibility = 'hidden';
        nativeIcon.style.width = '14px';
        nativeIcon.style.height = '14px';
        nativeIcon.style.flex = '0 0 14px';
        nativeIcon.setAttribute('aria-hidden', 'true');
        nativeIcon.innerHTML = '';
      }

      const existingIcon = button.querySelector<SVGSVGElement>(`[${NODE_VISUAL_ATTRIBUTE}]`);
      if (existingIcon) {
        if (isFolder) {
          existingIcon.style.color = '#2563eb';
          const targetPath = isExpanded ? FOLDER_OPEN_ICON : FOLDER_ICON;
          if (existingIcon.innerHTML !== targetPath) {
            existingIcon.innerHTML = targetPath;
            existingIcon.style.fill = isExpanded ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.2)';
          }
        }
        continue;
      }

      const icon = isFolder ? createFolderIcon(isExpanded) : createFileIcon();
      icon.setAttribute(NODE_VISUAL_ATTRIBUTE, '');
      button.insertBefore(icon, button.querySelector(NODE_TITLE_SELECTOR));
    }
    const activeId = getActiveArticleId();
    for (const entry of entries.values()) {
      const pageId = entry.pageId;
      if (!pageId || entry.id !== `${PAGE_PRD_ID_PREFIX}${pageId}`) continue;

      const folder = buttons.get(`${PAGE_PRD_FOLDER_PREFIX}${pageId}`);
      const leaf = buttons.get(entry.id);
      const button = folder ?? leaf;
      if (!button) continue;
      if (folder) {
        const children = folder.parentElement?.querySelector<HTMLElement>(
          ':scope > .axhub-annotation-directory-children',
        );
        const hiddenArticle = leaf?.parentElement;
        if (children && hiddenArticle?.parentElement === children && !hiddenArticle.hidden) hiddenArticle.hidden = true;
        folder.classList.toggle('axhub-annotation-directory-node--active', activeId === entry.id);
        folder.setAttribute('aria-expanded', String(Boolean(children)));
        folder.setAttribute('aria-keyshortcuts', 'ArrowRight ArrowLeft');
      }
      const title = button.querySelector(NODE_TITLE_SELECTOR);
      const reason = entryStatusReason(entry);
      let status = button.querySelector<HTMLElement>(`[${NODE_STATUS_ATTRIBUTE}]`);
      if (reason) {
        if (!status) {
          status = document.createElement('span');
          status.setAttribute(NODE_STATUS_ATTRIBUTE, '');
          status.style.cssText = 'display:inline-flex;flex-shrink:0;color:#b45309';
          status.append(createIcon(STATUS_ICON));
          button.append(status);
        }
        status.title = reason;
        button.setAttribute('aria-label', `${title?.textContent ?? ''}，${reason}`);
      } else if (status) {
        status.remove();
        button.removeAttribute('aria-label');
      }
    }
  }

  function syncArticleStatus(entry: PagePrdReaderEntry | undefined): void {
    const article = getReaderBody()?.querySelector<HTMLElement>(MARKDOWN_ID_SELECTOR);
    const parent = article?.parentElement;
    if (!article || !parent) return;
    const reason = entryStatusReason(entry);
    let status = parent.querySelector<HTMLElement>(`[${ARTICLE_STATUS_ATTRIBUTE}]`);
    if (!reason) {
      if (status) {
        status.remove();
        article.hidden = false;
      }
      return;
    }
    if (!status) {
      status = document.createElement('span');
      status.setAttribute(ARTICLE_STATUS_ATTRIBUTE, '');
      status.style.cssText = 'display:inline-flex;color:#b45309';
      status.tabIndex = 0;
      status.append(createIcon(STATUS_ICON));
      parent.insertBefore(status, article);
    }
    status.title = reason;
    status.setAttribute('aria-label', reason);
    if (!article.hidden) article.hidden = true;
  }

  function sync(): void {
    if (disposed || typeof document === 'undefined') return;
    connectShadowRoot();
    if (!shadowRoot) return;

    adoptExistingEdit();
    configurePageNodes();
    syncDirectoryButton();
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
    syncArticleStatus(activeEntry);
    if (requestedOpen) {
      const entry = entries.get(requestedOpen.id);
      if (!entry) {
        requestedOpen = null;
      } else {
        if (entry.pageId && entry.pageId !== options.getCurrentPageId()) return;
        if (activeId !== entry.id) {
          if (requestedOpen.attemptedAgainst !== activeId) {
            requestedOpen.attemptedAgainst = activeId;
            openNativeArticle(entry, 'split', requestedOpen.closeDirectory);
          }
          return;
        }
        const { edit, closeDirectory } = requestedOpen;
        requestedOpen = null;
        if (closeDirectory) closeNavigationPanel();
        if (edit && createEdit(entry)) return;
      }
    }

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

    const nextEntry = findEntryForCurrentPage();
    if (nextEntry?.id === activeEntry.id) return;
    const followKey = `${currentPageId}:${activeEntry.id}:${nextEntry?.id ?? 'none'}`;
    if (followKey === lastFollowKey) return;
    lastFollowKey = followKey;
    if (!nextEntry) {
      runtime()?.closeDirectoryArticle();
      return;
    }
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
        ...(input.status ? { status: input.status } : {}),
      });
    }
    scheduleSync();
  }

  function open(id: string, edit = false, closeDirectory = false): boolean {
    const entry = entries.get(normalizeId(id));
    if (!entry || !runtime()) return false;
    if (activeEdit) {
      if (activeEdit.entry.id === entry.id) {
        if (closeDirectory) closeNavigationPanel();
        return true;
      }
      requestedOpen = { id: entry.id, edit, closeDirectory, attemptedAgainst: null };
      requestEditClose('navigation', { entry, closeDirectory });
      return true;
    }
    requestedOpen = { id: entry.id, edit, closeDirectory, attemptedAgainst: null };
    scheduleEntryNavigation(entry);
    scheduleSync();
    return true;
  }

  function openCurrent(): boolean {
    const entry = findEntryForCurrentPage();
    return entry ? open(entry.id, false, true) : false;
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
    if (activeEdit) return false;
    connectShadowRoot();
    const articleId = requestedOpen ? '' : getActiveArticleId();
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
    shadowRoot?.removeEventListener('keydown', handleShadowKeydown, true);
    window.removeEventListener('message', handleWindowMessage);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    shadowRoot?.querySelector(`button[${EDIT_BUTTON_ATTRIBUTE}]`)?.remove();
    shadowRoot?.querySelector(`button[${DIRECTORY_BUTTON_ATTRIBUTE}]`)?.remove();
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    documentObserver = new MutationObserver(scheduleSync);
    documentObserver.observe(document.documentElement, { childList: true });
    window.addEventListener('message', handleWindowMessage);
    window.addEventListener('beforeunload', handleBeforeUnload);
    connectShadowRoot();
    scheduleSync();
  }

  return { update, open, openCurrent, replaceSource, refreshEditingPage, dispose };
}
