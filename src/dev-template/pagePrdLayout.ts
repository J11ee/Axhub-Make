const TOOLBAR = '.axhub-annotation-edge-toolbar:not(.axhub-export-prd-toolbar)';
const DOCUMENT_BUTTON = '.axhub-annotation-edge-button[aria-label="文档目录"]';
const PAGE_PANEL = '[data-axhub-annotation-comment-target-id="directory-panel"]';
const DOCUMENT_PANEL = '[data-axhub-annotation-comment-target-id="documents-panel"]';
const READER = '.axhub-annotation-directory-reader';
const SETTINGS = '.axhub-annotation-toolbar-surface--settings';
const EXPORT_TOOLBAR = '.axhub-export-prd-toolbar';
const RESIZE_HANDLE = '.axhub-export-panel-resize';
const DOCK = ':host([data-axhub-prd-docked])';
const READER_WIDTH = '--axhub-prd-reader-width';

const dockCss = `
  ${DOCK} ${READER} {
    right: 0 !important;
    left: auto !important;
  }
  ${DOCK} ${DOCUMENT_PANEL} {
    right: var(${READER_WIDTH}, 0px) !important;
    left: auto !important;
  }
  ${DOCK} ${DOCUMENT_PANEL} .we-runtime-prop-panel__resize-handle[data-edge="left"],
  ${DOCK} ${READER} .axhub-annotation-directory-reader__resize-handle[style*="right:"],
  :host([data-axhub-prd-two-panes]) ${READER} .axhub-annotation-directory-reader__resize-handle {
    display: none;
  }
`;

const exportCss = `
  ${TOOLBAR} {
    top: var(--axhub-export-left-top, 8px) !important;
    left: var(--axhub-export-page-width, 0px) !important;
    right: auto !important;
    transform: none !important;
    border-radius: 0 10px 10px 0 !important;
  }
  ${TOOLBAR} > :not(button[aria-label="页面目录"]):not(.axhub-annotation-settings-trigger),
  .axhub-annotation-edge-toolbar-hover-zone {
    display: none !important;
  }
  ${SETTINGS} {
    top: var(--axhub-export-settings-top, 8px) !important;
    left: calc(var(--axhub-export-page-width, 0px) + 44px) !important;
    right: auto !important;
    transform: none !important;
  }
  ${EXPORT_TOOLBAR}:not([hidden]) {
    display: inline-flex;
    position: fixed;
    top: var(--axhub-export-right-top, 8px);
    right: 0;
    padding: 6px 4px;
    border: 1px solid #d8dce2;
    border-right: 0;
    border-radius: 10px 0 0 10px;
    background: rgba(255, 255, 255, .96);
    pointer-events: auto;
  }
  ${TOOLBAR}, ${EXPORT_TOOLBAR} {
    cursor: grab !important;
    touch-action: none;
  }
  [data-axhub-export-dragging] { cursor: grabbing !important; }
  ${PAGE_PANEL} {
    left: 0 !important;
    right: auto !important;
  }
  ${PAGE_PANEL} .we-runtime-prop-panel__resize-handle,
  ${DOCUMENT_PANEL} .we-runtime-prop-panel__resize-handle,
  ${READER} .axhub-annotation-directory-reader__resize-handle {
    display: none;
  }
  ${PAGE_PANEL}, ${DOCUMENT_PANEL}, ${READER} {
    box-sizing: border-box;
    width: var(--axhub-export-panel-width) !important;
    min-width: 0 !important;
    max-width: none !important;
    transition: none !important;
  }
  ${RESIZE_HANDLE} {
    position: absolute;
    top: 40px;
    bottom: 0;
    width: 7px;
    left: 0;
    z-index: 4;
    cursor: ew-resize;
    touch-action: none;
  }
  ${PAGE_PANEL} > ${RESIZE_HANDLE} { right: 0; left: auto; }
  ${RESIZE_HANDLE}:hover, ${RESIZE_HANDLE}[data-axhub-export-dragging] {
    background: rgba(100, 116, 139, .22);
    cursor: ew-resize !important;
  }
  ${READER}[data-reader-mode="full"] > ${RESIZE_HANDLE} { display: none; }
`;

