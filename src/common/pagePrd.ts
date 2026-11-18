import type { AnnotationDocumentDirectoryNode } from '../index/types';
import type { PrototypePageSegment } from '../index/components/sidebar/prototypePageGroups';
import { stripMarkdownPreviewFrontmatter } from '../spec-template/previewMarkdownContent';
import { PRD_OVERVIEW_ID, PRD_PROTOTYPE_ID, type PagePrdPlacement } from './pagePrdPlacement';

export { PRD_OVERVIEW_ID, PRD_PROTOTYPE_ID, type PagePrdPlacement } from './pagePrdPlacement';

export const PAGE_PRD_CONFIGURE = 'AXHUB_PAGE_PRD_CONFIGURE';
export const PAGE_PRD_READY = 'AXHUB_PAGE_PRD_READY';
export const PAGE_PRD_SAVED = 'AXHUB_PAGE_PRD_SAVED';
export const PAGE_PRD_SOURCE_CHANGED = 'AXHUB_PAGE_PRD_SOURCE_CHANGED';
export type PagePrdStatus = 'unbound' | 'missing';
export const pagePrdId = (pageId: string) => `make-page-prd:page:${pageId}`;

export type PagePrdScope = { projectId: string; targetPath: string };
export type PagePrdRecord = { path: string; content: string; missing?: boolean };
export type PagePrdRecords = Record<string, PagePrdRecord>;
export type PagePrdEntry = { id: string; pageId?: string; contentUrl?: string; pageUrl?: string; status?: PagePrdStatus };
export type PagePrdConfiguration = PagePrdScope & {
    type: typeof PAGE_PRD_CONFIGURE;
    makeOrigin: string;
    pages: PrototypePageSegment[];
    defaultPageId: string;
    reload?: boolean;
    selection?: { id: string; edit: boolean } | { current: true };
};

export function pagePrdUrl(scope: PagePrdScope, pageId?: string): string {
    const query = new URLSearchParams({ projectId: scope.projectId, targetPath: scope.targetPath });
    if (pageId) query.set('pageId', pageId);
    return `/api/prototype-annotation/page-prd?${query}`;
}

export function documentContentUrl(projectId: string, path: string): string {
    return `/api/projects/${encodeURIComponent(projectId)}/document-content?${new URLSearchParams({ path })}`;
}

export function annotationDocumentPath(scope: PagePrdScope, path: string): string {
    let decodedPath = path;
    try { decodedPath = decodeURIComponent(path); } catch { /* Legacy literal path. */ }
    return `src/${scope.targetPath}/${decodedPath}`;
}

export function getActivePagePrdPaths(pages: readonly PrototypePageSegment[], records: PagePrdRecords): Set<string> {
    const paths = new Set<string>();
    const visit = (nodes: readonly PrototypePageSegment[]) => {
        for (const node of nodes) {
            if (node.kind === 'page' && records[node.page.id]) paths.add(records[node.page.id].path);
            visit(node.children);
        }
    };
    visit(pages);
    return paths;
}

function stripBoundDocuments(
    scope: PagePrdScope,
    nodes: readonly AnnotationDocumentDirectoryNode[],
    boundPaths: Set<string>,
): AnnotationDocumentDirectoryNode[] {
    return nodes.flatMap((node) => {
        if (node.type === 'folder') {
            const children = stripBoundDocuments(scope, node.children ?? [], boundPaths);
            return [{ ...node, children }];
        }
        if (node.markdownPath && boundPaths.has(annotationDocumentPath(scope, node.markdownPath))) return [];
        return [node];
    });
}

export type PagePrdTreeNode = {
    id: string;
    title: string;
    number: string;
    kind: 'section' | 'group' | 'page' | 'folder' | 'markdown' | 'html';
    children: PagePrdTreeNode[];
    pageId?: string;
    status?: PagePrdStatus;
    document?: AnnotationDocumentDirectoryNode;
};

