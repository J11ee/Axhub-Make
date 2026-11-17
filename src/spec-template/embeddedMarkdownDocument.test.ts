import { describe, expect, it } from 'vitest';
import {
  createEmbeddedDocumentMessage,
  isMatchingEmbeddedDocumentCloseRequest,
  readEmbeddedPagePrdRefresh,
  resolveEmbeddedPagePrdRefresh,
  resolveEmbeddedMarkdownDocumentContext,
} from './embeddedMarkdownDocument';

describe('embedded Markdown document contract', () => {
  const search = '?embeddedDocument=page&documentId=doc-1&pageId=checkout&returnPath=%2F%3FprojectId%3Dp%23page%3Dhome&parentOrigin=http%3A%2F%2Flocalhost%3A53817%2F';

  it('reads the native reader identity and exact parent origin from the iframe URL', () => {
    expect(resolveEmbeddedMarkdownDocumentContext({ search })).toEqual({
      mode: 'page',
      documentId: 'doc-1',
      pageId: 'checkout',
      returnPath: '/?projectId=p#page=home',
      parentOrigin: 'http://localhost:53817',
    });
  });

  it('builds saved and closed messages with only the agreed identity fields', () => {
    const context = resolveEmbeddedMarkdownDocumentContext({ search });
    expect(context).not.toBeNull();
    expect(createEmbeddedDocumentMessage('AXHUB_EMBEDDED_DOCUMENT_SAVED', context!)).toEqual({
      type: 'AXHUB_EMBEDDED_DOCUMENT_SAVED',
      documentId: 'doc-1',
      pageId: 'checkout',
      returnPath: '/?projectId=p#page=home',
    });
    expect(createEmbeddedDocumentMessage('AXHUB_EMBEDDED_DOCUMENT_CLOSED', context!)).toEqual({
      type: 'AXHUB_EMBEDDED_DOCUMENT_CLOSED',
      documentId: 'doc-1',
      pageId: 'checkout',
      returnPath: '/?projectId=p#page=home',
    });
    expect(createEmbeddedDocumentMessage('AXHUB_EMBEDDED_DOCUMENT_CLOSE_CANCELLED', context!)).toEqual({
      type: 'AXHUB_EMBEDDED_DOCUMENT_CLOSE_CANCELLED',
      documentId: 'doc-1',
      pageId: 'checkout',
      returnPath: '/?projectId=p#page=home',
    });
  });

  it('accepts close requests only from the configured parent with matching resource identity', () => {
    const context = resolveEmbeddedMarkdownDocumentContext({ search });
    const parentWindow = {};
    const request = {
      type: 'AXHUB_EMBEDDED_DOCUMENT_REQUEST_CLOSE',
      reason: 'navigation',
      documentId: 'doc-1',
      pageId: 'checkout',
      returnPath: '/?projectId=p#page=home',
      destinationDocumentId: 'doc-2',
      destinationPageId: 'settings',
    };
    const base = { data: request, source: parentWindow, parentWindow, origin: 'http://localhost:53817', context: context! };

    expect(isMatchingEmbeddedDocumentCloseRequest(base)).toBe(true);
    expect(isMatchingEmbeddedDocumentCloseRequest({ ...base, source: {} })).toBe(false);
    expect(isMatchingEmbeddedDocumentCloseRequest({ ...base, origin: 'http://localhost:53818' })).toBe(false);
    expect(isMatchingEmbeddedDocumentCloseRequest({ ...base, data: { ...request, documentId: 'doc-2' } })).toBe(false);
    expect(isMatchingEmbeddedDocumentCloseRequest({ ...base, data: { ...request, pageId: 'settings' } })).toBe(false);
    expect(isMatchingEmbeddedDocumentCloseRequest({ ...base, data: { ...request, returnPath: '/other' } })).toBe(false);
    expect(isMatchingEmbeddedDocumentCloseRequest({ ...base, data: { ...request, reason: 'reload' } })).toBe(false);
  });

  it('matches external refreshes to the active page and keeps unsaved edits', () => {
    const context = resolveEmbeddedMarkdownDocumentContext({ search })!;
    const message = {
      type: 'AXHUB_EMBEDDED_PAGE_PRD_REFRESH',
      documentId: context.documentId,
      pageId: context.pageId,
      returnPath: context.returnPath,
      content: 'generated',
    };
    expect(readEmbeddedPagePrdRefresh(message, context)).toBe('generated');
    expect(readEmbeddedPagePrdRefresh({ ...message, pageId: 'other' }, context)).toBeUndefined();
    expect(readEmbeddedPagePrdRefresh(message, { ...context, mode: 'ordinary' })).toBeUndefined();
    expect(resolveEmbeddedPagePrdRefresh('saved', 'saved', 'generated')).toEqual({ content: 'generated', conflict: false });
    expect(resolveEmbeddedPagePrdRefresh('saved', 'draft', 'generated')).toEqual({ content: 'draft', conflict: true });
    expect(resolveEmbeddedPagePrdRefresh('saved', 'draft', 'saved')).toBeUndefined();
    expect(resolveEmbeddedPagePrdRefresh('saved', 'draft', 'draft')).toEqual({ content: 'draft', conflict: false });
  });

  it('does not treat an invalid parent origin or a missing document identity as an embedded contract', () => {
    expect(resolveEmbeddedMarkdownDocumentContext({
      search: '?embeddedDocument=ordinary&documentId=doc-1&returnPath=%2F&parentOrigin=javascript%3Aalert(1)',
    })?.parentOrigin).toBeNull();
    const missingIdentity = resolveEmbeddedMarkdownDocumentContext({
      search: '?embeddedDocument=ordinary&parentOrigin=http%3A%2F%2Flocalhost',
    });
    expect(missingIdentity).not.toBeNull();
    expect(createEmbeddedDocumentMessage('AXHUB_EMBEDDED_DOCUMENT_CLOSED', missingIdentity!)).toBeNull();
  });
});
