import { Editor } from '@tiptap/core';
import { Highlight } from '@tiptap/extension-highlight';
import { Markdown } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { MakeDocumentTableKit } from './makeDocumentTableKit';

function createEditor(content: unknown, contentType: 'json' | 'markdown' = 'json') {
    return new Editor({
        extensions: [
            Markdown,
            StarterKit,
            MakeDocumentTableKit,
            Highlight.configure({ multicolor: true }),
        ],
        content,
        contentType,
    });
}

function getOnlyTextNode(editor: Editor) {
    const document = editor.getJSON();
    return document.content?.flatMap((block: any) => block.content || [])
        .find((node: any) => node.type === 'text');
}

describe('PRD Markdown color extensions', () => {
    it('round-trips the table created and resized by real TableKit commands', () => {
        const editor = createEditor('页面 PRD', 'markdown');
        expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(true);
        expect(editor.commands.addRowAfter()).toBe(true);
        expect(editor.commands.addColumnAfter()).toBe(true);

        const markdown = editor.getMarkdown();
        const reopened = createEditor(markdown, 'markdown');
        const table = reopened.getJSON().content?.find((node: { type?: string }) => node.type === 'table');
        expect(table?.content).toHaveLength(3);
        expect(table?.content?.every((row: { content?: unknown[] }) => row.content?.length === 3)).toBe(true);

        reopened.destroy();
        editor.destroy();
    });

    it('round-trips text color inside the native background highlight syntax', () => {
        const editor = createEditor({
            type: 'doc',
            content: [{
                type: 'paragraph',
                content: [{
                    type: 'text',
                    text: 'Colored text',
                    marks: [{ type: 'highlight' }],
                }],
            }],
        });
        editor.commands.selectAll();
        expect(editor.commands.setTextColor('#c62828')).toBe(true);

        const markdown = editor.getMarkdown();
        expect(markdown).toContain('==');
        expect(markdown).toContain('data-axhub-text-color="#c62828"');

        const reopened = createEditor(markdown, 'markdown');
        const marks = getOnlyTextNode(reopened)?.marks || [];
        expect(marks).toContainEqual({ type: 'highlight', attrs: { color: null } });
        expect(marks).toContainEqual({ type: 'textColor', attrs: { color: '#c62828' } });
        expect(reopened.getMarkdown()).toBe(markdown);

        reopened.destroy();
        editor.destroy();
    });

    it('clears only the text color while keeping the native background highlight mark', () => {
        const editor = createEditor({
            type: 'doc',
            content: [{
                type: 'paragraph',
                content: [{
                    type: 'text',
                    text: 'Highlighted text',
                    marks: [
                        { type: 'highlight' },
                        { type: 'textColor', attrs: { color: '#c62828' } },
                    ],
                }],
            }],
        });
        editor.commands.selectAll();
        expect(editor.commands.unsetTextColor()).toBe(true);

        const markdown = editor.getMarkdown();
        expect(markdown).toBe('==Highlighted text==');
        expect(markdown).not.toContain('data-axhub-text-color');
        expect(getOnlyTextNode(editor)?.marks).toContainEqual({
            type: 'highlight',
            attrs: { color: null },
        });

        editor.destroy();
    });

    it('keeps the built-in ==highlight== syntax for highlights without a color', () => {
        const editor = createEditor('==Highlighted text==', 'markdown');

        expect(editor.getMarkdown()).toBe('==Highlighted text==');
        expect(getOnlyTextNode(editor)?.marks).toContainEqual({
            type: 'highlight',
            attrs: { color: null },
        });

        editor.destroy();
    });
});
