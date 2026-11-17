import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ComponentProps } from '@ant-design/x-markdown';
import { XProvider } from '@ant-design/x';
import zhCN_X from '@ant-design/x/locale/zh_CN';
import { ConfigProvider, Anchor, Button, Modal, Space, Tabs } from 'antd';
import {
    createCommentary,
    type CommentaryApi,
    type CommentaryHostToolbarAction,
    type CommentaryHostToolbarState,
    type CommentaryToolbarMode,
} from '@axhub/commentary';
import type { UploadFunction } from 'tiptap-editor';
import { defaultThemeConfig } from '../theme';
import type { AssistantContextV1 } from '@/common/assistant-context/types';
import { ReadOnlyMarkdown } from '../common/markdown/ReadOnlyMarkdown';
import { resolveMarkdownImageSrc } from '../common/markdown/markdownImage';
import {
    buildMarkdownCommentPrompt,
    buildPrototypeSpecMarkdownSaveRequest,
    resolveMarkdownQuickEditMeta,
    shouldIgnoreInitialMarkdownEditorChange,
    syncDocumentCommentaryForMode,
    type MarkdownQuickEditMeta,
} from './quickEdit';
import {
    createDocumentCommentsPersistenceAdapter,
    createDocumentCommentsPersistenceScope,
    type DocumentCommentContext,
} from '../common/documentCommentsPersistence';
import {
    resolveMarkdownDocumentLinkTarget,
    resolvePrototypeSpecResourceUrl,
    stripMarkdownPreviewFrontmatter,
} from './previewMarkdownContent';
import {
    buildPrototypePagePrdSaveRequest,
    getMarkdownDraftStorageKey,
    readMarkdownDraft,
} from './markdownDraftIdentity';
import { PrdMarkdownEditor } from './PrdMarkdownEditor';
import {
    createEmbeddedDocumentMessage,
    isMatchingEmbeddedDocumentCloseRequest,
    normalizeEmbeddedParentOrigin,
    readEmbeddedPagePrdRefresh,
    resolveEmbeddedMarkdownDocumentContext,
    resolveEmbeddedPagePrdRefresh,
    type EmbeddedDocumentCloseRequest,
    type EmbeddedDocumentCloseReason,
    type EmbeddedMarkdownDocumentContext,
} from './embeddedMarkdownDocument';

export interface MarkdownDocument {
    key: string;
    label: string;
    content: string;
    url?: string;
}

interface MarkdownViewerProps {
    content?: string;
    documentUrl?: string;
    documents?: MarkdownDocument[];
    embeddedDocument?: 'page' | 'ordinary';
    documentId?: string;
    pageId?: string;
    returnPath?: string;
    parentOrigin?: string;
    onDocumentChange?: (document: MarkdownDocument | null) => void;
}

interface HeadingItem {
    id: string;
    title: string;
    level: number;
    children?: HeadingItem[];
}

type SpecQuickEditMode = 'none' | 'comment' | 'edit';

const MAKE_COMMENTARY_SKILL_INSTALL_SOURCE = [
    '.agents/skills/explore-options/SKILL.md',
    '.claude/skills/explore-options/SKILL.md',
    '.workbuddy/skills/explore-options/SKILL.md',
    '.agents/skills/handle-comments/SKILL.md',
    '.claude/skills/handle-comments/SKILL.md',
    '.workbuddy/skills/handle-comments/SKILL.md',
].join('\n');

interface SpecPromptRequestResult {
    prompt: string;
    targetPath?: string;
    context?: AssistantContextV1;
}

export interface MarkdownViewerHandle {
    enableQuickEdit: () => void;
    disableQuickEdit: (options?: { discardChanges?: boolean }) => void;
    enableDocumentEditor: (options?: {
        toolbarMode?: CommentaryToolbarMode;
        quickEditMode?: 'comment' | 'edit';
        initialDarkMode?: boolean;
        assistantPanelOpen?: boolean;
    }) => void;
    disableDocumentEditor: () => void;
    getHostToolbarState: () => CommentaryHostToolbarState | null;
    subscribeHostToolbarState: (listener: (state: CommentaryHostToolbarState) => void) => () => void;
    runHostToolbarAction: (action: CommentaryHostToolbarAction) => Promise<boolean>;
    getDebugState: () => unknown | null;
    getVoiceTarget: () => unknown | null;
    refreshPersistedComments: (deletedCommentIds?: readonly string[]) => Promise<void>;
    setContext: (context: DocumentCommentContext | null) => void;
    setQuickEditMode: (mode: 'comment' | 'edit', options?: { saveBehavior?: 'none' | 'save' | 'discard' }) => Promise<boolean>;
    getQuickEditStatus: () => {
        enabled: boolean;
        dirty: boolean;
        saving: boolean;
        dirtyCount: number;
        activeDocKey: string;
        quickEditMode: SpecQuickEditMode;
    };
    getCopyPromptText: () => string;
    handleCopyPrompt: () => Promise<SpecPromptRequestResult>;
    saveCurrentDoc: (options?: {
        exitAfterSave?: boolean;
        suppressNoChangeNotice?: boolean;
        suppressSuccessNotice?: boolean;
    }) => Promise<boolean>;
}

const SPEC_EDIT_QUERY_KEY = 'specEdit';
const SPEC_DRAFT_DEBOUNCE_MS = 650;
const PROJECT_DOCUMENT_CONTENT_PATH_RE = /^\/api\/projects\/[^/]+\/docs\/.+\/content$/iu;
const PROJECT_DOCUMENT_PATH_CONTENT_RE = /^\/api\/projects\/[^/]+\/document-content$/iu;
const MARKDOWN_DOCS_BROADCAST_CHANNEL = 'axhub-markdown-docs';

function resolveAxhubDisplayNameFromLocation(): string {
    if (typeof window === 'undefined') return '';
    try {
        return new URL(window.location.href).searchParams.get('axhubDisplayName')?.trim() ?? '';
    } catch {
        return '';
    }
}

function buildContextCurrentFileDisplayName(meta: MarkdownQuickEditMeta, fallbackLabel?: string): string {
    const displayName = resolveAxhubDisplayNameFromLocation()
        || String(fallbackLabel || '').trim()
        || String(meta.entryName || '').trim();
    if (!displayName) return '';
    if (meta.docType === 'spec' || meta.docType === 'prd') {
        return `${displayName} ${meta.docType}`;
    }
    return displayName;
}

