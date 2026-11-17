import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Folder } from 'lucide-react';
import { annotationDocumentPath, pagePrdId, type PagePrdRecords, type PagePrdScope } from '../../../common/pagePrd';
import type { AnnotationDocumentDirectoryNode } from '../../types';
import type { PrototypePageSegment } from '../sidebar/prototypePageGroups';

export interface PagePrdManagementProps {
    scope: PagePrdScope;
    pages: PrototypePageSegment[];
    records: PagePrdRecords;
    onBind: (pageId: string, path: string) => Promise<void>;
    onOpen: (id: string, edit: boolean) => void;
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
    pages, records, onBind, onOpen, documents,
}: PagePrdManagementProps & { documents: ReturnType<typeof collectManagedMarkdown> }) {
    const inputId = useId();
    const [bindingPageId, setBindingPageId] = useState('');
    const [bindingPath, setBindingPath] = useState('');
    const [bindingError, setBindingError] = useState('');
    const [binding, setBinding] = useState(false);

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

    function renderRows(nodes: readonly PrototypePageSegment[], depth = 0) {
        return nodes.map((node) => {
            const pageId = node.kind === 'page' ? node.page.id : '';
            const record = records[pageId];
            const title = node.kind === 'page' ? node.page.title : node.title;
            return (
                <div key={node.key}>
                    <div className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/70" style={{ paddingLeft: 8 + depth * 18 }}>
                        {pageId ? <FileText className="size-4 text-muted-foreground" /> : <Folder className="size-4 text-muted-foreground" />}
                        <div className="min-w-0 flex-1 truncate text-sm" title={record?.path}>{title}</div>
                        {pageId ? (
                            <>
                                <span className="text-xs text-muted-foreground">{record?.missing ? '文件缺失' : record ? '已关联' : '未编写'}</span>
                                <Button variant="ghost" size="sm" onClick={() => onOpen(pagePrdId(pageId), false)}>打开</Button>
                                <Button variant="ghost" size="sm" onClick={() => onOpen(pagePrdId(pageId), true)}>编辑</Button>
                                <Button variant="ghost" size="sm" disabled={binding} onClick={() => {
                                    setBindingPageId(pageId === bindingPageId ? '' : pageId);
                                    setBindingPath(record?.path ?? '');
                                    setBindingError('');
                                }}>{record ? '更换关联' : '关联已有文档'}</Button>
                            </>
                        ) : null}
                    </div>
                    {pageId && pageId === bindingPageId ? (
                        <form className="space-y-1 px-2 pb-2" onSubmit={(event) => { event.preventDefault(); void bind(); }}>
                            <div className="flex gap-2">
                                <Input aria-label="已有 Markdown 文档路径" placeholder="选择文档或输入项目内 Markdown 路径" list={inputId} value={bindingPath} onChange={(event) => setBindingPath(event.target.value)} />
                                <Button type="submit" size="sm" disabled={binding || !bindingPath.trim()}>确认关联</Button>
                            </div>
                            {bindingError ? <p className="text-xs text-destructive" role="alert">{bindingError}</p> : null}
                        </form>
                    ) : null}
                    {renderRows(node.children, depth + 1)}
                </div>
            );
        });
    }

    return (
        <div className="rounded-md border p-2">
            <div className="px-2 py-1 text-sm font-medium">页面 PRD</div>
            <datalist id={inputId}>
                {documents.map((document) => <option key={document.id} value={document.path} label={document.title} />)}
            </datalist>
            {renderRows(pages)}
        </div>
    );
}
