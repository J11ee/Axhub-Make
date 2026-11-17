import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Palette, Plus, Table2, Trash2 } from 'lucide-react';
import { SimpleEditor, type SimpleEditorProps } from 'tiptap-editor?make-document-editor';
import {
    canRunMarkdownTableAction,
    runMarkdownTableAction,
    type MarkdownTableAction,
    type MarkdownTableCommandChain,
    type MarkdownTableEditor,
} from './richMarkdownEditorTable';
import { normalizeMarkdownTextColor } from './markdownTextColor';

interface MarkdownTableEditorEvents extends MarkdownTableEditor {
    on(eventName: 'transaction' | 'selectionUpdate', listener: () => void): void;
    off(eventName: 'transaction' | 'selectionUpdate', listener: () => void): void;
}

type MarkdownTextColorCommandChain = Omit<MarkdownTableCommandChain, 'focus'> & {
    focus(): MarkdownTextColorCommandChain;
    setTextColor(color: string): MarkdownTextColorCommandChain;
    unsetTextColor(): MarkdownTextColorCommandChain;
};

type MarkdownTextColorEditor = Omit<MarkdownTableEditorEvents, 'chain'> & {
    chain(): MarkdownTextColorCommandChain;
    getAttributes(name: string): { color?: unknown };
};

const tableActions: Array<{
    action: MarkdownTableAction;
    label: string;
    icon: typeof Plus;
}> = [
    { action: 'insertTable', label: '插入 3 × 3 表格', icon: Table2 },
    { action: 'addRowBefore', label: '在上方插入行', icon: Plus },
    { action: 'addRowAfter', label: '在下方插入行', icon: Plus },
    { action: 'deleteRow', label: '删除当前行', icon: Trash2 },
    { action: 'addColumnBefore', label: '在左侧插入列', icon: Plus },
    { action: 'addColumnAfter', label: '在右侧插入列', icon: Plus },
    { action: 'deleteColumn', label: '删除当前列', icon: Trash2 },
    { action: 'deleteTable', label: '删除表格', icon: Trash2 },
];