function buildDocApiPath(docName: string): string {
    const normalizedName = String(docName || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/');

    if (!normalizedName) {
        return '/api/docs';
    }

    if (normalizedName === 'templates' || normalizedName.startsWith('templates/')) {
        const templateName = normalizedName === 'templates'
            ? ''
            : normalizedName.slice('templates/'.length);
        return templateName
            ? `/api/docs/templates/${encodeURIComponent(templateName)}`
            : '/api/docs/templates';
    }

    return `/api/docs/${encodeURIComponent(normalizedName)}`;
}

function ensureMarkdownExtension(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
}

function normalizeRequestedQuickEditMode(value: unknown): 'comment' | 'edit' {
    return value === 'edit' ? 'edit' : 'comment';
}

const markdownStyles = `
  body {
    background: #fff;
  }
  .markdown-container {
    display: flex;
    gap: 40px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px;
    position: relative;
    align-items: flex-start;
  }
  .markdown-content {
    flex: 1;
    min-width: 0;
  }
  .markdown-content > div {
    padding: 24px;
  }
  .anchor-sidebar {
    width: 240px;
    flex-shrink: 0;
    position: sticky;
    top: 40px;
  }
  .anchor-sidebar-scroll {
    max-height: calc(100vh - 88px);
    overflow-y: auto;
    padding-right: 8px;
  }
  .anchor-sidebar-scroll .ant-anchor-wrapper {
    max-height: none !important;
  }
  @media (max-width: 1200px) {
    .anchor-sidebar {
      display: none;
    }
  }
  .ant-anchor-link-title {
    font-size: 12px;
  }
  .markdown-tabs-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 24px 0;
  }
  .markdown-tabs-container .ant-tabs-nav {
    margin-bottom: 0;
  }
  .spec-editor-shell {
    min-height: calc(100vh - 170px);
  }
  .spec-editor-shell .simple-editor-wrapper {
    width: 100%;
    min-height: calc(100vh - 230px);
    height: auto;
    overflow: visible;
  }
  .spec-editor-shell .simple-editor-content {
    max-width: 100%;
    width: 100%;
    min-height: calc(100vh - 230px);
  }
  .spec-editor-shell .simple-editor-content .tiptap.ProseMirror.simple-editor {
    min-height: calc(100vh - 320px);
    padding: 1.5rem 1.5rem 22vh;
  }
  .spec-editor-shell .tiptap-toolbar {
    top: 0;
    bottom: auto !important;
    position: sticky;
    border-radius: 8px;
    z-index: 24;
    margin-bottom: 12px;
    width: 100%;
    max-width: 100%;
  }
  @media (max-width: 768px) {
    .spec-editor-shell .simple-editor-content .tiptap.ProseMirror.simple-editor {
      padding: 1rem 1rem 26vh;
    }
  }
`;

function generateId(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function extractHeadings(content: string): HeadingItem[] {
    const headings: HeadingItem[] = [];
    const lines = content.split('\n');
    const stack: HeadingItem[] = [];

    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (!match) {
            continue;
        }

        const level = match[1].length;
        const title = match[2].trim();
        const id = generateId(title);
        const heading: HeadingItem = { id, title, level };

        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        if (stack.length === 0) {
            headings.push(heading);
        } else {
            const parent = stack[stack.length - 1];
            if (!parent.children) {
                parent.children = [];
            }
            parent.children.push(heading);
        }

        stack.push(heading);
    }

    return headings;
}

function buildAnchorItems(headings: HeadingItem[]): any[] {
    return headings.map((heading) => ({
        key: heading.id,
        href: `#${heading.id}`,
        title: heading.title,
        children: heading.children ? buildAnchorItems(heading.children) : undefined,
    }));
}

const createHeading = (level: number) => {
    const HeadingComponent: React.FC<ComponentProps> = (props) => {
        const { children } = props;
        const text = typeof children === 'string' ? children : '';
        const id = generateId(text);
        const Tag = `h${level}` as keyof JSX.IntrinsicElements;

        return <Tag id={id}>{children}</Tag>;
    };
    return HeadingComponent;
};

function getSpecDraftStorageKey(doc: MarkdownDocument): string | null {
    return getMarkdownDraftStorageKey(
        doc.url,
        doc.key || doc.label || 'default',
        typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
    );
}

function readSpecDraft(doc: MarkdownDocument): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const key = getSpecDraftStorageKey(doc);
        return key ? readMarkdownDraft(window.localStorage, key, doc.url, window.location.origin) : null;
    } catch {
        return null;
    }
}

function writeSpecDraft(doc: MarkdownDocument, content: string) {
    if (typeof window === 'undefined') return;
    try {
        const key = getSpecDraftStorageKey(doc);
        if (key) window.localStorage.setItem(key, content);
    } catch {
        // ignore cache write failures
    }
}

function removeSpecDraft(doc: MarkdownDocument) {
    if (typeof window === 'undefined') return;
    try {
        const key = getSpecDraftStorageKey(doc);
        if (key) window.localStorage.removeItem(key);
    } catch {
        // ignore cache remove failures
    }
}

function parseQuickEditModeFromUrl(embeddedMode?: 'page' | 'ordinary'): SpecQuickEditMode {
    if (embeddedMode) return 'edit';
    if (typeof window === 'undefined') return 'none';
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'edit') {
            return 'edit';
        }
        if (params.get('editor') === 'specComment') {
            return 'comment';
        }
        const value = params.get(SPEC_EDIT_QUERY_KEY) ?? params.get('edit');
        if (!value) return 'none';
        return value === '1' || value.toLowerCase() === 'true' ? 'comment' : 'none';
    } catch {
        return 'none';
    }
}

function resolveSavedMarkdownFilePath(docUrl: string | undefined): string {
    if (!docUrl || typeof window === 'undefined') return '';
    try {
        const parsedUrl = new URL(docUrl, window.location.origin);
        return parsedUrl.pathname === '/api/markdown-file'
            ? String(parsedUrl.searchParams.get('path') || '').trim()
            : '';
    } catch {
        return '';
    }
}

