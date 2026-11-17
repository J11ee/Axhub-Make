const SPEC_DRAFT_STORAGE_PREFIX = 'axhub-spec-draft:';
const PAGE_PRD_API_PATH = '/api/prototype-annotation/page-prd';
const PROJECT_DOCUMENT_CONTENT_PATH_RE = /^\/api\/projects\/([^/]+)\/document-content$/iu;
const PROJECT_DOCUMENT_PATH_CONTENT_RE = /^\/api\/projects\/([^/]+)\/docs\/(.+)\/content$/iu;

export type MarkdownDraftIdentity =
  | { kind: 'prototype-page-prd'; projectId: string; targetPath: string; pageId: string }
  | { kind: 'project-document'; projectId: string; documentPath: string };

export interface MarkdownPagePrdSaveRequest {
  url: string;
  init: {
    method: 'PUT';
    headers: { 'Content-Type': 'application/json' };
    body: string;
  };
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeMarkdownDraftPath(value: unknown): string {
  const segments: string[] = [];
  for (const segment of String(value ?? '').replace(/\\/gu, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return '';
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

export function resolveMarkdownDraftIdentity(
  documentUrl: string | undefined,
  baseUrl = 'http://localhost',
): MarkdownDraftIdentity | null {
  if (!documentUrl) return null;

  let url: URL;
  try {
    url = new URL(documentUrl, baseUrl);
  } catch {
    return null;
  }

  if (url.pathname === PAGE_PRD_API_PATH) {
    const projectId = String(url.searchParams.get('projectId') || '').trim();
    const targetPath = normalizeMarkdownDraftPath(url.searchParams.get('targetPath'));
    const pageId = String(url.searchParams.get('pageId') || '').trim();
    if (!projectId || !targetPath || !pageId) return null;
    return { kind: 'prototype-page-prd', projectId, targetPath, pageId };
  }

  const documentContentMatch = url.pathname.match(PROJECT_DOCUMENT_CONTENT_PATH_RE);
  if (documentContentMatch) {
    const projectId = decodePathSegment(documentContentMatch[1]).trim();
    const documentPath = normalizeMarkdownDraftPath(url.searchParams.get('path'));
    if (!projectId || !documentPath) return null;
    return { kind: 'project-document', projectId, documentPath };
  }

  const pathContentMatch = url.pathname.match(PROJECT_DOCUMENT_PATH_CONTENT_RE);
  if (pathContentMatch) {
    const projectId = decodePathSegment(pathContentMatch[1]).trim();
    const resourcePath = normalizeMarkdownDraftPath(decodePathSegment(pathContentMatch[2]));
    if (!projectId || !resourcePath) return null;
    const markdownPath = /\.md$/iu.test(resourcePath) ? resourcePath : `${resourcePath}.md`;
    return { kind: 'project-document', projectId, documentPath: `src/resources/${markdownPath}` };
  }

  return null;
}

export function getMarkdownDraftStorageKey(
  documentUrl: string | undefined,
  documentKey: string,
  baseUrl = 'http://localhost',
): string | null {
  if (!documentUrl) {
    return `${SPEC_DRAFT_STORAGE_PREFIX}${encodeURIComponent(documentKey || 'default')}`;
  }

  let url: URL;
  try {
    url = new URL(documentUrl, baseUrl);
  } catch {
    return `${SPEC_DRAFT_STORAGE_PREFIX}${encodeURIComponent(documentUrl || documentKey || 'default')}`;
  }

  const identity = resolveMarkdownDraftIdentity(documentUrl, baseUrl);
  if (identity) {
    return `${SPEC_DRAFT_STORAGE_PREFIX}v2:${encodeURIComponent(JSON.stringify(identity))}`;
  }

  if (
    url.pathname === PAGE_PRD_API_PATH
    || PROJECT_DOCUMENT_CONTENT_PATH_RE.test(url.pathname)
    || PROJECT_DOCUMENT_PATH_CONTENT_RE.test(url.pathname)
  ) {
    // These endpoints need explicit project and resource identities; don't fall back to an ambiguous legacy cache key.
    return null;
  }

  const legacyIdentity = url.pathname || documentKey || 'default';
  return `${SPEC_DRAFT_STORAGE_PREFIX}${encodeURIComponent(legacyIdentity)}`;
}

export function isPrototypePagePrdUrl(documentUrl: string | undefined, baseUrl = 'http://localhost'): boolean {
  const identity = resolveMarkdownDraftIdentity(documentUrl, baseUrl);
  return identity?.kind === 'prototype-page-prd';
}

export function readMarkdownDraft(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  key: string,
  documentUrl: string | undefined,
  baseUrl: string,
): string | null {
  const current = storage.getItem(key);
  if (current !== null || !documentUrl) return current;
  const url = new URL(documentUrl, baseUrl);
  if (!PROJECT_DOCUMENT_PATH_CONTENT_RE.test(url.pathname)) return null;
  // The resource route encoded both project and file in the old pathname.
  const previousKey = `${SPEC_DRAFT_STORAGE_PREFIX}${encodeURIComponent(url.pathname)}`;
  const previous = storage.getItem(previousKey);
  if (previous !== null) {
    storage.setItem(key, previous);
    storage.removeItem(previousKey);
  }
  return previous;
}

export function buildPrototypePagePrdSaveRequest(
  documentUrl: string,
  content: string,
  baseUrl = 'http://localhost',
): MarkdownPagePrdSaveRequest | null {
  let url: URL;
  try {
    url = new URL(documentUrl, baseUrl);
  } catch {
    return null;
  }
  if (url.pathname !== PAGE_PRD_API_PATH) return null;

  return {
    url: `${url.pathname}${url.search}`,
    init: {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  };
}
