import { describe, expect, it, vi } from 'vitest';
import {
    canRunMarkdownTableAction,
    DEFAULT_MARKDOWN_TABLE,
    runMarkdownTableAction,
    type MarkdownTableAction,
    type MarkdownTableCommandChain,
    type MarkdownTableCommandProbe,
    type MarkdownTableEditor,
} from './richMarkdownEditorTable';

function createEditor(options: {
    editable?: boolean;
    inTable?: boolean;
    canRun?: boolean;
} = {}) {
    const chain = {} as MarkdownTableCommandChain;
    const probe = {} as MarkdownTableCommandProbe;
    const actionNames: MarkdownTableAction[] = [
        'insertTable',
        'addRowBefore',
        'addRowAfter',
        'deleteRow',
        'addColumnBefore',
        'addColumnAfter',
        'deleteColumn',
        'deleteTable',
    ];

    const actionMethods = Object.fromEntries(actionNames.map((action) => [
        action,
        vi.fn(() => chain),
    ])) as unknown as Pick<MarkdownTableCommandChain, MarkdownTableAction>;
    Object.assign(chain, actionMethods, {
        focus: vi.fn(() => chain),
        run: vi.fn(() => true),
    });
    Object.assign(probe, Object.fromEntries(actionNames.map((action) => [
        action,
        vi.fn(() => options.canRun ?? true),
    ])));

    const editor: MarkdownTableEditor = {
        isEditable: options.editable ?? true,
        chain: () => chain,
        can: () => probe,
        isActive: vi.fn(() => options.inTable ?? true),
    };
    return { editor, chain, probe };
}

describe('Markdown TableKit toolbar actions', () => {
    it('inserts a headered 3 × 3 table through the existing TableKit command', () => {
        const { editor, chain, probe } = createEditor();

        expect(canRunMarkdownTableAction(editor, 'insertTable')).toBe(true);
        expect(runMarkdownTableAction(editor, 'insertTable')).toBe(true);
        expect(probe.insertTable).toHaveBeenCalledWith(DEFAULT_MARKDOWN_TABLE);
        expect(chain.focus).toHaveBeenCalledOnce();
        expect(chain.insertTable).toHaveBeenCalledWith(DEFAULT_MARKDOWN_TABLE);
        expect(chain.run).toHaveBeenCalledOnce();
    });

    it.each([
        'addRowBefore',
        'addRowAfter',
        'deleteRow',
        'addColumnBefore',
        'addColumnAfter',
        'deleteColumn',
        'deleteTable',
    ] as const)('runs %s only when the selection is inside an editable table', (action) => {
        const { editor, chain, probe } = createEditor();

        expect(canRunMarkdownTableAction(editor, action)).toBe(true);
        expect(runMarkdownTableAction(editor, action)).toBe(true);
        expect(probe[action]).toHaveBeenCalledTimes(2);
        expect(chain[action]).toHaveBeenCalledOnce();
        expect(chain.run).toHaveBeenCalledOnce();
    });

    it('disables table mutations when the editor is read-only or the selection is outside a table', () => {
        const readOnly = createEditor({ editable: false });
        const outsideTable = createEditor({ inTable: false });

        expect(canRunMarkdownTableAction(readOnly.editor, 'insertTable')).toBe(false);
        expect(canRunMarkdownTableAction(outsideTable.editor, 'deleteRow')).toBe(false);
        expect(readOnly.probe.insertTable).not.toHaveBeenCalled();
        expect(outsideTable.probe.deleteRow).not.toHaveBeenCalled();
    });

    it('respects TableKit command capability at the current selection', () => {
        const { editor, chain } = createEditor({ canRun: false });

        expect(canRunMarkdownTableAction(editor, 'deleteColumn')).toBe(false);
        expect(runMarkdownTableAction(editor, 'deleteColumn')).toBe(false);
        expect(chain.focus).not.toHaveBeenCalled();
    });
});
