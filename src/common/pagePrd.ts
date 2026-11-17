import type { AnnotationDocumentDirectoryNode } from '../index/types';
import type { PrototypePageSegment } from '../index/components/sidebar/prototypePageGroups';
import { stripMarkdownPreviewFrontmatter } from '../spec-template/previewMarkdownContent';

export const PAGE_PRD_CONFIGURE = 'AXHUB_PAGE_PRD_CONFIGURE';
export const PAGE_PRD_READY = 'AXHUB_PAGE_PRD_READY';
export const PAGE_PRD_SAVED = 'AXHUB_PAGE_PRD_SAVED';
export const PAGE_PRD_SOURCE_CHANGED = 'AXHUB_PAGE_PRD_SOURCE_CHANGED';
export const FULL_PRD_ID = 'make-page-prd:all';
export const pagePrdId = (pageId: string) => `make-page-prd:page:${pageId}`;

export type PagePrdScope = { projectId: string; targetPath: string };
export type PagePrdRecord = { path: string; content: string; missing?: boolean };
export type PagePrdRecords = Record<string, PagePrdRecord>;
export type PagePrdEntry = { id: string; pageId?: string; contentUrl?: string; pageUrl?: string; all?: boolean };
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
            return children.length || !node.children?.length ? [{ ...node, children }] : [];
        }
        if (node.markdownPath && boundPaths.has(annotationDocumentPath(scope, node.markdownPath))) return [];
        return [node];
    });
}

export function buildFullPagePrd(pages: readonly PrototypePageSegment[], records: PagePrdRecords): string {
    const sections = ['# 整篇 PRD'];
    function visit(nodes: readonly PrototypePageSegment[], level: number) {
        for (const node of nodes) {
            const title = node.kind === 'page' ? node.page.title : node.title;
            sections.push(`${'#'.repeat(Math.min(level, 6))} ${title.replace(/[\r\n]+/gu, ' ')}`);
            if (node.kind === 'page') {
                const body = records[node.page.id]?.content;
                if (body) sections.push(nestMarkdownHeadings(stripMarkdownPreviewFrontmatter(body), level));
            }
            visit(node.children, level + 1);
        }
    }
    visit(pages, 2);
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
): { nodes: AnnotationDocumentDirectoryNode[]; entries: PagePrdEntry[] } {
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
    const entries: PagePrdEntry[] = [{ id: FULL_PRD_ID, all: true }];
    function visit(segments: readonly PrototypePageSegment[]): AnnotationDocumentDirectoryNode[] {
        return segments.map((segment) => {
            if (segment.kind === 'group') {
                return { type: 'folder', id: `make-page-prd:group:${segment.key}`, title: segment.title, defaultExpanded: true, children: visit(segment.children) };
            }
            const { id: pageId, title } = segment.page;
            const record: PagePrdRecord | undefined = readableRecords[pageId];
            const id = pagePrdId(pageId);
            const pageUrl = pagePrdUrl(config, pageId);
            entries.push({
                id, pageId, pageUrl,
                contentUrl: record && !record.missing ? documentContentUrl(config.projectId, record.path) : pageUrl,
            });
            const node: AnnotationDocumentDirectoryNode = {
                type: 'markdown', id,
                title: record && !record.missing ? title : `${title}（未编写）`,
                ...(record?.path.startsWith(`src/${config.targetPath}/`)
                    ? { markdownPath: record.path.slice(`src/${config.targetPath}/`.length) }
                    : {}),
                markdown: record?.missing
                    ? '原文档已移动或不存在。请在文档管理重新关联，或编辑并恢复原文件。'
                    : (record ? stripMarkdownPreviewFrontmatter(record.content) : '此页还没有 PRD。点击「编辑」开始编写。'),
                readerMode: 'split',
            };
            if (!segment.children.length) return node;
            return {
                type: 'folder', id: `make-page-prd:branch:${pageId}`, title: node.title, defaultExpanded: true,
                children: [node, ...visit(segment.children)],
            };
        });
    }
    const nodes = [
        { type: 'markdown' as const, id: FULL_PRD_ID, title: '整篇 PRD', markdown: buildFullPagePrd(config.pages, readableRecords), readerMode: 'split' },
        ...visit(config.pages),
    ];
    const unbound = stripBoundDocuments(config, ordinary, getActivePagePrdPaths(config.pages, records));
    function collectOrdinary(items: readonly AnnotationDocumentDirectoryNode[]) {
        for (const item of items) {
            if (item.children) collectOrdinary(item.children);
            else if (item.type === 'markdown' && item.markdownPath) {
                entries.push({ id: item.id, contentUrl: documentContentUrl(config.projectId, annotationDocumentPath(config, item.markdownPath)) });
            } else if (item.type !== 'folder') entries.push({ id: item.id });
        }
    }
    collectOrdinary(unbound);
    return { nodes: [...nodes, ...unbound], entries };
}
