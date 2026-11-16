/**
 * 多页面原型的轻量 hash 路由 hook。
 *
 * URL 格式: #page=<pageId>
 * pageId 仅允许小写字母、数字、连字符（a-z 0-9 -）。
 *
 * 用法：
 *   const { page, setPage } = useHashPage('home');
 *   const route = defineHashPageRoute([
 *     { id: 'dashboard', title: '工作台' },
 *   ], { defaultPageId: 'dashboard' });
 *   const { page, setPage, pages } = useHashPage(route);
 */
import { useCallback, useEffect, useState } from 'react';

export interface HashPageRoutePage {
    id: string;
    title: string;
    group?: string;
}

export type HashPageTreeNode =
    | { kind: 'group'; id: string; title: string; children: HashPageTreeNode[] }
    | { kind: 'page'; id: string; children?: HashPageTreeNode[] };

export interface HashPageRoute {
    pages: HashPageRoutePage[];
    pageTree?: HashPageTreeNode[];
    defaultPageId: string;
}

const PAGE_ID_RE = /^[a-z0-9-]+$/u;

function normalizePageId(value: unknown): string {
    const id = typeof value === 'string' ? value.trim() : '';
    return PAGE_ID_RE.test(id) ? id : '';
}

function normalizeRoutePages(pages: HashPageRoutePage[]): HashPageRoutePage[] {
    if (!Array.isArray(pages)) {
        return [];
    }
    return pages
        .map((page) => {
            const id = normalizePageId(page?.id);
            const title = typeof page?.title === 'string' ? page.title.trim() : '';
            const group = typeof page?.group === 'string' ? page.group.trim() : '';
            return id && title ? { id, title, ...(group ? { group } : {}) } : null;
        })
        .filter((page): page is HashPageRoutePage => Boolean(page));
}

export function parseHashPage(hash: string): string | null {
    const rawHash = String(hash || '').replace(/^#/, '');
    const pageId = new URLSearchParams(rawHash).get('page');
    return normalizePageId(pageId) || null;
}

export function parseSearchPage(search: string): string | null {
    const rawSearch = String(search || '').replace(/^\?/, '');
    const pageId = new URLSearchParams(rawSearch).get('page');
    return normalizePageId(pageId) || null;
}

export function defineHashPageRoute(
    pages: HashPageRoutePage[],
    options?: { defaultPageId?: string; pageTree?: HashPageTreeNode[] },
): HashPageRoute {
    const normalizedPages = normalizeRoutePages(pages);
    const defaultPageId = normalizePageId(options?.defaultPageId);
    return {
        pages: normalizedPages,
        ...(options?.pageTree ? { pageTree: options.pageTree } : {}),
        defaultPageId: normalizedPages.some((page) => page.id === defaultPageId)
            ? defaultPageId
            : normalizedPages[0]?.id || 'home',
    };
}

function normalizeRouteInput(routeOrDefault?: HashPageRoute | string): HashPageRoute {
    if (routeOrDefault && typeof routeOrDefault === 'object') {
        return defineHashPageRoute(routeOrDefault.pages, routeOrDefault);
    }
    const defaultPageId = normalizePageId(routeOrDefault) || 'home';
    return {
        pages: [],
        defaultPageId,
    };
}

function notifyHostPrototypePageChange(pageId: string) {
    if (typeof window === 'undefined' || window.parent === window) {
        return;
    }
    window.parent.postMessage({
        type: 'AXHUB_PROTOTYPE_PAGE_CHANGE',
        pageId,
    }, '*');
}

function notifyHostPrototypeRouteInfo(
    pages: HashPageRoutePage[],
    defaultPageId: string,
    activePageId: string,
    pageTree?: HashPageTreeNode[],
) {
    if (
        pages.length === 0
        || typeof window === 'undefined'
        || window.parent === window
    ) {
        return;
    }
    window.parent.postMessage({
        type: 'AXHUB_PROTOTYPE_ROUTE_INFO',
        pages,
        ...(pageTree ? { pageTree } : {}),
        defaultPageId,
        activePageId,
    }, '*');
}

export function useHashPage(routeOrDefault: HashPageRoute | string = 'home') {
    const route = normalizeRouteInput(routeOrDefault);
    const { pages, defaultPageId, pageTree } = route;
    const routeSignature = JSON.stringify(route);
    const [page, setPageState] = useState<string>(() => {
        if (typeof window === 'undefined') {
            return defaultPageId;
        }
        return parseHashPage(window.location.hash) ?? parseSearchPage(window.location.search) ?? defaultPageId;
    });

    useEffect(() => {
        notifyHostPrototypeRouteInfo(pages, defaultPageId, page, pageTree);
    }, [routeSignature]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const onHashChange = () => {
            const next = parseHashPage(window.location.hash) ?? parseSearchPage(window.location.search);
            const nextPageId = next ?? defaultPageId;
            setPageState(nextPageId);
            notifyHostPrototypePageChange(nextPageId);
        };

        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [defaultPageId]);

    const setPage = useCallback((pageId: string) => {
        const nextPageId = normalizePageId(pageId);
        if (!nextPageId || typeof window === 'undefined') {
            return;
        }
        window.location.hash = `page=${nextPageId}`;
    }, []);

    return { page, setPage, pages, defaultPageId };
}