type UnnumberedNode = Omit<PagePrdTreeNode, 'number' | 'children'> & { children: UnnumberedNode[] };

export function buildPagePrdTree(
    pages: readonly PrototypePageSegment[],
    records: PagePrdRecords,
    ordinary: readonly AnnotationDocumentDirectoryNode[],
    scope: PagePrdScope,
): PagePrdTreeNode[] {
    const parents = new Map<string, UnnumberedNode>();
    const placements: { node: UnnumberedNode; placement: PagePrdPlacement }[] = [];

    function prototypeNodes(segments: readonly PrototypePageSegment[]): UnnumberedNode[] {
        return segments.map((segment) => {
            if (segment.kind === 'group') {
                // Legacy groups use a positional key in the sidebar. Persist their identity by content.
                const explicit = segment.key.startsWith(`${scope.targetPath}:folder:`);
                const pageIds = segment.children.flatMap((child) => child.kind === 'page' ? [child.page.id] : []);
                const key = explicit ? segment.key : `legacy:${segment.title}:${pageIds.sort()[0] ?? segment.key}`;
                const node: UnnumberedNode = {
                    id: `make-page-prd:group:${key}`, title: segment.title, kind: 'group',
                    children: prototypeNodes(segment.children),
                };
                parents.set(node.id, node);
                return node;
            }
            const { id: pageId, title } = segment.page;
            const record = records[pageId];
            const node: UnnumberedNode = {
                id: pagePrdId(pageId), title, kind: 'page', pageId,
                status: record?.missing ? 'missing' : record ? undefined : 'unbound',
                children: prototypeNodes(segment.children),
            };
            parents.set(node.id, node);
            return node;
        });
    }

    function ordinaryNodes(items: readonly AnnotationDocumentDirectoryNode[]): UnnumberedNode[] {
        return items.flatMap((document) => {
            const node: UnnumberedNode = {
                id: document.id, title: document.title, kind: document.type, document,
                children: ordinaryNodes(document.children ?? []),
            };
            if (document.type === 'folder') parents.set(node.id, node);
            const placement = document.prdPlacement;
            if (document.type === 'markdown' && placement && parents.has(placement.parentId)) {
                placements.push({ node, placement });
                return [];
            }
            return [node];
        });
    }

    const prototype: UnnumberedNode = {
        id: PRD_PROTOTYPE_ID, title: '原型说明', kind: 'section', children: prototypeNodes(pages),
    };
    parents.set(prototype.id, prototype);
    const overview: UnnumberedNode = {
        id: PRD_OVERVIEW_ID, title: '产品总述', kind: 'section',
        children: ordinaryNodes(stripBoundDocuments(scope, ordinary, getActivePagePrdPaths(pages, records))),
    };
    for (const { node, placement } of placements) {
        const parent = parents.get(placement.parentId) ?? overview;
        const before = parent.children.findIndex((child) =>
            (child.kind === 'page' || child.kind === 'group') && child.id === placement.beforeId);
        parent.children.splice(before === -1 ? parent.children.length : before, 0, node);
    }

    function numberNodes(nodes: UnnumberedNode[], parent = ''): PagePrdTreeNode[] {
        return nodes.map((node, index) => {
            const number = parent ? `${parent}.${index + 1}` : String(index + 1);
            return { ...node, number, children: numberNodes(node.children, number) };
        });
    }
    return numberNodes([overview, prototype]);
}

export function numberedPrdTitle(node: PagePrdTreeNode): string {
    return `${node.number}${node.kind === 'section' ? '.' : ''} ${node.title}`;
}

export function buildFullPagePrd(tree: readonly PagePrdTreeNode[], records: PagePrdRecords): string {
    const sections: string[] = [];
    function visit(nodes: readonly PagePrdTreeNode[], level: number) {
        for (const node of nodes) {
            if (node.kind === 'html') continue;
            sections.push(`${'#'.repeat(Math.min(level, 6))} ${numberedPrdTitle(node).replace(/[\r\n]+/gu, ' ')}`);
            const body = node.pageId ? records[node.pageId]?.content : node.document?.markdown;
            if (body) sections.push(nestMarkdownHeadings(stripMarkdownPreviewFrontmatter(body), level));
            visit(node.children, level + 1);
        }
    }
    visit(tree, 1);
    return sections.join('\n\n');
}