function bindPointerDrag(element: HTMLElement, axis: 'clientX' | 'clientY', start: () => (delta: number) => void): void {
  let suppressClick = false;
  element.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || !down.isPrimary) return;
    down.stopPropagation();
    suppressClick = false;
    const move = start();
    const listeners = new AbortController();
    const options = { signal: listeners.signal, capture: true };
    window.addEventListener('pointermove', (event) => {
      if (event.pointerId !== down.pointerId) return;
      const delta = event[axis] - down[axis];
      if (!suppressClick && Math.abs(delta) < 4) return;
      if (!suppressClick) {
        suppressClick = true;
        element.toggleAttribute('data-axhub-export-dragging', true);
        if (element.isConnected) element.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      move(delta);
    }, options);
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== down.pointerId) return;
      listeners.abort();
      element.removeAttribute('data-axhub-export-dragging');
    };
    window.addEventListener('pointerup', finish, options);
    window.addEventListener('pointercancel', finish, options);
    element.addEventListener('lostpointercapture', finish, { signal: listeners.signal });
  }, true);
  element.addEventListener('click', (event) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

export function createPagePrdLayout(onExportOpenCurrent?: (closeDirectory: boolean) => void) {
  const style = document.createElement('style');
  style.textContent = onExportOpenCurrent ? dockCss + exportCss : dockCss;
  const rightToolbar = onExportOpenCurrent ? document.createElement('div') : null;
  if (rightToolbar) rightToolbar.className = 'axhub-annotation-edge-toolbar axhub-export-prd-toolbar';
  let currentShadow: ShadowRoot | undefined;
  let pagePanel: HTMLElement | null = null;
  let reader: HTMLElement | null = null;
  let docsPanel: HTMLElement | null = null;
  let originalTransform = '';
  let adjustedTransform = '';
  const toolbarPositions = { left: 8, right: 8 };
  const boundToolbars = new WeakSet<HTMLElement>();
  const panelWidths: Partial<Record<'page' | 'docs' | 'reader', number>> = {};

  function resizeExportPanels(): void {
    const panels = [
      ['page', pagePanel, '调整页面目录宽度', 180],
      ['docs', docsPanel, '调整需求目录宽度', 180],
      ['reader', reader, '调整需求正文宽度', 240],
    ] as const;
    const openPanels = panels.filter(([, panel]) => panel !== null);
    const canvasMinimum = reader?.dataset.readerMode === 'full' ? 0 : 96;
    let remaining = Math.max(0, document.documentElement.clientWidth - canvasMinimum);
    const minimum = Math.min(120, Math.floor(remaining / Math.max(1, openPanels.length)));
    for (const [index, [kind, panel, label, idealMin]] of openPanels.entries()) {
      if (!panel) continue;
      const full = panel.dataset.readerMode === 'full';
      const max = remaining - minimum * (openPanels.length - index - 1);
      const width = Math.min(max, Math.max(Math.min(idealMin, max), full
        ? max
        : panelWidths[kind] ?? Number.parseFloat(panel.style.width)));
      panel.style.setProperty('--axhub-export-panel-width', `${width}px`);
      remaining -= width;
      const previousHandle = panel.querySelector<HTMLElement>(RESIZE_HANDLE);
      if (previousHandle?.dataset.panel !== kind) {
        const handle = document.createElement('div');
        handle.className = RESIZE_HANDLE.slice(1);
        handle.dataset.panel = kind;
        handle.setAttribute('data-axhub-annotation-direct-action', 'true');
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-label', label);
        bindPointerDrag(handle, 'clientX', () => {
          const startWidth = panel.offsetWidth;
          return (delta) => {
            const viewport = document.documentElement.clientWidth;
            const otherWidth = [pagePanel, docsPanel, reader].reduce((sum, other) => (
              sum + (other && other !== panel && other.dataset.readerMode !== 'full' ? other.offsetWidth : 0)
            ), 0);
            const reserved = reader?.dataset.readerMode === 'full' ? minimum : 96;
            const limit = Math.max(0, viewport - reserved - otherWidth);
            panelWidths[kind] = Math.max(Math.min(idealMin, limit), Math.min(limit, startWidth + (kind === 'page' ? delta : -delta)));
            updateGeometry();
          };
        });
        if (previousHandle) previousHandle.replaceWith(handle);
        else panel.append(handle);
      }
    }
  }

  function updateToolbarPositions(host: HTMLElement): void {
    for (const [side, toolbar] of [
      ['left', currentShadow?.querySelector<HTMLElement>(TOOLBAR)],
      ['right', rightToolbar],
    ] as const) {
      if (!toolbar || toolbar.hidden) continue;
      if (!boundToolbars.has(toolbar)) {
        boundToolbars.add(toolbar);
        bindPointerDrag(toolbar, 'clientY', () => {
          const top = toolbar.getBoundingClientRect().top;
          return (delta) => {
            toolbarPositions[side] = top + delta;
            updateToolbarPositions(host);
          };
        });
      }
      const top = Math.max(0, Math.min(toolbarPositions[side], window.innerHeight - toolbar.offsetHeight));
      host.style.setProperty(`--axhub-export-${side}-top`, `${top}px`);
    }
    const settings = currentShadow?.querySelector<HTMLElement>(SETTINGS);
    const leftTop = Number.parseFloat(host.style.getPropertyValue('--axhub-export-left-top')) || 0;
    host.style.setProperty('--axhub-export-settings-top',
      `${Math.max(0, Math.min(leftTop, window.innerHeight - (settings?.offsetHeight ?? 0)))}px`);
  }

  function updateGeometry(): void {
    const host = currentShadow?.host as HTMLElement | undefined;
    if (!host) return;
    if (onExportOpenCurrent) {
      resizeExportPanels();
      updateToolbarPositions(host);
    }
    const pageWidth = pagePanel?.offsetWidth ?? 0;
    const readerWidth = reader?.offsetWidth ?? 0;
    const docked = Boolean(onExportOpenCurrent || (reader && docsPanel));
    if (onExportOpenCurrent) host.style.setProperty('--axhub-export-page-width', `${pageWidth}px`);
    host.style.setProperty(READER_WIDTH, `${readerWidth}px`);
    host.toggleAttribute('data-axhub-prd-docked', docked);
    host.toggleAttribute('data-axhub-prd-two-panes', docked && Boolean(reader && (pagePanel || docsPanel)));
    const bodyStyle = document.body.style;
    const currentTransform = bodyStyle.transform;
    if (currentTransform !== adjustedTransform) originalTransform = currentTransform;
    if (onExportOpenCurrent) document.body.toggleAttribute('data-axhub-export-panel-fit', Boolean(originalTransform));
    if (!originalTransform) {
      adjustedTransform = '';
      return;
    }

    // The native viewer reserves all panel space on its selected edge.
    const panels = [pagePanel, reader, docsPanel];
    const nativeWidth = (panel: HTMLElement | null) => panel
      ? onExportOpenCurrent ? Number.parseFloat(panel.style.width) : panel.offsetWidth
      : 0;
    const nativeLeftWidth = panels.reduce((width, panel) => width + (panel?.style.left ? nativeWidth(panel) : 0), 0);
    const shift = docked ? pageWidth - nativeLeftWidth : 0;
    adjustedTransform = shift ? `translateX(${shift}px) ${originalTransform}` : originalTransform;
    if (onExportOpenCurrent && panels.some(Boolean)) {
      const viewport = window.innerWidth;
      const oldSpace = viewport - panels.reduce((width, panel) => width + nativeWidth(panel), 0);
      const newSpace = viewport - panels.reduce((width, panel) => width + (panel?.offsetWidth ?? 0), 0);
      if (newSpace !== oldSpace && document.documentElement.style.overflowX === 'hidden') {
        const { a: scale, e: x } = new DOMMatrixReadOnly(originalTransform);
        const designWidth = Math.max(document.body.scrollWidth, Number.parseFloat(bodyStyle.width) || viewport);
        const nextScale = Math.min(1, Math.max(0, newSpace) / designWidth);
        const offset = scale > 0 ? (x - nativeLeftWidth) * nextScale / scale : 0;
        adjustedTransform = `translateX(${pageWidth + offset}px) scale(${nextScale})`;
      }
    }
    if (bodyStyle.transform !== adjustedTransform) {
      bodyStyle.setProperty('transform', adjustedTransform, 'important');
      adjustedTransform = bodyStyle.transform;
    }
  }

  const resize = new ResizeObserver(updateGeometry);

  function sync(shadow: ShadowRoot): void {
    if (shadow !== currentShadow) {
      currentShadow = shadow;
      shadow.append(style);
    }
    const nativeToolbar = rightToolbar && shadow.querySelector<HTMLElement>(TOOLBAR);
    const documentButton = nativeToolbar?.querySelector<HTMLButtonElement>(DOCUMENT_BUTTON);
    if (rightToolbar && onExportOpenCurrent && nativeToolbar && documentButton
      && rightToolbar.parentElement !== nativeToolbar.parentElement) {
      const button = documentButton.cloneNode(true) as HTMLButtonElement;
      button.setAttribute('aria-label', '当前页需求');
      button.title = '查看当前页需求';
      button.removeAttribute('aria-pressed');
      button.setAttribute('data-active', 'false');
      button.addEventListener('click', () => onExportOpenCurrent(Boolean(docsPanel)));
      rightToolbar.replaceChildren(button);
      rightToolbar.style.zIndex = nativeToolbar.style.zIndex;
      nativeToolbar.after(rightToolbar);
    }

    const nextPage = shadow.querySelector<HTMLElement>(PAGE_PANEL);
    const nextReader = shadow.querySelector<HTMLElement>(READER);
    const nextDocs = shadow.querySelector<HTMLElement>(DOCUMENT_PANEL);
    if (nextPage !== pagePanel || nextReader !== reader || nextDocs !== docsPanel) {
      resize.disconnect();
      pagePanel = nextPage;
      reader = nextReader;
      docsPanel = nextDocs;
      for (const panel of [pagePanel, reader, docsPanel]) if (panel) resize.observe(panel);
    }
    if (rightToolbar) rightToolbar.hidden = Boolean(reader);
    updateGeometry();
  }

  window.addEventListener('axhub:page-zoom-update', updateGeometry);
  if (onExportOpenCurrent) window.addEventListener('resize', updateGeometry);
  const body = new MutationObserver(updateGeometry);
  body.observe(document.body, { attributes: true, attributeFilter: ['style'] });
  return {
    sync,
    dispose() {
      window.removeEventListener('axhub:page-zoom-update', updateGeometry);
      window.removeEventListener('resize', updateGeometry);
      body.disconnect();
      resize.disconnect();
      style.remove();
    },
  };
}
