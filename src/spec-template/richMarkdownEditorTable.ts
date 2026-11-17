export type MarkdownTableAction =
    | 'insertTable'
    | 'addRowBefore'
    | 'addRowAfter'
    | 'deleteRow'
    | 'addColumnBefore'
    | 'addColumnAfter'
    | 'deleteColumn'
    | 'deleteTable';

export interface MarkdownTableCommandChain {
    focus(): MarkdownTableCommandChain;
    insertTable(options: { rows: number; cols: number; withHeaderRow: boolean }): MarkdownTableCommandChain;
    addRowBefore(): MarkdownTableCommandChain;
    addRowAfter(): MarkdownTableCommandChain;
    deleteRow(): MarkdownTableCommandChain;
    addColumnBefore(): MarkdownTableCommandChain;
    addColumnAfter(): MarkdownTableCommandChain;
    deleteColumn(): MarkdownTableCommandChain;
    deleteTable(): MarkdownTableCommandChain;
    run(): boolean;
}

export interface MarkdownTableCommandProbe {
    insertTable(options: { rows: number; cols: number; withHeaderRow: boolean }): boolean;
    addRowBefore(): boolean;
    addRowAfter(): boolean;
    deleteRow(): boolean;
    addColumnBefore(): boolean;
    addColumnAfter(): boolean;
    deleteColumn(): boolean;
    deleteTable(): boolean;
}

export interface MarkdownTableEditor {
    readonly isEditable: boolean;
    chain(): MarkdownTableCommandChain;
    can(): MarkdownTableCommandProbe;
    isActive(name: string): boolean;
}

export const DEFAULT_MARKDOWN_TABLE = {
    rows: 3,
    cols: 3,
    withHeaderRow: true,
} as const;

export function canRunMarkdownTableAction(
    editor: MarkdownTableEditor,
    action: MarkdownTableAction,
): boolean {
    if (!editor.isEditable) return false;

    const commands = editor.can();
    if (action === 'insertTable') {
        return commands.insertTable(DEFAULT_MARKDOWN_TABLE);
    }

    if (!editor.isActive('table')) return false;

    switch (action) {
        case 'addRowBefore':
            return commands.addRowBefore();
        case 'addRowAfter':
            return commands.addRowAfter();
        case 'deleteRow':
            return commands.deleteRow();
        case 'addColumnBefore':
            return commands.addColumnBefore();
        case 'addColumnAfter':
            return commands.addColumnAfter();
        case 'deleteColumn':
            return commands.deleteColumn();
        case 'deleteTable':
            return commands.deleteTable();
    }
}

export function runMarkdownTableAction(
    editor: MarkdownTableEditor,
    action: MarkdownTableAction,
): boolean {
    if (!canRunMarkdownTableAction(editor, action)) return false;

    const chain = editor.chain().focus();
    switch (action) {
        case 'insertTable':
            return chain.insertTable(DEFAULT_MARKDOWN_TABLE).run();
        case 'addRowBefore':
            return chain.addRowBefore().run();
        case 'addRowAfter':
            return chain.addRowAfter().run();
        case 'deleteRow':
            return chain.deleteRow().run();
        case 'addColumnBefore':
            return chain.addColumnBefore().run();
        case 'addColumnAfter':
            return chain.addColumnAfter().run();
        case 'deleteColumn':
            return chain.deleteColumn().run();
        case 'deleteTable':
            return chain.deleteTable().run();
    }
}