function TableToolbar({ editor }: { editor: MarkdownTableEditorEvents }) {
    const [, setRevision] = useState(0);

    useEffect(() => {
        const refresh = () => setRevision((value) => value + 1);
        editor.on('transaction', refresh);
        editor.on('selectionUpdate', refresh);
        return () => {
            editor.off('transaction', refresh);
            editor.off('selectionUpdate', refresh);
        };
    }, [editor]);

    return (
        <div className="tiptap-toolbar-group" role="group" aria-label="表格操作">
            <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className="tiptap-button"
                        data-style="ghost"
                        aria-label="表格操作"
                        title="表格操作"
                        disabled={!editor.isEditable}
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <Table2 className="tiptap-button-icon" aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        className="tiptap-dropdown-menu"
                        align="start"
                        sideOffset={4}
                        collisionPadding={8}
                    >
                        <div className="tiptap-card">
                            <div className="tiptap-card-body">
                                <DropdownMenu.Label className="tiptap-card-group-label">
                                    表格
                                </DropdownMenu.Label>
                                <div className="tiptap-button-group" data-orientation="vertical">
                                    {tableActions.map(({ action, label, icon: Icon }) => {
                                        const disabled = !canRunMarkdownTableAction(editor, action);
                                        return (
                                            <DropdownMenu.Item
                                                key={action}
                                                asChild
                                                disabled={disabled}
                                                onSelect={() => runMarkdownTableAction(editor, action)}
                                            >
                                                <button
                                                    type="button"
                                                    className="tiptap-button"
                                                    data-style="ghost"
                                                    disabled={disabled}
                                                    onMouseDown={(event) => event.preventDefault()}
                                                >
                                                    <Icon className="tiptap-button-icon" aria-hidden="true" />
                                                    <span className="tiptap-button-text">{label}</span>
                                                </button>
                                            </DropdownMenu.Item>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    );
}

function TextColorToolbar({ editor }: { editor: MarkdownTextColorEditor }) {
    const [, setRevision] = useState(0);
    const currentColor = normalizeMarkdownTextColor(editor.getAttributes('textColor').color);

    useEffect(() => {
        const refresh = () => setRevision((value) => value + 1);
        editor.on('transaction', refresh);
        editor.on('selectionUpdate', refresh);
        return () => {
            editor.off('transaction', refresh);
            editor.off('selectionUpdate', refresh);
        };
    }, [editor]);

    return (
        <div className="tiptap-toolbar-group" role="group" aria-label="文字颜色">
            <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className="tiptap-button"
                        data-style="ghost"
                        data-active-state={currentColor ? 'on' : 'off'}
                        aria-label="文字颜色"
                        title="文字颜色"
                        disabled={!editor.isEditable}
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <Palette className="tiptap-button-icon" aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        className="tiptap-dropdown-menu"
                        align="start"
                        sideOffset={4}
                        collisionPadding={8}
                    >
                        <div className="tiptap-card">
                            <div className="tiptap-card-body">
                                <DropdownMenu.Label className="tiptap-card-group-label">
                                    文字颜色
                                </DropdownMenu.Label>
                                <label
                                    className="tiptap-button-group"
                                    data-orientation="horizontal"
                                    style={{ alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.5rem' }}
                                >
                                    <span className="tiptap-button-text">自定义颜色</span>
                                    <input
                                        type="color"
                                        aria-label="选择文字颜色"
                                        value={currentColor || '#000000'}
                                        disabled={!editor.isEditable}
                                        onChange={(event) => {
                                            editor.chain().focus().setTextColor(event.currentTarget.value).run();
                                        }}
                                        style={{
                                            width: '2rem',
                                            height: '2rem',
                                            padding: '0.125rem',
                                            border: '1px solid var(--tt-gray-light-a-100)',
                                            borderRadius: 'var(--tt-radius-lg, 0.75rem)',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                        }}
                                    />
                                </label>
                                <DropdownMenu.Item
                                    asChild
                                    disabled={!editor.isEditable || !currentColor}
                                    onSelect={() => editor.chain().focus().unsetTextColor().run()}
                                >
                                    <button
                                        type="button"
                                        className="tiptap-button"
                                        data-style="ghost"
                                        disabled={!editor.isEditable || !currentColor}
                                        onMouseDown={(event) => event.preventDefault()}
                                    >
                                        <Trash2 className="tiptap-button-icon" aria-hidden="true" />
                                        <span className="tiptap-button-text">清除文字颜色</span>
                                    </button>
                                </DropdownMenu.Item>
                            </div>
                        </div>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    );
}

/**
 * Adds PRD-only TableKit controls to SimpleEditor's existing toolbar.
 * The native SimpleEditor owns the editor schema, toolbar, and styles.
 */
export function PrdMarkdownEditor(props: SimpleEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onEditorReadyRef = useRef(props.onEditorReady);
    const [editor, setEditor] = useState<MarkdownTextColorEditor | null>(null);
    const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
    onEditorReadyRef.current = props.onEditorReady;

    const handleEditorReady = useCallback((value: unknown | null) => {
        setEditor(value as MarkdownTextColorEditor | null);
        onEditorReadyRef.current?.(value);
    }, []);

    useEffect(() => {
        if (!editor) return;
        const toolbarElement = containerRef.current?.querySelector<HTMLElement>(
            '.simple-editor-wrapper > .tiptap-toolbar',
        ) ?? null;
        setToolbar(toolbarElement);
    }, [editor]);

    return (
        <div ref={containerRef} className="prd-rich-markdown-editor">
            <SimpleEditor {...props} onEditorReady={handleEditorReady} />
            {editor && toolbar ? createPortal(
                <>
                    <TableToolbar editor={editor} />
                    <TextColorToolbar editor={editor} />
                </>,
                toolbar,
            ) : null}
        </div>
    );
}
