import { describe, expect, it } from 'vitest';
import {
  buildPrototypePagePrdSaveRequest,
  getMarkdownDraftStorageKey,
  isPrototypePagePrdUrl,
  normalizeMarkdownDraftPath,
  readMarkdownDraft,
  resolveMarkdownDraftIdentity,
} from './markdownDraftIdentity';

describe('Markdown draft identity', () => {
  it('uses project and normalized full path for project document content URLs', () => {
    const url = '/api/projects/project%20one/document-content?path=src%5Cprototypes%2Fhome%2Fdocs%2F..%2Fprd.md';

    expect(resolveMarkdownDraftIdentity(url)).toEqual({
      kind: 'project-document',
      projectId: 'project one',
      documentPath: 'src/prototypes/home/prd.md',
    });
    expect(getMarkdownDraftStorageKey(url, 'default')).toBe(
      getMarkdownDraftStorageKey('/api/projects/project%20one/document-content?path=src/prototypes/home/prd.md', 'default'),
    );
    expect(getMarkdownDraftStorageKey(url, 'default')).not.toBe(
      getMarkdownDraftStorageKey('/api/projects/project-two/document-content?path=src/prototypes/home/prd.md', 'default'),
    );
    expect(getMarkdownDraftStorageKey(url, 'default')).not.toBe(
      getMarkdownDraftStorageKey('/api/projects/project%20one/document-content?path=src/prototypes/other/prd.md', 'default'),
    );
  });

  it('uses explicit project, prototype path, and page ID for embedded page PRDs', () => {
    const validUrl = '/api/prototype-annotation/page-prd?projectId=project-a&targetPath=prototypes%2Fcheckout&pageId=payment';

    expect(resolveMarkdownDraftIdentity(validUrl)).toEqual({
      kind: 'prototype-page-prd',
      projectId: 'project-a',
      targetPath: 'prototypes/checkout',
      pageId: 'payment',
    });
    expect(isPrototypePagePrdUrl(validUrl)).toBe(true);
    expect(getMarkdownDraftStorageKey(validUrl, 'default')).not.toBe(
      getMarkdownDraftStorageKey(validUrl.replace('pageId=payment', 'pageId=summary'), 'default'),
    );
    expect(getMarkdownDraftStorageKey(validUrl, 'default')).not.toBe(
      getMarkdownDraftStorageKey(validUrl.replace('projectId=project-a', 'projectId=project-b'), 'default'),
    );
    expect(getMarkdownDraftStorageKey(validUrl, 'default')).not.toBe(
      getMarkdownDraftStorageKey(validUrl.replace('targetPath=prototypes%2Fcheckout', 'targetPath=prototypes%2Fsettings'), 'default'),
    );
  });

  it('normalizes document paths and rejects traversal above the project root', () => {
    expect(normalizeMarkdownDraftPath('\\src\\prototypes\\home//docs/../prd.md')).toBe('src/prototypes/home/prd.md');
    expect(normalizeMarkdownDraftPath('../../private.md')).toBe('');
  });

  it('does not fall back to ambiguous caches when a scoped endpoint lacks identity fields', () => {
    expect(getMarkdownDraftStorageKey('/api/projects/project-a/document-content', 'default')).toBeNull();
    expect(getMarkdownDraftStorageKey('/api/prototype-annotation/page-prd?projectId=project-a', 'default')).toBeNull();
    expect(isPrototypePagePrdUrl('/api/prototype-annotation/page-prd?projectId=project-a')).toBe(false);
  });

  it('saves page PRD content back to the same endpoint with PUT', () => {
    expect(buildPrototypePagePrdSaveRequest(
      '/api/prototype-annotation/page-prd?projectId=project-a&targetPath=prototypes%2Fhome&pageId=home',
      '# Home PRD',
    )).toEqual({
      url: '/api/prototype-annotation/page-prd?projectId=project-a&targetPath=prototypes%2Fhome&pageId=home',
      init: {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Home PRD' }),
      },
    });
    expect(buildPrototypePagePrdSaveRequest('/api/projects/project-a/document-content?path=prd.md', 'x')).toBeNull();
  });

  it('preserves path-based draft storage for non-project Markdown documents', () => {
    expect(getMarkdownDraftStorageKey('/api/docs/readme.md?projectId=ignored', 'default')).toBe(
      'axhub-spec-draft:%2Fapi%2Fdocs%2Freadme.md',
    );
  });

  it('normalizes the project document path endpoint form as well', () => {
    const url = '/api/projects/project-a/docs/home%2Fprd/content';
    expect(resolveMarkdownDraftIdentity(url)).toEqual({
      kind: 'project-document',
      projectId: 'project-a',
      documentPath: 'src/resources/home/prd.md',
    });
    expect(getMarkdownDraftStorageKey(url, 'default')).toBe(getMarkdownDraftStorageKey(
      '/api/projects/project-a/document-content?path=src%2Fresources%2Fhome%2Fprd.md', 'default',
    ));
  });

  it('migrates a legacy key only when its pathname identifies both the project and file', () => {
    const origin = 'http://localhost';
    const resource = '/api/projects/p/docs/readme/content';
    const content = '/api/projects/p/document-content?path=src%2Fresources%2Fa.md';
    const resourceLegacy = 'axhub-spec-draft:%2Fapi%2Fprojects%2Fp%2Fdocs%2Freadme%2Fcontent';
    const ambiguousLegacy = 'axhub-spec-draft:%2Fapi%2Fprojects%2Fp%2Fdocument-content';
    const caches = new Map([[resourceLegacy, 'known'], [ambiguousLegacy, 'unknown']]);
    const storage = {
      getItem: (key: string) => caches.get(key) ?? null,
      setItem: (key: string, value: string) => { caches.set(key, value); },
      removeItem: (key: string) => { caches.delete(key); },
    };
    const resourceKey = getMarkdownDraftStorageKey(resource, 'default')!;
    const contentKey = getMarkdownDraftStorageKey(content, 'default')!;
    expect(readMarkdownDraft(storage, contentKey, content, origin)).toBeNull();
    expect(readMarkdownDraft(storage, resourceKey, resource, origin)).toBe('known');
    expect(caches.get(resourceKey)).toBe('known');
    expect(caches.has(resourceLegacy)).toBe(false);
    expect(caches.get(ambiguousLegacy)).toBe('unknown');
  });
});
