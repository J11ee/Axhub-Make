import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CircleAlert, File, Folder } from 'lucide-react';
import { annotationDocumentPath, buildPagePrdTree, getActivePagePrdPaths, numberedPrdTitle, PRD_OVERVIEW_ID, type PagePrdPlacement, type PagePrdRecords, type PagePrdScope, type PagePrdTreeNode } from '../../../common/pagePrd';
import type { AnnotationDocumentDirectoryNode } from '../../types';
import type { PrototypePageSegment } from '../sidebar/prototypePageGroups';

export interface PagePrdManagementProps {
    scope: PagePrdScope;
    pages: PrototypePageSegment[];
    records: PagePrdRecords;
    onBind: (pageId: string, path: string) => Promise<void>;
    onOpen: (id: string, edit: boolean) => void;
    onCreateAt?: (placement: PagePrdPlacement) => Promise<boolean>;
    onPlaceDocument?: (nodeId: string, placement: PagePrdPlacement) => Promise<boolean>;
}

export function collectManagedMarkdown(nodes: readonly AnnotationDocumentDirectoryNode[], scope: PagePrdScope) {
    const files: { id: string; path: string; title: string }[] = [];
    const visit = (items: readonly AnnotationDocumentDirectoryNode[]) => {
        for (const node of items) {
            if (node.type === 'markdown' && node.markdownPath) {
                files.push({ id: node.id, title: node.title, path: annotationDocumentPath(scope, node.markdownPath) });
            }
            if (node.children) visit(node.children);
        }
    };
    visit(nodes);
    return files;
}