function nestMarkdownHeadings(markdown: string, depth: number): string {
    let fence = '';
    return markdown.trimEnd().split(/\r?\n/u).map((line) => {
        const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
        if (fenceMatch) {
            const marker = fenceMatch[1];
            if (!fence) fence = marker;
            else if (marker[0] === fence[0] && marker.length >= fence.length && !fenceMatch[2].trim()) fence = '';
            return line;
        }
        if (fence) return line;
        return line.replace(/^( {0,3})(#{1,6})(?=[ \t]|$)/u, (_, indent: string, heading: string) =>
            indent + '#'.repeat(Math.min(6, heading.length + depth)));
    }).join('\n');
}

export function buildPagePrdDirectory(
    config: PagePrdScope & { pages: readonly PrototypePageSegment[] },
    records: PagePrdRecords,
    ordinary: readonly AnnotationDocumentDirectoryNode[],
) {
    const ordinaryMarkdown = new Map<string, string>();
    function readOrdinaryMarkdown(items: readonly AnnotationDocumentDirectoryNode[]) {
        for (const item of items) {
            if (item.type === 'markdown' && item.markdownPath && typeof item.markdown === 'string') {
                ordinaryMarkdown.set(annotationDocumentPath(config, item.markdownPath), item.markdown);
            }
            if (item.children) readOrdinaryMarkdown(item.children);
        }
    }
    readOrdinaryMarkdown(ordinary);
    const readableRecords = Object.fromEntries(Object.entries(records).map(([pageId, record]) => [
        pageId, { ...record, content: ordinaryMarkdown.get(record.path) ?? record.content },
    ]));
    const tree = buildPagePrdTree(config.pages, records, ordinary, config);
    const entries: PagePrdEntry[] = [];
    function toReaderNode(item: PagePrdTreeNode): AnnotationDocumentDirectoryNode {
        const { id, pageId, document } = item;
        const title = numberedPrdTitle(item);
        if (pageId) {
            const record: PagePrdRecord | undefined = readableRecords[pageId];
            const pageUrl = pagePrdUrl(config, pageId);
            entries.push({
                id, pageId, pageUrl, status: item.status,
                contentUrl: record && !record.missing ? documentContentUrl(config.projectId, record.path) : pageUrl,
            });
            const node: AnnotationDocumentDirectoryNode = {
                type: 'markdown', id, title,
                ...(record?.path.startsWith(`src/${config.targetPath}/`)
                    ? { markdownPath: record.path.slice(`src/${config.targetPath}/`.length) }
                    : {}),
                markdown: record && !record.missing ? stripMarkdownPreviewFrontmatter(record.content) : '',
                readerMode: 'split',
            };
            if (!item.children.length) return node;
            return {
                type: 'folder', id: `make-page-prd:branch:${pageId}`, title, defaultExpanded: true,
                children: [node, ...item.children.map(toReaderNode)],
            };
        }
        if (document && document.type !== 'folder') {
            const { prdPlacement: _placement, ...readerDocument } = document;
            entries.push({
                id,
                contentUrl: document.type === 'markdown' && document.markdownPath
                    ? documentContentUrl(config.projectId, annotationDocumentPath(config, document.markdownPath))
                    : undefined,
            });
            return { ...readerDocument, title };
        }
        return {
            ...document, type: 'folder', id, title,
            defaultExpanded: document?.defaultExpanded ?? true, children: item.children.map(toReaderNode),
        };
    }
    return { tree, nodes: tree.map(toReaderNode), entries, fullMarkdown: buildFullPagePrd(tree, readableRecords) };
}
