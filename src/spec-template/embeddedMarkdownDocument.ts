export type EmbeddedDocumentMode = 'page' | 'ordinary';
export type EmbeddedDocumentCloseReason = 'close' | 'navigation';
export type EmbeddedDocumentMessageType =
  | 'AXHUB_EMBEDDED_DOCUMENT_SAVED'
  | 'AXHUB_EMBEDDED_DOCUMENT_CLOSED'
  | 'AXHUB_EMBEDDED_DOCUMENT_CLOSE_CANCELLED';

export interface EmbeddedMarkdownDocumentContext {
  mode: EmbeddedDocumentMode;
  documentId: string;
  pageId?: string;
  returnPath: string;
  parentOrigin: string | null;
}

export interface EmbeddedDocumentCloseRequest {
  type: 'AXHUB_EMBEDDED_DOCUMENT_REQUEST_CLOSE';
  reason: EmbeddedDocumentCloseReason;
  documentId: string;
  pageId?: string;
  returnPath: string;
  destinationDocumentId?: string;
  destinationPageId?: string;
}

export function normalizeEmbeddedParentOrigin(value: unknown): string | null {
  const candidate = String(value ?? '').trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolveEmbeddedMarkdownDocumentContext(input: {
  mode?: unknown;
  documentId?: unknown;
  pageId?: unknown;
  returnPath?: unknown;
  parentOrigin?: unknown;
  search?: string;
}): EmbeddedMarkdownDocumentContext | null {
  const params = new URLSearchParams(input.search || '');
  const modeValue = String(input.mode ?? params.get('embeddedDocument') ?? '');
  if (modeValue !== 'page' && modeValue !== 'ordinary') return null;

  const documentId = String(input.documentId ?? params.get('documentId') ?? '').trim();
  const pageId = String(input.pageId ?? params.get('pageId') ?? '').trim();
  const returnPath = String(input.returnPath ?? params.get('returnPath') ?? '');
  return {
    mode: modeValue,
    documentId,
    ...(pageId ? { pageId } : {}),
    returnPath,
    parentOrigin: normalizeEmbeddedParentOrigin(input.parentOrigin ?? params.get('parentOrigin')),
  };
}

export function createEmbeddedDocumentMessage(
  type: EmbeddedDocumentMessageType,
  context: EmbeddedMarkdownDocumentContext,
): Record<string, string> | null {
  if (!context.documentId || !context.returnPath) return null;
  return {
    type,
    documentId: context.documentId,
    ...(context.pageId ? { pageId: context.pageId } : {}),
    returnPath: context.returnPath,
  };
}

export function readEmbeddedPagePrdRefresh(
  data: Record<string, unknown>,
  context: EmbeddedMarkdownDocumentContext,
): string | undefined {
  if (context.mode === 'page'
    && data.type === 'AXHUB_EMBEDDED_PAGE_PRD_REFRESH'
    && data.documentId === context.documentId
    && data.pageId === context.pageId
    && data.returnPath === context.returnPath
    && typeof data.content === 'string') {
    return data.content;
  }
}

export function resolveEmbeddedPagePrdRefresh(saved: string, local: string, incoming: string) {
  if (incoming === saved) return;
  const conflict = local !== saved && local !== incoming;
  return { content: conflict ? local : incoming, conflict };
}

export function isMatchingEmbeddedDocumentCloseRequest(input: {
  data: unknown;
  source: unknown;
  parentWindow: unknown;
  origin: string;
  context: EmbeddedMarkdownDocumentContext;
}): input is typeof input & { data: EmbeddedDocumentCloseRequest } {
  const data = input.data as Partial<EmbeddedDocumentCloseRequest> | null;
  if (
    !data
    || !input.context.parentOrigin
    || !input.context.documentId
    || !input.context.returnPath
    || input.source !== input.parentWindow
    || input.origin !== input.context.parentOrigin
    || data.type !== 'AXHUB_EMBEDDED_DOCUMENT_REQUEST_CLOSE'
    || data.documentId !== input.context.documentId
    || String(data.pageId || '') !== String(input.context.pageId || '')
    || data.returnPath !== input.context.returnPath
    || (data.reason !== 'close' && data.reason !== 'navigation')
  ) {
    return false;
  }
  return true;
}