export default function PagePrdManagement({
    scope, pages, records, onBind, onOpen, onCreateAt, onPlaceDocument,
    tree, creating, onCancelCreate, renderDocument,
}: PagePrdManagementProps & {
    tree: AnnotationDocumentDirectoryNode[];
    creating: boolean;
    onCancelCreate: () => void;
    renderDocument: (node: PagePrdTreeNode, depth: number, onPlace?: () => void) => ReactNode;
}) {
    const inputId = useId();
    const [bindingPageId, setBindingPageId] = useState('');
    const [bindingPath, setBindingPath] = useState('');
    const [bindingError, setBindingError] = useState('');
    const [binding, setBinding] = useState(false);
    const [movingId, setMovingId] = useState('');
    const [placement, setPlacement] = useState<PagePrdPlacement>({ parentId: PRD_OVERVIEW_ID });
    const [placing, setPlacing] = useState(false);
    const [wasCreating, setWasCreating] = useState(creating);
    if (creating !== wasCreating) {
        setWasCreating(creating);
        if (creating) {
            setMovingId('');
            setPlacement({ parentId: PRD_OVERVIEW_ID });
        }
    }

    const nodes = useMemo(() => buildPagePrdTree(pages, records, tree, scope), [pages, records, tree, scope]);
    const parents = useMemo(() => {
        const collect = (items: PagePrdTreeNode[]): PagePrdTreeNode[] => items.flatMap((node) =>
            node.document?.type === 'markdown' || node.document?.type === 'html' ? [] : [node, ...collect(node.children)]);
        return collect(nodes);
    }, [nodes]);
    const parent = parents.find((node) => node.id === placement.parentId);
    const boundPaths = getActivePagePrdPaths(pages, records);
    const documents = collectManagedMarkdown(tree, scope).filter((document) => !boundPaths.has(document.path));
    const parentSelect = useRef<HTMLSelectElement>(null);

    useEffect(() => {
        if (creating || movingId) parentSelect.current?.focus();
    }, [creating, movingId]);

    async function bind() {
        setBinding(true);
        setBindingError('');
        try {
            await onBind(bindingPageId, bindingPath.trim());
            setBindingPageId('');
        } catch (error) {
            setBindingError(error instanceof Error ? error.message : String(error));
        } finally {
            setBinding(false);
        }
    }

    async function savePlacement() {
        setPlacing(true);
        try {
            const saved = creating ? await onCreateAt?.(placement) : await onPlaceDocument?.(movingId, placement);
            if (saved) cancelPlacement();
        } finally {
            setPlacing(false);
        }
    }

    function cancelPlacement() {
        onCancelCreate();
        setMovingId('');
        setPlacement({ parentId: PRD_OVERVIEW_ID });
    }

    function renderRows(items: readonly PagePrdTreeNode[], depth = 0, parentId = PRD_OVERVIEW_ID) {
        return items.map((node, index) => {
            const pageId = node.pageId;
            const record = pageId ? records[pageId] : undefined;
            const title = numberedPrdTitle(node);
            const missingReason = node.status === 'unbound' ? '尚未关联或编写页面 PRD' : node.status === 'missing' ? '已关联的 Markdown 文件缺失' : '';
            return (
                <div key={node.id}>
                    {node.kind === 'markdown' || node.kind === 'html' ? renderDocument(node, depth,
                        node.kind === 'markdown' && onPlaceDocument ? () => {
                            onCancelCreate();
                            setMovingId(node.id);
                            const next = items[index + 1];
                            setPlacement({ parentId, ...(next ? { beforeId: next.id } : {}) });
                        } : undefined) : (
                        <div className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/70" style={{ paddingLeft: 8 + depth * 18 }}>
                            {pageId ? (
                                <File className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                                <Folder className="size-4 shrink-0 fill-blue-500/20 text-blue-600 dark:fill-blue-500/30 dark:text-blue-400" />
                            )}
                            <div className="min-w-0 flex-1 truncate text-sm" title={record?.path ?? title}>{title}</div>
                            {missingReason ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span tabIndex={0} role="img" aria-label={missingReason} className="text-muted-foreground">
                                            <CircleAlert className="size-4" aria-hidden="true" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{missingReason}</TooltipContent>
                                </Tooltip>
                            ) : null}
                            {pageId ? (
                                <>
                                    {record ? (
                                        <>
                                            <Button variant="ghost" size="sm" onClick={() => onOpen(node.id, false)}>打开</Button>
                                            <Button variant="ghost" size="sm" onClick={() => onOpen(node.id, true)}>编辑</Button>
                                        </>
                                    ) : null}
                                    <Button variant="ghost" size="sm" disabled={binding} onClick={() => {
                                        setBindingPageId(pageId === bindingPageId ? '' : pageId);
                                        setBindingPath(record?.path ?? '');
                                        setBindingError('');
                                    }}>{record ? '更换关联' : '关联已有文档'}</Button>
                                </>
                            ) : null}
                        </div>
                    )}
                    {pageId && pageId === bindingPageId ? (
                        <form className="space-y-1 px-2 pb-2" onSubmit={(event) => { event.preventDefault(); void bind(); }}>
                            <div className="flex gap-2">
                                <Input aria-label="已有 Markdown 文档路径" placeholder="选择文档或输入项目内 Markdown 路径" list={inputId} value={bindingPath} onChange={(event) => setBindingPath(event.target.value)} />
                                <Button type="submit" size="sm" disabled={binding || !bindingPath.trim()}>确认关联</Button>
                            </div>
                            <p className="text-xs text-muted-foreground">项目文档目录中的文件会移入当前原型，原路径将失效。</p>
                            {bindingError ? <p className="text-xs text-destructive" role="alert">{bindingError}</p> : null}
                        </form>
                    ) : null}
                    {renderRows(node.children, depth + 1, node.id)}
                </div>
            );
        });
    }

    return (
        <div className="rounded-md border p-2">
            <datalist id={inputId}>
                {documents.map((document) => <option key={document.id} value={document.path} label={document.title} />)}
            </datalist>
            {creating || movingId ? (
                <form className="mb-2 flex flex-wrap items-end gap-2 border-b p-2" onSubmit={(event) => {
                    event.preventDefault();
                    void savePlacement();
                }}>
                    <label className="grid min-w-0 flex-1 gap-1 text-xs">
                        所属章节或目录
                        <select ref={parentSelect} className="h-8 min-w-0 rounded-md border bg-background px-2 text-sm" value={placement.parentId}
                            onChange={(event) => setPlacement({ parentId: event.target.value })}>
                            {parents.map((node) => <option key={node.id} value={node.id}>{numberedPrdTitle(node)}</option>)}
                        </select>
                    </label>
                    <label className="grid min-w-0 flex-1 gap-1 text-xs">
                        插入位置
                        <select className="h-8 min-w-0 rounded-md border bg-background px-2 text-sm" value={placement.beforeId ?? ''}
                            onChange={(event) => setPlacement({ parentId: placement.parentId, beforeId: event.target.value || undefined })}>
                            <option value="">放在末尾</option>
                            {parent?.children.filter((node) => node.id !== movingId).map((node) => (
                                <option key={node.id} value={node.id}>
                                    在{node.kind === 'page' || node.kind === 'group' ? '原型' : '文档目录项'}「{numberedPrdTitle(node)}」之前
                                </option>
                            ))}
                        </select>
                    </label>
                    <Button type="submit" size="sm" disabled={placing || !parent}>{creating ? '创建文档' : '保存位置'}</Button>
                    <Button type="button" variant="ghost" size="sm" disabled={placing} onClick={cancelPlacement}>取消</Button>
                </form>
            ) : null}
            {renderRows(nodes)}
        </div>
    );
}
