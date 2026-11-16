import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorSummariesService } from '../../../vendor/axhub-commentary/src/core/editor/summaries';
import { createEditorRuntimeState, type ElementEditMeta } from '../../../vendor/axhub-commentary/src/core/editor/state';
import type {
  PrototypeEditCommentEntry,
  PrototypeEditCommentsDocument,
} from '../../../vendor/axhub-commentary/src/web-editor-types';

const targetPath = 'prototypes/approval';
const pageA = `${targetPath}::page::list`;
const pageB = `${targetPath}::page::detail`;
const locator = { selectors: ['#title'], fingerprint: 'h1', path: [0] };

function comment(
  id: string,
  pageScope?: string,
  overrides: Partial<PrototypeEditCommentEntry> = {},
): PrototypeEditCommentEntry {
  return { id, pageScope, locator, state: 'idle', comment: `note-${id}`, ...overrides };
}

function createPromptGenerator(pageScope: string, document: Partial<PrototypeEditCommentsDocument>) {
  const state = createEditorRuntimeState();
  const service = createEditorSummariesService({
    state,
    getResourceContext: () => ({
      kind: 'prototype-entry',
      id: targetPath,
      path: targetPath,
      meta: { commentPageScope: pageScope },
    }),
    getPersistedPrototypeCommentsDocument: () => ({
      schemaVersion: 3,
      kind: 'prototype-edit-comments',
      resource: { id: targetPath, targetPath, filePath: 'comments.json' },
      comments: [],
      images: [],
      ...document,
    }),
  });
  return { state, copy: () => service.buildCopyPrompt('current-page') };
}

function runtimeNote(commentId: string, note: string): ElementEditMeta {
  return {
    commentId, note, locator, elementKey: commentId, label: '审批标题', anchor: null,
    images: [], dirtySince: 1, changeKinds: [], styleSummaryLines: [],
    textSummary: null, classSummaryLines: [],
  };
}

describe('copying current-page prototype comments', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { querySelectorAll: () => [], querySelector: () => null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the selected page even when both pages have the same element locator', () => {
    const document = {
      comments: [comment('list', pageA), comment('detail', pageB)],
      images: [
        { id: 'list-image', commentId: 'list', pageScope: pageA, assetPath: 'list.png' },
        { id: 'list-shot', commentId: 'list', pageScope: pageA, source: 'target-screenshot' as const, assetPath: 'list-shot.png' },
        { id: 'detail-image', commentId: 'detail', pageScope: pageB, assetPath: 'detail.png' },
        { id: 'wrong-page', commentId: 'list', pageScope: pageB, assetPath: 'wrong.png' },
        { id: 'deleted', commentId: 'list', pageScope: pageA, assetPath: 'deleted.png', deletedAt: 1 },
      ],
    };
    const listPrompt = createPromptGenerator(pageA, document).copy();
    expect(listPrompt).toContain(pageA);
    expect(listPrompt).toContain('note-list');
    expect(listPrompt).toContain('list.png');
    expect(listPrompt).toContain('list-shot.png');
    expect(listPrompt).not.toMatch(/note-detail|detail\.png|wrong\.png|deleted\.png/);

    const detailPrompt = createPromptGenerator(pageB, document).copy();
    expect(detailPrompt).toContain(pageB);
    expect(detailPrompt).toContain('note-detail');
    expect(detailPrompt).toContain('detail.png');
    expect(detailPrompt).not.toMatch(/note-list|list\.png/);
    expect(createPromptGenerator(`${targetPath}::page::empty`, document).copy()).toBe('');
  });

  it('keeps saved items alongside newer in-memory edits and excludes unavailable records', () => {
    const { state, copy } = createPromptGenerator(pageA, {
      comments: [
        comment('saved', pageA, { state: 'error' }),
        comment('edited', pageA),
        comment('deleted', pageA, { deletedAt: 1 }),
        comment('editing', pageA, { state: 'editing' }),
        comment('completed', pageA, { state: 'completed' }),
        comment('unknown'),
      ],
    });
    state.editMetaByKey.set('edited', runtimeNote('edited', 'updated text'));
    state.editMetaByKey.set('unknown', runtimeNote('unknown', 'ambiguous restored text'));
    state.editMetaByKey.set('editing', runtimeNote('editing', 'currently editing text'));
    const prompt = copy();
    expect(prompt).toContain('note-saved');
    expect(prompt).toContain('updated text');
    expect(prompt).not.toMatch(/note-(edited|deleted|editing|completed|unknown)|ambiguous restored text|currently editing text/);
    expect(prompt.match(/批注 ID: edited/g)).toHaveLength(1);
  });

  it('keeps legacy unscoped notes on the resource-level preview', () => {
    expect(createPromptGenerator(`/${targetPath}`, {
      comments: [comment('legacy'), comment('detail', pageB)],
    }).copy()).toContain('note-legacy');
  });
});
