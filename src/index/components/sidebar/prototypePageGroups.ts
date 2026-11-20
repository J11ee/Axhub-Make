import type { PrototypePageTreeNode } from '../../types';

export interface PrototypePageItem {
  id: string;
  title: string;
  group?: string;
}

export type PrototypePageSegment =
  | { kind: 'page'; key: string; page: PrototypePageItem; children: PrototypePageSegment[] }
  | { kind: 'group'; key: string; title: string; children: PrototypePageSegment[] };

export function normalizePrototypePageTree(
  value: unknown,
  pages: readonly PrototypePageItem[],
): PrototypePageTreeNode[] | undefined {
  const unusedPages = new Set(pages.map(({ id }) => id));
  const seenGroups = new Set<string>();

  function visit(nodes: unknown): PrototypePageTreeNode[] {
    if (!Array.isArray(nodes)) return [];
    const normalized: PrototypePageTreeNode[] = [];

    for (const node of nodes) {
      const id = typeof node?.id === 'string' ? node.id.trim() : '';
      if (node?.kind === 'page' && unusedPages.delete(id)) {
        const children = visit(node.children);
        normalized.push({ kind: 'page', id, ...(children.length ? { children } : {}) });
      } else if (node?.kind === 'group' && id && !seenGroups.has(id)) {
        const title = typeof node.title === 'string' ? node.title.trim() : '';
        if (!title) continue;
        seenGroups.add(id);
        const children = visit(node.children);
        if (children.length) normalized.push({ kind: 'group', id, title, children });
      }
    }
    return normalized;
  }

  const tree = visit(value);
  if (tree.length === 0) return undefined;
  for (const id of unusedPages) tree.push({ kind: 'page', id });
  return tree;
}

export function buildPrototypePageSegments(
  prototypeId: string,
  pages: readonly PrototypePageItem[],
  pageTree?: readonly PrototypePageTreeNode[],
): PrototypePageSegment[] {
  const pageNode = (page: PrototypePageItem, children: PrototypePageSegment[] = []): PrototypePageSegment => ({
    kind: 'page',
    key: `${prototypeId}:page:${page.id}`,
    page,
    children,
  });

  if (pageTree) {
    const pagesById = new Map(pages.map((page) => [page.id, page]));
    function build(nodes: readonly PrototypePageTreeNode[]): PrototypePageSegment[] {
      return nodes.flatMap((node): PrototypePageSegment[] => {
        const children = build(node.children ?? []);
        if (node.kind === 'group') {
          return [{ kind: 'group', key: `${prototypeId}:folder:${node.id}`, title: node.title, children }];
        }
        const page = pagesById.get(node.id);
        return page ? [pageNode(page, children)] : [];
      });
    }
    return build(pageTree);
  }

  const segments: PrototypePageSegment[] = [];
  pages.forEach((page, index) => {
    const group = typeof page.group === 'string' ? page.group.trim() : '';
    const { group: _discardedGroup, ...ungroupedPage } = page;
    const node = pageNode(group ? { ...page, group } : ungroupedPage);
    if (!group) {
      segments.push(node);
      return;
    }

    const previous = segments[segments.length - 1];
    if (previous?.kind === 'group' && previous.title === group) {
      previous.children.push(node);
    } else {
      segments.push({ kind: 'group', key: `${prototypeId}:group:${index}`, title: group, children: [node] });
    }
  });

  return segments;
}

export function getPrototypePageBranchKeys(
  segments: readonly PrototypePageSegment[],
  kind?: PrototypePageSegment['kind'],
): string[] {
  return segments.flatMap((segment) => {
    if (segment.children.length === 0) return [];
    const children = getPrototypePageBranchKeys(segment.children, kind);
    return !kind || segment.kind === kind ? [segment.key, ...children] : children;
  });
}

export function findPrototypePageAncestorKeys(
  segments: readonly PrototypePageSegment[],
  pageId: string | null | undefined,
): string[] {
  if (!pageId) return [];

  function visit(nodes: readonly PrototypePageSegment[], ancestors: string[]): string[] | undefined {
    for (const node of nodes) {
      if (node.kind === 'page' && node.page.id === pageId) return ancestors;
      if (node.children.length) {
        const match = visit(node.children, [...ancestors, node.key]);
        if (match) return match;
      }
    }
    return undefined;
  }

  return visit(segments, []) ?? [];
}