function broadcastMarkdownFileSaved(payload: {
    type: 'markdown-file-saved';
    path: string;
    updatedAt: number;
}) {
    if (!payload.path || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(MARKDOWN_DOCS_BROADCAST_CHANNEL);
    try {
        channel.postMessage(payload);
    } finally {
        channel.close();
    }
}

function syncSpecEditQuery(editing: boolean) {
    if (typeof window === 'undefined') return;
    try {
        const url = new URL(window.location.href);
        const current = url.searchParams.get(SPEC_EDIT_QUERY_KEY);
        if (editing) {
            if (current !== '1') {
                url.searchParams.set(SPEC_EDIT_QUERY_KEY, '1');
            }
            window.history.replaceState(null, '', url.toString());
            return;
        }
        if (current !== null) {
            url.searchParams.delete(SPEC_EDIT_QUERY_KEY);
            window.history.replaceState(null, '', url.toString());
        }
    } catch {
        // ignore URL sync failures
    }
}

function postToParent(data: Record<string, any>, context?: EmbeddedMarkdownDocumentContext | null): boolean {
    if (window.parent !== window) {
        const params = new URLSearchParams(window.location.search);
        const queryMode = params.get('embeddedDocument');
        const isEmbedded = Boolean(context) || queryMode === 'page' || queryMode === 'ordinary';
        if (isEmbedded) {
            const parentOrigin = context?.parentOrigin ?? normalizeEmbeddedParentOrigin(params.get('parentOrigin'));
            if (!parentOrigin) return false;
            window.parent.postMessage(data, parentOrigin);
            return true;
        }
        window.parent.postMessage(data, '*');
        return true;
    }
    return false;
}

function toSavedContentMap(docs: MarkdownDocument[]) {
    return docs.reduce<Record<string, string>>((acc, doc) => {
        acc[doc.key] = doc.content || '';
        return acc;
    }, {});
}

export const MarkdownViewer = React.forwardRef<MarkdownViewerHandle, MarkdownViewerProps>(function MarkdownViewer(
    {
        content,
        documentUrl,
        documents,
        embeddedDocument,
        documentId,
        pageId,
        returnPath,
        parentOrigin,
        onDocumentChange,
    }: MarkdownViewerProps,
    ref,
) {
    const embeddedContext = useMemo(() => resolveEmbeddedMarkdownDocumentContext({
        mode: embeddedDocument,
        documentId,
        pageId,
        returnPath,
        parentOrigin,
        search: typeof window === 'undefined' ? '' : window.location.search,
    }), [documentId, embeddedDocument, pageId, parentOrigin, returnPath]);
    const normalizedDocuments = useMemo<MarkdownDocument[]>(() => {
        if (documents && documents.length > 0) {
            return documents;
        }
        return [
            {
                key: 'default',
                label: '文档',
                content: content || '',
                url: documentUrl,
            },
        ];
    }, [content, documentUrl, documents]);

    const [localDocuments, setLocalDocuments] = useState<MarkdownDocument[]>(normalizedDocuments);
    const [savedContents, setSavedContents] = useState<Record<string, string>>(() => toSavedContentMap(normalizedDocuments));
    const [activeKey, setActiveKey] = useState<string>(normalizedDocuments[0]?.key || 'default');
    const [quickEditMode, setQuickEditModeState] = useState<SpecQuickEditMode>(() => parseQuickEditModeFromUrl(embeddedContext?.mode));
    const [isSaving, setIsSaving] = useState(false);
    const [externalPagePrdChanged, setExternalPagePrdChanged] = useState(false);
    const [embeddedFeedback, setEmbeddedFeedback] = useState<{ level: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [pendingEmbeddedClose, setPendingEmbeddedClose] = useState<EmbeddedDocumentCloseRequest | null>(null);
    const [modal, modalContextHolder] = Modal.useModal();
    const localDocumentsRef = useRef(localDocuments);
    const savedContentsRef = useRef(savedContents);
    const currentDocRef = useRef<MarkdownDocument | undefined>(undefined);
    const documentContextRef = useRef<DocumentCommentContext | null>(null);
    const quickEditModeRef = useRef<SpecQuickEditMode>(quickEditMode);
    const draftPersistTimerRef = useRef<number | null>(null);
    const draftPromptedDocKeysRef = useRef<Set<string>>(new Set());
    const draftConfirmingDocKeyRef = useRef<string | null>(null);
    const commentEditorRef = useRef<CommentaryApi | null>(null);
    const commentEditorDarkModeRef = useRef(false);
    const commentEditorAssistantPanelOpenRef = useRef(false);
    const editorUserChangedDocKeysRef = useRef<Set<string>>(new Set());
    const currentDoc = useMemo(
        () => localDocuments.find((doc) => doc.key === activeKey) || localDocuments[0],
        [localDocuments, activeKey],
    );
    const isQuickEditing = quickEditMode !== 'none';
    const isEditing = quickEditMode === 'edit';
    const isCommentMode = quickEditMode === 'comment';

    const resolveCurrentDocumentImageSrc = useCallback((src: string) => (
        resolveMarkdownImageSrc(src, currentDocRef.current?.url)
    ), []);

    const clearPendingDraftPersist = useCallback(() => {
        if (draftPersistTimerRef.current !== null) {
            window.clearTimeout(draftPersistTimerRef.current);
            draftPersistTimerRef.current = null;
        }
    }, []);

    const clearDraftForDoc = useCallback((doc: MarkdownDocument | undefined) => {
        if (!doc) return;
        removeSpecDraft(doc);
    }, []);

    const clearDraftForAllDocs = useCallback(() => {
        localDocumentsRef.current.forEach((doc) => removeSpecDraft(doc));
    }, []);

    const clearDraftsForCurrentScope = useCallback(() => {
        if (embeddedContext) {
            clearDraftForDoc(currentDocRef.current);
            return;
        }
        clearDraftForAllDocs();
    }, [clearDraftForAllDocs, clearDraftForDoc, embeddedContext]);

    const flushDraftsNow = useCallback((force = false) => {
        clearPendingDraftPersist();
        if (!force && quickEditModeRef.current !== 'edit') return;

        const docs = localDocumentsRef.current;
        const savedMap = savedContentsRef.current;
        docs.forEach((doc) => {
            const saved = savedMap[doc.key] || '';
            const current = doc.content || '';
            if (saved === current) {
                const existingDraft = embeddedContext?.mode === 'page' ? readSpecDraft(doc) : null;
                if (existingDraft && existingDraft !== current) return;
                removeSpecDraft(doc);
                return;
            }
            writeSpecDraft(doc, current);
        });
    }, [clearPendingDraftPersist, embeddedContext?.mode]);

    const buildCommentResourceContext = useCallback((doc: MarkdownDocument | undefined) => {
        if (!doc) return null;
        const meta = resolveMarkdownQuickEditMeta(doc.url);
        const explicitContext = documentContextRef.current;
        const targetPath = explicitContext?.documentPath || meta.docPath;
        return {
            kind: 'markdown-document',
            id: meta.docPath || doc.url || doc.key,
            path: targetPath || undefined,
            url: typeof window !== 'undefined' ? window.location.href : doc.url,
            meta: {
                resourceKind: meta.resourceKind,
                entryType: meta.entryType,
                entryName: meta.entryName,
                docType: meta.docType,
                targetPath,
                currentFilePath: targetPath,
                docPath: targetPath,
                prototypeFilePath: meta.prototypePath,
                storageScope: targetPath
                    ? `document:${targetPath}`
                    : `markdown-doc:${doc.key}`,
                ...(explicitContext?.projectId ? { projectId: explicitContext.projectId } : {}),
            },
        };
    }, []);

    const ensureCommentEditor = useCallback((options?: {
        initialDarkMode?: boolean;
        assistantPanelOpen?: boolean;
    }) => {
        const initialDarkMode = Boolean(options?.initialDarkMode ?? commentEditorDarkModeRef.current);
        if (typeof options?.assistantPanelOpen === 'boolean') {
            commentEditorAssistantPanelOpenRef.current = options.assistantPanelOpen;
        }
        if (commentEditorRef.current && commentEditorDarkModeRef.current === initialDarkMode) {
            commentEditorRef.current.refresh?.();
            return commentEditorRef.current;
        }

        commentEditorRef.current?.destroy();
        const editor = createCommentary({
            interactionProfile: 'text-comment',
            ui: {
                toolbarMode: 'host',
                initialSelectionModeActive: false,
                hideExecutionControls: true,
                initialDarkMode,
                getAssistantPanelOpen: () => commentEditorAssistantPanelOpenRef.current,
                skillInstallSource: MAKE_COMMENTARY_SKILL_INSTALL_SOURCE,
            },
            host: {
                getResourceContext: () => buildCommentResourceContext(currentDocRef.current),
                getCurrentHoveredElement: () => document.querySelector(':hover'),
                getPersistenceScope: () => {
                    const context = documentContextRef.current;
                    return context
                        ? createDocumentCommentsPersistenceScope(
                            context,
                            buildCommentResourceContext(currentDocRef.current),
                        )
                        : null;
                },
                persistenceAdapter: createDocumentCommentsPersistenceAdapter(
                    () => documentContextRef.current,
                ),
                commentPersistenceMode: 'adapter-only',
            },
        });
        commentEditorRef.current = editor;
        commentEditorDarkModeRef.current = initialDarkMode;
        return editor;
    }, [buildCommentResourceContext]);

    const stopCommentEditor = useCallback(() => {
        commentEditorRef.current?.stop();
    }, []);

    const buildCommentPromptPayload = useCallback((): SpecPromptRequestResult => {
        if (!currentDoc) {
            throw new Error('当前没有可用文档');
        }

        const editor = commentEditorRef.current;
        if (!editor) {
            throw new Error('批注编辑器尚未就绪');
        }

        const snapshot = editor.getEditedSnapshot();
        if (!snapshot.modifiedElements.length) {
            throw new Error('当前没有可生成 Prompt 的批注');
        }

        const { prompt, targetPath, meta } = buildMarkdownCommentPrompt({
            docLabel: currentDoc.label,
            docUrl: currentDoc.url,
            modifiedElements: snapshot.modifiedElements.map((item) => ({
                label: item.label,
                note: item.note,
                imageCount: item.imageCount,
                changeKinds: item.changeKinds.filter((kind) => kind === 'text' || kind === 'style' || kind === 'class') as Array<'text' | 'style' | 'class'>,
                locator: item.locator,
            })),
        });

        return {
            prompt,
            targetPath: targetPath || meta.docPath || '',
            context: {
                version: '1',
                systemContext: '',
                currentFile: {
                    path: meta.docPath || targetPath || '',
                    displayName: buildContextCurrentFileDisplayName(meta, currentDoc.label),
                },
                selectedElements: [],
                extensions: {
                    source: 'spec-comment-editor',
                    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
                    docLabel: currentDoc.label,
                    docUrl: currentDoc.url || '',
                    resourceKind: meta.resourceKind,
                    docPath: meta.docPath,
                    prototypePath: meta.prototypePath,
                    entryType: meta.entryType,
                    entryName: meta.entryName,
                    docType: meta.docType,
                    updatedAt: new Date().toISOString(),
                },
            },
        };
    }, [currentDoc]);

    useEffect(() => {
        setLocalDocuments(normalizedDocuments);
        setSavedContents(toSavedContentMap(normalizedDocuments));
        draftPromptedDocKeysRef.current.clear();
        draftConfirmingDocKeyRef.current = null;
        setActiveKey((previous) => {
            if (normalizedDocuments.some((doc) => doc.key === previous)) {
                return previous;
            }
            return normalizedDocuments[0]?.key || 'default';
        });
        setQuickEditModeState(parseQuickEditModeFromUrl(embeddedContext?.mode));
        setIsSaving(false);
        setPendingEmbeddedClose(null);
        setExternalPagePrdChanged(false);
    }, [embeddedContext?.mode, normalizedDocuments]);

    useEffect(() => {
        localDocumentsRef.current = localDocuments;
    }, [localDocuments]);

    useEffect(() => {
        savedContentsRef.current = savedContents;
    }, [savedContents]);

    useEffect(() => {
        quickEditModeRef.current = quickEditMode;
    }, [quickEditMode]);

    useEffect(() => {
        currentDocRef.current = currentDoc;
        onDocumentChange?.(currentDoc || null);
    }, [currentDoc, onDocumentChange]);

    const dirtyMap = useMemo(() => localDocuments.reduce<Record<string, boolean>>((acc, doc) => {
        acc[doc.key] = (savedContents[doc.key] || '') !== (doc.content || '');
        return acc;
    }, {}), [localDocuments, savedContents]);
    const hasDirtyChanges = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);
    const dirtyCount = useMemo(() => Object.values(dirtyMap).filter(Boolean).length, [dirtyMap]);
    const hasSynchronousDirtyChanges = localDocumentsRef.current.some((doc) => (
        (savedContentsRef.current[doc.key] || '') !== (doc.content || '')
    ));

    const updateCurrentDocContent = useCallback((markdownContent: string) => {
        const activeDocKey = activeKey;
        const activeDoc = localDocumentsRef.current.find((doc) => doc.key === activeDocKey);
        const shouldIgnoreChange = activeDoc ? shouldIgnoreInitialMarkdownEditorChange({
            savedContent: savedContentsRef.current[activeDoc.key] || '',
            currentContent: activeDoc.content || '',
            nextContent: markdownContent,
            userChanged: editorUserChangedDocKeysRef.current.has(activeDoc.key),
        }) : true;
        if (activeDoc && !shouldIgnoreChange) {
            const nextDocuments = localDocumentsRef.current.map((doc) => (
                doc.key === activeDocKey ? { ...doc, content: markdownContent } : doc
            ));
            localDocumentsRef.current = nextDocuments;
            if (embeddedContext?.mode === 'page') {
                if ((savedContentsRef.current[activeDoc.key] || '') === markdownContent) {
                    removeSpecDraft(activeDoc);
                } else {
                    writeSpecDraft({ ...activeDoc, content: markdownContent }, markdownContent);
                }
            }
        }

        setLocalDocuments((previous) => {
            if (!activeDoc || shouldIgnoreChange) {
                return previous;
            }
            const next = previous.map((doc) => (
                doc.key === activeDocKey ? { ...doc, content: markdownContent } : doc
            ));
            return next;
        });
    }, [activeKey, embeddedContext?.mode]);

    const markCurrentEditorUserChange = useCallback(() => {
        if (activeKey) {
            editorUserChangedDocKeysRef.current.add(activeKey);
        }
    }, [activeKey]);

    const markEditorToolbarUserChange = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.tiptap-toolbar')) {
            markCurrentEditorUserChange();
        }
    }, [markCurrentEditorUserChange]);

    const uploadImageToCurrentDoc = useCallback<UploadFunction>(async (
        file: File,
        onProgress?: (event: { progress: number }) => void,
        abortSignal?: AbortSignal,
    ): Promise<string> => {
        const doc = currentDocRef.current || currentDoc;
        if (!doc?.url) {
            throw new Error('缺少文档地址，无法上传图片');
        }
        const currentDocUrl = doc.url;
        editorUserChangedDocKeysRef.current.add(doc.key);

        return new Promise<string>((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file, file.name || 'image');
            formData.append('docUrl', currentDocUrl);

            const xhr = new XMLHttpRequest();
            let finished = false;
            let onAbortSignal: (() => void) | null = null;

            const removeAbortListener = () => {
                if (abortSignal && onAbortSignal) {
                    abortSignal.removeEventListener('abort', onAbortSignal);
                }
            };

            const finishReject = (error: Error) => {
                if (finished) return;
                finished = true;
                removeAbortListener();
                reject(error);
            };

            const finishResolve = (url: string) => {
                if (finished) return;
                finished = true;
                removeAbortListener();
                resolve(url);
            };

            const parseResponsePayload = () => {
                if (xhr.response && typeof xhr.response === 'object') {
                    return xhr.response;
                }
                if (!xhr.responseText) {
                    return {};
                }
                try {
                    return JSON.parse(xhr.responseText);
                } catch {
                    return {};
                }
            };

            onAbortSignal = () => {
                try {
                    xhr.abort();
                } catch {
                    finishReject(new Error('Upload cancelled'));
                }
            };

            if (abortSignal) {
                if (abortSignal.aborted) {
                    finishReject(new Error('Upload cancelled'));
                    return;
                }
                abortSignal.addEventListener('abort', onAbortSignal, { once: true });
            }

            xhr.open('POST', '/api/spec-doc/upload-image');
            xhr.responseType = 'json';

            xhr.upload.onprogress = (event) => {
                if (!event.lengthComputable) return;
                onProgress?.({ progress: Math.round((event.loaded / event.total) * 100) });
            };

            xhr.onerror = () => {
                finishReject(new Error('图片上传失败，请检查网络后重试'));
            };

            xhr.onabort = () => {
                finishReject(new Error('Upload cancelled'));
            };

            xhr.onload = () => {
                const payload = parseResponsePayload();
                if (xhr.status >= 200 && xhr.status < 300 && payload?.success && typeof payload?.url === 'string') {
                    onProgress?.({ progress: 100 });
                    finishResolve(payload.url);
                    return;
                }
                finishReject(new Error(payload?.error || '图片上传失败'));
            };

            xhr.send(formData);
        });
    }, [currentDoc]);

    const restoreDirtyChanges = useCallback(() => {
        const next = localDocumentsRef.current.map((doc) => (
            (savedContentsRef.current[doc.key] || '') !== (doc.content || '')
                ? { ...doc, content: savedContentsRef.current[doc.key] || '' }
                : doc
        ));
        localDocumentsRef.current = next;
        setLocalDocuments(next);
    }, []);

    const notifyParent = useCallback((level: 'success' | 'info' | 'warning' | 'error', message: string) => {
        postToParent({
            type: 'SPEC_EDIT_NOTICE',
            level,
            message,
        }, embeddedContext);
    }, [embeddedContext]);

    const buildSaveRequest = useCallback((docUrl: string, nextContent: string) => {
        const prototypeSpecRequest = buildPrototypeSpecMarkdownSaveRequest(
            docUrl,
            nextContent,
            window.location.origin,
        );
        if (prototypeSpecRequest) return prototypeSpecRequest;
        const pagePrdRequest = buildPrototypePagePrdSaveRequest(
            docUrl,
            nextContent,
            window.location.origin,
        );
        if (pagePrdRequest) return pagePrdRequest;

        let pathname = '';
        let search = '';
        try {
            const normalizedUrl = new URL(docUrl, window.location.origin);
            pathname = normalizedUrl.pathname;
            search = normalizedUrl.search;
        } catch {
            pathname = docUrl;
            search = '';
        }

        if (
            pathname === '/api/markdown-file'
            || pathname.startsWith('/api/docs/')
            || pathname.startsWith('/api/document-templates/')
            || PROJECT_DOCUMENT_CONTENT_PATH_RE.test(pathname)
            || PROJECT_DOCUMENT_PATH_CONTENT_RE.test(pathname)
        ) {
            return {
                url: `${pathname}${search}`,
                init: {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: nextContent }),
                },
            };
        }

        if (pathname.startsWith('/docs/templates/')) {
            const rawName = pathname.slice('/docs/templates/'.length);
            const decodedName = decodeURIComponent(rawName);
            return {
                url: buildDocApiPath(`templates/${ensureMarkdownExtension(decodedName)}`),
                init: {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: nextContent }),
                },
            };
        }

        if (pathname.startsWith('/docs/')) {
            const rawName = pathname.slice('/docs/'.length);
            const decodedName = decodeURIComponent(rawName);
            return {
                url: buildDocApiPath(ensureMarkdownExtension(decodedName)),
                init: {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: nextContent }),
                },
            };
        }

        return {
            url: '/api/spec-doc/save',
            init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docUrl, content: nextContent }),
            },
        };
    }, []);

    const notifyEmbeddedDocumentSaved = useCallback(() => {
        if (!embeddedContext) return true;
        const message = createEmbeddedDocumentMessage('AXHUB_EMBEDDED_DOCUMENT_SAVED', embeddedContext);
        const sent = message ? postToParent(message, embeddedContext) : false;
        if (!sent) {
            setEmbeddedFeedback({ level: 'error', message: '保存成功，但无法通知宿主页面' });
        }
        return sent;
    }, [embeddedContext]);

    const notifyEmbeddedDocumentClosed = useCallback(() => {
        if (!embeddedContext) return true;
        const message = createEmbeddedDocumentMessage('AXHUB_EMBEDDED_DOCUMENT_CLOSED', embeddedContext);
        const sent = message ? postToParent(message, embeddedContext) : false;
        if (!sent) {
            setEmbeddedFeedback({ level: 'error', message: '无法通知宿主页面关闭文档' });
        }
        return sent;
    }, [embeddedContext]);

    const notifyEmbeddedDocumentCloseCancelled = useCallback(() => {
        if (!embeddedContext) return true;
        const message = createEmbeddedDocumentMessage('AXHUB_EMBEDDED_DOCUMENT_CLOSE_CANCELLED', embeddedContext);
        const sent = message ? postToParent(message, embeddedContext) : false;
        if (!sent) {
            setEmbeddedFeedback({ level: 'error', message: '无法通知宿主页面取消退出' });
        }
        return sent;
    }, [embeddedContext]);

    const saveCurrentDoc = useCallback(async (options?: {
        exitAfterSave?: boolean;
        suppressNoChangeNotice?: boolean;
        suppressSuccessNotice?: boolean;
    }) => {
        if (!currentDoc) {
            notifyParent('warning', '当前没有可保存的文档');
            if (embeddedContext) setEmbeddedFeedback({ level: 'error', message: '当前没有可保存的文档' });
            return false;
        }

        const liveCurrentDoc = localDocumentsRef.current.find((doc) => doc.key === currentDoc.key) || currentDoc;
        const currentContent = liveCurrentDoc.content || '';
        const isCurrentDirty = (savedContentsRef.current[liveCurrentDoc.key] || '') !== currentContent;
        if (!isCurrentDirty) {
            clearPendingDraftPersist();
            clearDraftForDoc(liveCurrentDoc);
            if (options?.exitAfterSave) {
                clearDraftsForCurrentScope();
                setQuickEditModeState('none');
                notifyEmbeddedDocumentClosed();
            } else if (embeddedContext) {
                setEmbeddedFeedback({ level: 'info', message: '没有未保存的更改' });
            } else if (!options?.suppressNoChangeNotice) {
                notifyParent('info', '当前文档没有需要保存的更改');
            }
            return true;
        }

        if (!liveCurrentDoc.url) {
            notifyParent('error', '缺少文档地址，无法保存');
            if (embeddedContext) setEmbeddedFeedback({ level: 'error', message: '缺少文档地址，无法保存' });
            return false;
        }

        if (externalPagePrdChanged) {
            const overwrite = await new Promise<boolean>((resolve) => {
                modal.confirm({
                    title: '保存草稿并覆盖外部更新？',
                    content: '页面 PRD 在外部更新过。选择覆盖后，已保存正文将替换为当前草稿。',
                    okText: '覆盖并保存',
                    cancelText: '继续编辑',
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                    afterClose: () => resolve(false),
                });
            });
            if (!overwrite) return false;
        }

        setIsSaving(true);
        if (embeddedContext) setEmbeddedFeedback({ level: 'info', message: '正在保存…' });
        try {
            const { url, init } = buildSaveRequest(liveCurrentDoc.url, currentContent);
            const response = await fetch(url, init);
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result?.error || '保存失败');
            }
            const notifiedParent = notifyEmbeddedDocumentSaved();
            if (embeddedContext && notifiedParent) {
                setEmbeddedFeedback({ level: 'success', message: '保存成功' });
            }
            const savedMarkdownPath = resolveSavedMarkdownFilePath(liveCurrentDoc.url);
            if (savedMarkdownPath) {
                broadcastMarkdownFileSaved({
                    type: 'markdown-file-saved',
                    path: savedMarkdownPath,
                    updatedAt: Date.now(),
                });
            }

            const savedContent = currentContent;
            setExternalPagePrdChanged(false);
            savedContentsRef.current = {
                ...savedContentsRef.current,
                [liveCurrentDoc.key]: savedContent,
            };
            setSavedContents((previous) => ({
                ...previous,
                [liveCurrentDoc.key]: savedContent,
            }));
            clearPendingDraftPersist();
            clearDraftForDoc(liveCurrentDoc);
            if (!options?.suppressSuccessNotice) {
                notifyParent('success', `${liveCurrentDoc.label} 已保存`);
            }
            if (options?.exitAfterSave) {
                clearDraftsForCurrentScope();
                setQuickEditModeState('none');
                notifyEmbeddedDocumentClosed();
            }
            return true;
        } catch (error: any) {
            notifyParent('error', error?.message || '保存失败');
            if (embeddedContext) setEmbeddedFeedback({ level: 'error', message: error?.message || '保存失败' });
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [
        buildSaveRequest,
        clearDraftsForCurrentScope,
        clearDraftForDoc,
        clearPendingDraftPersist,
        currentDoc,
        embeddedContext,
        externalPagePrdChanged,
        modal,
        notifyEmbeddedDocumentClosed,
        notifyEmbeddedDocumentSaved,
        notifyParent,
    ]);

    const setQuickEditSessionMode = useCallback(async (
        mode: 'comment' | 'edit',
        options?: { saveBehavior?: 'none' | 'save' | 'discard' },
    ) => {
        const saveBehavior = options?.saveBehavior ?? 'none';
        if (mode === 'comment' && quickEditModeRef.current === 'edit') {
            if (saveBehavior === 'save') {
                const saved = await saveCurrentDoc({
                    suppressNoChangeNotice: true,
                    suppressSuccessNotice: true,
                });
                if (!saved) {
                    return false;
                }
            } else if (saveBehavior === 'discard') {
                restoreDirtyChanges();
                clearPendingDraftPersist();
                clearDraftsForCurrentScope();
            }
        }

        setQuickEditModeState(mode);
        return true;
    }, [clearDraftsForCurrentScope, clearPendingDraftPersist, restoreDirtyChanges, saveCurrentDoc]);

    const requestEmbeddedDocumentClose = useCallback((reason: EmbeddedDocumentCloseReason = 'close') => {
        if (!embeddedContext) return false;
        if (!embeddedContext.documentId || !embeddedContext.returnPath || !embeddedContext.parentOrigin) {
            setEmbeddedFeedback({ level: 'error', message: '内嵌文档缺少宿主身份信息，无法安全退出' });
            return false;
        }

        const request: EmbeddedDocumentCloseRequest = {
            type: 'AXHUB_EMBEDDED_DOCUMENT_REQUEST_CLOSE',
            reason,
            documentId: embeddedContext.documentId,
            ...(embeddedContext.pageId ? { pageId: embeddedContext.pageId } : {}),
            returnPath: embeddedContext.returnPath,
        };

        if (embeddedContext.mode === 'page') {
            flushDraftsNow(true);
            clearPendingDraftPersist();
            setPendingEmbeddedClose(null);
            setQuickEditModeState('none');
            setEmbeddedFeedback({ level: 'info', message: '页面草稿已保留，正在退出…' });
            notifyEmbeddedDocumentClosed();
            return true;
        }

        if (isSaving) {
            setPendingEmbeddedClose(request);
            setEmbeddedFeedback({ level: 'info', message: '正在保存，请稍候再退出' });
            return false;
        }

        if (hasSynchronousDirtyChanges) {
            setPendingEmbeddedClose(request);
            setEmbeddedFeedback({ level: 'info', message: '有未保存的更改，请选择保存或放弃' });
            return false;
        }

        setPendingEmbeddedClose(null);
        setQuickEditModeState('none');
        notifyEmbeddedDocumentClosed();
        return true;
    }, [clearPendingDraftPersist, embeddedContext, flushDraftsNow, hasSynchronousDirtyChanges, isSaving, notifyEmbeddedDocumentClosed]);

    const discardEmbeddedDocumentChangesAndClose = useCallback(() => {
        if (!embeddedContext) return;
        restoreDirtyChanges();
        clearPendingDraftPersist();
        clearDraftForDoc(currentDocRef.current);
        setPendingEmbeddedClose(null);
        setQuickEditModeState('none');
        setEmbeddedFeedback({ level: 'info', message: '已放弃更改，正在退出…' });
        notifyEmbeddedDocumentClosed();
    }, [clearDraftForDoc, clearPendingDraftPersist, embeddedContext, notifyEmbeddedDocumentClosed, restoreDirtyChanges]);

    const cancelEmbeddedDocumentClose = useCallback(() => {
        if (!pendingEmbeddedClose) return;
        setPendingEmbeddedClose(null);
        setEmbeddedFeedback({ level: 'info', message: '已取消退出，可继续编辑' });
        notifyEmbeddedDocumentCloseCancelled();
    }, [notifyEmbeddedDocumentCloseCancelled, pendingEmbeddedClose]);

    const saveEmbeddedDocumentChangesAndClose = useCallback(async () => {
        if (!pendingEmbeddedClose) return;
        const saved = await saveCurrentDoc({
            exitAfterSave: true,
            suppressNoChangeNotice: true,
            suppressSuccessNotice: true,
        });
        if (saved) setPendingEmbeddedClose(null);
    }, [pendingEmbeddedClose, saveCurrentDoc]);

    useEffect(() => {
        if (!pendingEmbeddedClose || isSaving || hasSynchronousDirtyChanges) return;
        setPendingEmbeddedClose(null);
        setQuickEditModeState('none');
        setEmbeddedFeedback({ level: 'info', message: '保存完成，正在退出…' });
        notifyEmbeddedDocumentClosed();
    }, [hasSynchronousDirtyChanges, isSaving, notifyEmbeddedDocumentClosed, pendingEmbeddedClose]);

    useEffect(() => {
        if (isEditing && currentDoc) {
            editorUserChangedDocKeysRef.current.delete(currentDoc.key);
        }
    }, [currentDoc?.key, currentDoc?.url, isEditing]);

    const emitSpecEditStatus = useCallback(() => {
        postToParent({
            type: 'SPEC_EDIT_STATUS',
            enabled: isQuickEditing,
            dirty: hasDirtyChanges,
            saving: isSaving,
            dirtyCount,
            activeDocKey: activeKey,
            quickEditMode,
        }, embeddedContext);
    }, [activeKey, dirtyCount, embeddedContext, hasDirtyChanges, isQuickEditing, isSaving, quickEditMode]);

    useEffect(() => {
        emitSpecEditStatus();
    }, [emitSpecEditStatus]);

    useEffect(() => {
        syncSpecEditQuery(isQuickEditing);
    }, [isQuickEditing]);

    useEffect(() => {
        if (!isCommentMode || !currentDoc) {
            stopCommentEditor();
            return;
        }

        const timerId = window.setTimeout(() => {
            ensureCommentEditor().start();
        }, 0);

        return () => {
            window.clearTimeout(timerId);
            stopCommentEditor();
        };
    }, [currentDoc, ensureCommentEditor, isCommentMode, stopCommentEditor]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            flushDraftsNow();
            stopCommentEditor();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [flushDraftsNow, stopCommentEditor]);

    useEffect(() => () => {
        if (embeddedContext?.mode === 'page') {
            flushDraftsNow(true);
        }
    }, [embeddedContext?.mode, flushDraftsNow]);

    useEffect(() => {
        if (!isEditing || !currentDoc) {
            clearPendingDraftPersist();
            return;
        }

        const saved = savedContents[currentDoc.key] || '';
        const current = currentDoc.content || '';
        if (saved === current) {
            clearPendingDraftPersist();
            const existingDraft = readSpecDraft(currentDoc);
            const hasPendingDraftToReview = Boolean(
                existingDraft
                && existingDraft !== current
                && existingDraft !== saved,
            );
            if (!hasPendingDraftToReview) {
                clearDraftForDoc(currentDoc);
            }
            return;
        }

        if (embeddedContext?.mode === 'page') {
            writeSpecDraft(currentDoc, current);
            clearPendingDraftPersist();
            return;
        }

        clearPendingDraftPersist();
        draftPersistTimerRef.current = window.setTimeout(() => {
            writeSpecDraft(currentDoc, current);
            draftPersistTimerRef.current = null;
        }, SPEC_DRAFT_DEBOUNCE_MS);

        return () => {
            clearPendingDraftPersist();
        };
    }, [clearDraftForDoc, clearPendingDraftPersist, currentDoc, embeddedContext?.mode, isEditing, savedContents]);

    useEffect(() => {
        if (!isEditing || !currentDoc) {
            draftPromptedDocKeysRef.current.clear();
            draftConfirmingDocKeyRef.current = null;
            return;
        }

        const draftIdentity = getSpecDraftStorageKey(currentDoc) || currentDoc.key;
        if (draftPromptedDocKeysRef.current.has(draftIdentity)) {
            return;
        }
        draftPromptedDocKeysRef.current.add(draftIdentity);

        let draftDoc = currentDoc;
        let draft = readSpecDraft(draftDoc);
        if (draft === null && embeddedContext?.mode === 'page') {
            const unboundUrl = new URLSearchParams(window.location.search).get('pagePrdUrl');
            if (unboundUrl) {
                draftDoc = { ...currentDoc, url: unboundUrl };
                draft = readSpecDraft(draftDoc);
            }
        }
        if (draft === null || (draft === '' && embeddedContext?.mode !== 'page')
            || draft === currentDoc.content || draft === (savedContents[currentDoc.key] || '')) {
            return;
        }

        if (draftConfirmingDocKeyRef.current === draftIdentity) {
            return;
        }
        draftConfirmingDocKeyRef.current = draftIdentity;
        const recoveredDraft = draft;

        modal.confirm({
            title: '检测到本地缓存',
            content: `检测到「${currentDoc.label}」存在本地未保存缓存，是否加载缓存版本？`,
            okText: '加载缓存',
            cancelText: '忽略',
            onOk: () => {
                if (draftDoc !== currentDoc) {
                    writeSpecDraft(currentDoc, recoveredDraft);
                    clearDraftForDoc(draftDoc);
                    setExternalPagePrdChanged(true);
                    setEmbeddedFeedback({ level: 'info', message: '本页已有外部保存的正文，已恢复之前的草稿。' });
                }
                setLocalDocuments((previous) => {
                    const next = previous.map((doc) => (
                        doc.key === currentDoc.key ? { ...doc, content: recoveredDraft } : doc
                    ));
                    localDocumentsRef.current = next;
                    return next;
                });
                notifyParent('info', `已加载 ${currentDoc.label} 的本地缓存版本`);
            },
            onCancel: () => {
                clearDraftForDoc(draftDoc);
            },
            afterClose: () => {
                if (draftConfirmingDocKeyRef.current === draftIdentity) {
                    draftConfirmingDocKeyRef.current = null;
                }
            },
        });
    }, [clearDraftForDoc, currentDoc, embeddedContext?.mode, isEditing, modal, notifyParent, savedContents]);

    useEffect(() => {
        postToParent({
            type: 'spec-doc-changed',
            activeDocKey: activeKey,
        }, embeddedContext);
    }, [activeKey, embeddedContext]);

    const syncExternalPagePrdContent = useCallback((incoming: string) => {
        if (isSaving) return;
        const doc = localDocumentsRef.current.find((item) => item.key === activeKey);
        if (!doc) return;
        const update = resolveEmbeddedPagePrdRefresh(savedContentsRef.current[doc.key] || '', doc.content || '', incoming);
        if (!update) return;
        savedContentsRef.current = { ...savedContentsRef.current, [doc.key]: incoming };
        setSavedContents(savedContentsRef.current);
        if (update.content !== doc.content) {
            editorUserChangedDocKeysRef.current.delete(doc.key);
            localDocumentsRef.current = localDocumentsRef.current.map((item) => (
                item.key === doc.key ? { ...item, content: update.content } : item
            ));
            setLocalDocuments(localDocumentsRef.current);
        }
        setExternalPagePrdChanged(update.conflict);
        setEmbeddedFeedback({
            level: 'info',
            message: update.conflict
                ? '外部正文已更新，当前未保存的草稿已保留。'
                : '已读取外部更新的正文。',
        });
    }, [activeKey, isSaving]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || typeof data.type !== 'string') return;

            if (embeddedContext) {
                if (event.source !== window.parent || !embeddedContext.parentOrigin || event.origin !== embeddedContext.parentOrigin) {
                    return;
                }
                const refreshedContent = readEmbeddedPagePrdRefresh(data, embeddedContext);
                if (refreshedContent !== undefined) {
                    syncExternalPagePrdContent(refreshedContent);
                    return;
                }
                if (data.type === 'AXHUB_EMBEDDED_DOCUMENT_REQUEST_CLOSE') {
                    if (isMatchingEmbeddedDocumentCloseRequest({
                        data,
                        source: event.source,
                        parentWindow: window.parent,
                        origin: event.origin,
                        context: embeddedContext,
                    })) {
                        requestEmbeddedDocumentClose(data.reason);
                    }
                    return;
                }
            }

            if (data.type === 'SPEC_EDIT_ENABLE') {
                draftPromptedDocKeysRef.current.clear();
                setQuickEditModeState(normalizeRequestedQuickEditMode(data.mode));
                return;
            }

            if (data.type === 'SPEC_EDIT_SET_MODE') {
                const nextMode = data.mode === 'edit' ? 'edit' : 'comment';
                void setQuickEditSessionMode(nextMode, {
                    saveBehavior:
                        data.saveBehavior === 'save' || data.saveBehavior === 'discard'
                            ? data.saveBehavior
                            : 'none',
                });
                return;
            }

            if (data.type === 'SPEC_EDIT_SAVE') {
                void saveCurrentDoc({ exitAfterSave: Boolean(data.exitAfterSave) });
                return;
            }

            if (data.type === 'SPEC_EDIT_EXIT') {
                if (embeddedContext) {
                    requestEmbeddedDocumentClose('close');
                    return;
                }
                if (Boolean(data.discardChanges)) {
                    restoreDirtyChanges();
                }
                clearPendingDraftPersist();
                clearDraftForAllDocs();
                setQuickEditModeState('none');
                return;
            }

            if (data.type === 'SPEC_EDIT_STATUS_REQUEST') {
                emitSpecEditStatus();
                return;
            }

            if (data.type === 'SPEC_EDIT_PROMPT_REQUEST') {
                const requestId = String(data.requestId || '').trim();
                if (!requestId) return;
                void (async () => {
                    try {
                        if (quickEditModeRef.current !== 'comment') {
                            throw new Error('请先切换到批注模式');
                        }
                        const payload = buildCommentPromptPayload();
                        postToParent({
                            type: 'SPEC_EDIT_PROMPT_RESPONSE',
                            requestId,
                            success: true,
                            prompt: payload.prompt,
                            targetPath: payload.targetPath,
                            context: payload.context,
                        });
                    } catch (error: any) {
                        postToParent({
                            type: 'SPEC_EDIT_PROMPT_RESPONSE',
                            requestId,
                            success: false,
                            error: error?.message || '生成 Prompt 失败',
                        });
                    }
                })();
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [
        buildCommentPromptPayload,
        clearDraftForAllDocs,
        clearPendingDraftPersist,
        emitSpecEditStatus,
        restoreDirtyChanges,
        requestEmbeddedDocumentClose,
        saveCurrentDoc,
        setQuickEditSessionMode,
        syncExternalPagePrdContent,
    ]);

    useImperativeHandle(ref, () => ({
        enableQuickEdit() {
            draftPromptedDocKeysRef.current.clear();
            setQuickEditModeState('comment');
        },
        setContext(context) {
            documentContextRef.current = context && context.documentPath && context.projectId
                ? {
                    projectId: context.projectId.trim(),
                    documentPath: context.documentPath.replace(/\\/g, '/').trim(),
                    makeServerOrigin: context.makeServerOrigin,
                    commentFilePath: context.commentFilePath,
                    commentAssetRoot: context.commentAssetRoot,
                }
                : null;
            commentEditorRef.current?.refresh?.();
        },
        disableQuickEdit(options) {
            if (embeddedContext) {
                if (options?.discardChanges && embeddedContext.mode === 'ordinary') {
                    restoreDirtyChanges();
                    clearPendingDraftPersist();
                    clearDraftForDoc(currentDocRef.current);
                    setQuickEditModeState('none');
                    notifyEmbeddedDocumentClosed();
                    return;
                }
                requestEmbeddedDocumentClose('close');
                return;
            }
            if (options?.discardChanges) {
                restoreDirtyChanges();
            }
            clearPendingDraftPersist();
            clearDraftForAllDocs();
            setQuickEditModeState('none');
        },
        enableDocumentEditor(options) {
            draftPromptedDocKeysRef.current.clear();
            const nextMode = normalizeRequestedQuickEditMode(options?.quickEditMode);
            setQuickEditModeState(nextMode);
            syncDocumentCommentaryForMode(nextMode, {
                startCommentary: () => {
                    ensureCommentEditor({
                        initialDarkMode: options?.initialDarkMode,
                        assistantPanelOpen: options?.assistantPanelOpen,
                    }).start();
                },
                stopCommentary: stopCommentEditor,
                disableSelectionMode: () => {
                    void commentEditorRef.current?.runHostToolbarAction?.({
                        type: 'toggle-selection-mode',
                        active: false,
                    });
                },
            });
        },
        disableDocumentEditor() {
            stopCommentEditor();
        },
        getHostToolbarState() {
            return commentEditorRef.current?.getHostToolbarState?.() ?? null;
        },
        subscribeHostToolbarState(listener) {
            const editor = ensureCommentEditor();
            return editor.subscribeHostToolbarState(listener);
        },
        runHostToolbarAction(action) {
            const editor = ensureCommentEditor();
            return editor.runHostToolbarAction(action);
        },
        getDebugState() {
            return commentEditorRef.current?.getDebugState?.() ?? null;
        },
        getVoiceTarget() {
            return commentEditorRef.current?.getVoiceTarget?.() ?? null;
        },
        async refreshPersistedComments(deletedCommentIds = []) {
            await commentEditorRef.current?.refreshPersistedComments?.(deletedCommentIds);
        },
        async setQuickEditMode(mode, options) {
            return setQuickEditSessionMode(mode, options);
        },
        getQuickEditStatus() {
            return {
                enabled: isQuickEditing,
                dirty: hasDirtyChanges,
                saving: isSaving,
                dirtyCount,
                activeDocKey: activeKey,
                quickEditMode,
            };
        },
        getCopyPromptText() {
            return buildCommentPromptPayload().prompt;
        },
        handleCopyPrompt() {
            return Promise.resolve(buildCommentPromptPayload());
        },
        saveCurrentDoc,
    }), [
        activeKey,
        buildCommentPromptPayload,
        clearDraftForAllDocs,
        clearPendingDraftPersist,
        dirtyCount,
        hasDirtyChanges,
        ensureCommentEditor,
        isQuickEditing,
        isSaving,
        quickEditMode,
        embeddedContext,
        clearDraftForDoc,
        clearPendingDraftPersist,
        requestEmbeddedDocumentClose,
        notifyEmbeddedDocumentClosed,
        restoreDirtyChanges,
        saveCurrentDoc,
        setQuickEditSessionMode,
        stopCommentEditor,
    ]);

    useEffect(() => {
        return () => {
            commentEditorRef.current?.destroy();
            commentEditorRef.current = null;
        };
    }, []);

    const previewContent = useMemo(
        () => stripMarkdownPreviewFrontmatter(currentDoc?.content || ''),
        [currentDoc?.content],
    );

    const { anchorItems } = useMemo(() => {
        const headings = extractHeadings(previewContent);
        const items = buildAnchorItems(headings);
        return { anchorItems: items };
    }, [previewContent]);

    const isMultiDoc = localDocuments.length > 1;
    const anchorSidebarScrollRef = useRef<HTMLDivElement | null>(null);

    const scrollActiveAnchorIntoView = useCallback((activeHref?: string) => {
        window.requestAnimationFrame(() => {
            const scrollContainer = anchorSidebarScrollRef.current;
            if (!scrollContainer) return;
            const activeLink = Array.from(scrollContainer.querySelectorAll<HTMLAnchorElement>('.ant-anchor-link-title'))
                .find((link) => link.getAttribute('href') === activeHref)
                ?? scrollContainer.querySelector<HTMLElement>('.ant-anchor-link-title-active');
            if (!activeLink) return;

            const containerRect = scrollContainer.getBoundingClientRect();
            const activeRect = activeLink.getBoundingClientRect();
            const topGap = activeRect.top - containerRect.top;
            const bottomGap = activeRect.bottom - containerRect.bottom;
            if (topGap < 0) {
                scrollContainer.scrollTop += topGap - 8;
            } else if (bottomGap > 0) {
                scrollContainer.scrollTop += bottomGap + 8;
            }
        });
    }, []);

    const renderViewerContent = () => (
        <div className="markdown-container">
            <div className="markdown-content">
                <div>
                    <ReadOnlyMarkdown
                        content={previewContent}
                        documentUrl={currentDoc?.url}
                        components={{
                            a: ((props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
                                const navigationTarget = resolveMarkdownDocumentLinkTarget(
                                    String(props.href || ''),
                                    String(currentDoc?.url || ''),
                                );
                                const resourceUrl = navigationTarget
                                    ? null
                                    : resolvePrototypeSpecResourceUrl(
                                        String(props.href || ''),
                                        String(currentDoc?.url || ''),
                                    );
                                return (
                                    <a
                                        {...props}
                                        href={resourceUrl || props.href}
                                        onClick={(event) => {
                                            props.onClick?.(event);
                                            if (event.defaultPrevented || !navigationTarget) return;
                                            event.preventDefault();
                                            if (navigationTarget.kind === 'prototype-spec') {
                                                postToParent({
                                                    type: 'axhub-prototype-spec:navigate',
                                                    path: navigationTarget.resourceId,
                                                });
                                                return;
                                            }
                                            postToParent({
                                                type: 'axhub-document-resource:navigate',
                                                resourceType: navigationTarget.kind,
                                                resourceId: navigationTarget.resourceId,
                                            });
                                        }}
                                    />
                                );
                            }) as any,
                            h1: createHeading(1),
                            h2: createHeading(2),
                            h3: createHeading(3),
                            h4: createHeading(4),
                            h5: createHeading(5),
                            h6: createHeading(6),
                        }}
                    />
                </div>
            </div>
            {anchorItems.length > 0 && (
                <div className="anchor-sidebar">
                    <div style={{
                        marginBottom: 12,
                        fontWeight: 600,
                        fontSize: 16,
                        paddingLeft: 16,
                        borderLeft: '2px solid transparent',
                    }}
                    >
                        目录
                    </div>
                    <div className="anchor-sidebar-scroll" ref={anchorSidebarScrollRef}>
                        <Anchor
                            affix={false}
                            offsetTop={40}
                            targetOffset={80}
                            items={anchorItems}
                            onChange={scrollActiveAnchorIntoView}
                            onClick={(event) => {
                                event.preventDefault();
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    const renderEditorContent = () => (
        <div
            className="markdown-container spec-editor-shell"
            onBeforeInputCapture={markCurrentEditorUserChange}
            onInputCapture={markCurrentEditorUserChange}
            onKeyDownCapture={markCurrentEditorUserChange}
            onPasteCapture={markCurrentEditorUserChange}
            onDropCapture={markCurrentEditorUserChange}
            onPointerDownCapture={markEditorToolbarUserChange}
        >
            <div className="markdown-content">
                <div>
                    <PrdMarkdownEditor
                        content={currentDoc?.content || ''}
                        contentType="markdown"
                        editable={isEditing && !(embeddedContext && isSaving)}
                        showThemeToggle={false}
                        toolbarPreset="full"
                        imageUpload={uploadImageToCurrentDoc}
                        imageSrcResolver={resolveCurrentDocumentImageSrc}
                        onMarkdownChange={updateCurrentDocContent}
                    />
                </div>
            </div>
        </div>
    );

    return (
        <ConfigProvider theme={defaultThemeConfig}>
            <XProvider locale={zhCN_X}>
                {modalContextHolder}
                <style>{markdownStyles}</style>
                {embeddedContext && (
                    <div
                        className="embedded-document-actions"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                            padding: '10px 16px',
                            borderBottom: '1px solid #e5e7eb',
                            background: '#fff',
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <strong>{embeddedContext.mode === 'page' ? '页面 PRD' : (currentDoc?.label || '文档')}</strong>
                            {embeddedFeedback && (
                                <div
                                    role={embeddedFeedback.level === 'error' ? 'alert' : 'status'}
                                    aria-live="polite"
                                    style={{
                                        marginTop: 3,
                                        color: embeddedFeedback.level === 'error'
                                            ? '#cf1322'
                                            : embeddedFeedback.level === 'success'
                                                ? '#237804'
                                                : '#595959',
                                        fontSize: 12,
                                    }}
                                >
                                    {embeddedFeedback.message}
                                </div>
                            )}
                        </div>
                        <Space>
                            <Button
                                type="primary"
                                loading={isSaving}
                                disabled={!isEditing || !embeddedContext.documentId}
                                onClick={() => void saveCurrentDoc({ exitAfterSave: embeddedContext.mode === 'page' })}
                            >
                                保存
                            </Button>
                            {embeddedContext.mode === 'page' && hasDirtyChanges ? (
                                <Button
                                    danger
                                    disabled={isSaving}
                                    onClick={() => modal.confirm({
                                        title: '放弃当前页未保存的更改？',
                                        okText: '放弃',
                                        cancelText: '继续编辑',
                                        onOk: discardEmbeddedDocumentChangesAndClose,
                                    })}
                                >
                                    放弃更改
                                </Button>
                            ) : null}
                            <Button
                                disabled={isSaving}
                                onClick={() => requestEmbeddedDocumentClose('close')}
                            >
                                退出
                            </Button>
                        </Space>
                    </div>
                )}
                <Modal
                    open={Boolean(pendingEmbeddedClose)}
                    title="文档有未保存更改"
                    onCancel={cancelEmbeddedDocumentClose}
                    maskClosable={false}
                    footer={[
                        <Button key="continue" onClick={cancelEmbeddedDocumentClose}>
                            继续编辑
                        </Button>,
                        <Button key="discard" danger onClick={discardEmbeddedDocumentChangesAndClose}>
                            放弃并退出
                        </Button>,
                        <Button
                            key="save"
                            type="primary"
                            loading={isSaving}
                            onClick={() => void saveEmbeddedDocumentChangesAndClose()}
                        >
                            保存并退出
                        </Button>,
                    ]}
                >
                    <p>当前文档有未保存的更改。可以保存后退出、放弃更改，或继续编辑。</p>
                </Modal>
                {isMultiDoc && (
                    <div className="markdown-tabs-container">
                        <Tabs
                            activeKey={activeKey}
                            onChange={setActiveKey}
                            items={localDocuments.map((doc) => ({
                                key: doc.key,
                                label: dirtyMap[doc.key] ? `${doc.label} *` : doc.label,
                            }))}
                        />
                    </div>
                )}
                {isEditing ? renderEditorContent() : renderViewerContent()}
            </XProvider>
        </ConfigProvider>
    );
});
