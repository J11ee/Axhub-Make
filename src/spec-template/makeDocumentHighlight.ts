import { Highlight as BaseHighlight } from '@tiptap/extension-highlight';
import { DEFAULT_MARKDOWN_HIGHLIGHT, markdownHighlightTag } from '../common/markdown/markdownHighlight';
import { normalizeMarkdownTextColor } from './markdownTextColor';

const presetColors: Record<string, string> = {
    gray: '#f8f8f7',
    brown: '#f4eeee',
    orange: '#fbecdd',
    yellow: DEFAULT_MARKDOWN_HIGHLIGHT,
    green: '#dcfce7',
    blue: '#e0f2fe',
    purple: '#f3e8ff',
    pink: '#fcf1f6',
    red: '#ffe4e6',
};
const presetNames = new Map(Object.entries(presetColors).map(([name, color]) => [color, name]));

function storedColor(value: unknown): string | null {
    const preset = typeof value === 'string' && /^var\(--tt-color-highlight-([a-z]+)\)$/u.exec(value);
    return preset ? presetColors[preset[1]] ?? null : normalizeMarkdownTextColor(value);
}

function editorColor(value: unknown): string | null {
    const color = storedColor(value);
    const preset = color && presetNames.get(color);
    // The native palette compares mark attributes to its CSS variable names.
    return preset ? `var(--tt-color-highlight-${preset})` : color;
}

export const Highlight = BaseHighlight.extend({
    addAttributes() {
        const baseColor = this.parent?.()?.color;
        return {
            color: {
                default: null,
                parseHTML: (element: HTMLElement) => editorColor(baseColor?.parseHTML?.(element)),
                renderHTML: (attributes: { color?: string | null }) => {
                    const color = storedColor(attributes.color) ?? DEFAULT_MARKDOWN_HIGHLIGHT;
                    return { 'data-color': color, style: `background-color: ${color}; color: inherit` };
                },
            },
        };
    },

    renderMarkdown(node: { attrs?: { color?: string | null } }, helpers: { renderChildren(node: unknown): string }) {
        const content = helpers.renderChildren(node);
        const color = storedColor(node.attrs?.color);
        return color ? `${markdownHighlightTag(color)}${content}</mark>` : `==${content}==`;
    },

    markdownTokenizer: {
        name: 'highlight',
        level: 'inline',
        start: (source: string) => source.search(/==|<mark data-color="/iu),
        tokenize(source: string, _tokens: unknown, helpers: { inlineTokens(source: string): unknown[] }) {
            const tagged = /^<mark data-color="(#[\da-f]{6})" style="background-color: \1; color: inherit">([\s\S]+?)<\/mark>/iu.exec(source);
            const legacy = tagged ? null : /^==([^=]+)==/u.exec(source);
            const match = tagged ?? legacy;
            if (!match) return undefined;
            const content = tagged ? tagged[2] : match[1].trim();
            return {
                type: 'highlight',
                raw: match[0],
                color: tagged ? editorColor(tagged[1]) : null,
                tokens: helpers.inlineTokens(content),
            };
        },
    },

    parseMarkdown(token: { color?: string | null; tokens: unknown[] }, helpers: {
        parseInline(tokens: unknown[]): unknown;
        applyMark(mark: string, content: unknown, attrs?: Record<string, unknown>): unknown;
    }) {
        return helpers.applyMark('highlight', helpers.parseInline(token.tokens), { color: token.color ?? null });
    },
});
