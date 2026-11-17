import { Mark, mergeAttributes } from '@tiptap/core';

export const MARKDOWN_TEXT_COLOR_MARK = 'textColor';

export function normalizeMarkdownTextColor(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const color = value.trim().toLowerCase();
    const match = /^#([\da-f]{3}|[\da-f]{6})$/u.exec(color);
    if (!match) return null;
    if (match[1].length === 3) {
        return `#${[...match[1]].map((channel) => `${channel}${channel}`).join('')}`;
    }
    return color;
}

function parseColorFromElement(element: HTMLElement): string | null {
    const dataColor = normalizeMarkdownTextColor(element.getAttribute('data-axhub-text-color'));
    if (dataColor) return dataColor;

    const style = element.getAttribute('style') || '';
    const match = /(?:^|;)\s*color\s*:\s*(#[\da-f]{3}(?:[\da-f]{3})?)\s*(?:;|$)/iu.exec(style);
    return normalizeMarkdownTextColor(match?.[1]);
}

function addMarkToTextNodes(
    content: unknown,
    markType: string,
    attrs?: Record<string, unknown>,
): unknown {
    if (!Array.isArray(content)) return content;
    return content.map((node) => {
        if (!node || typeof node !== 'object') return node;
        const current = node as { type?: string; marks?: Array<Record<string, unknown>>; content?: unknown };
        if (current.type === 'text') {
            const mark = attrs ? { type: markType, attrs } : { type: markType };
            return { ...current, marks: [...(current.marks || []), mark] };
        }
        return Array.isArray(current.content)
            ? { ...current, content: addMarkToTextNodes(current.content, markType, attrs) }
            : current;
    });
}

function markdownTextColorStart(source: string): number {
    const lowerSource = source.toLowerCase();
    const highlightedIndex = lowerSource.indexOf('==<span data-axhub-text-color=');
    const colorOnlyIndex = lowerSource.indexOf('<span data-axhub-text-color=');
    if (highlightedIndex === -1) return colorOnlyIndex;
    if (colorOnlyIndex === -1) return highlightedIndex;
    return Math.min(highlightedIndex, colorOnlyIndex);
}

export const MarkdownTextColor = Mark.create({
    name: MARKDOWN_TEXT_COLOR_MARK,

    addAttributes() {
        return {
            color: {
                default: null,
                parseHTML: (element: HTMLElement) => parseColorFromElement(element),
                renderHTML: (attributes: { color?: string | null }) => {
                    const color = normalizeMarkdownTextColor(attributes.color);
                    if (!color) return {};
                    return {
                        'data-axhub-text-color': color,
                        style: `color: ${color}`,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            { tag: 'span[data-axhub-text-color]' },
            { tag: 'span[style*="color"]' },
        ];
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
        return ['span', mergeAttributes(HTMLAttributes), 0];
    },

    renderMarkdown(node: { attrs?: { color?: string | null } }, helpers: { renderChildren(node: unknown): string }) {
        const color = normalizeMarkdownTextColor(node.attrs?.color);
        if (!color) return helpers.renderChildren(node);
        return `<span data-axhub-text-color="${color}" style="color: ${color}">${helpers.renderChildren(node)}</span>`;
    },

    markdownTokenizer: {
        name: MARKDOWN_TEXT_COLOR_MARK,
        level: 'inline',
        start: markdownTextColorStart,
        tokenize(source: string, _tokens: unknown, helpers: { inlineTokens(source: string): unknown[] }) {
            const wrapsHighlight = source.startsWith('==');
            const sourceAfterHighlight = wrapsHighlight ? source.slice(2) : source;
            const openingTag = /^<span\b[^>]*>/iu.exec(sourceAfterHighlight)?.[0];
            if (!openingTag) return undefined;

            const colorMatch = /\bdata-axhub-text-color\s*=\s*["'](#[\da-f]{3}(?:[\da-f]{3})?)["']/iu.exec(openingTag);
            const color = normalizeMarkdownTextColor(colorMatch?.[1]);
            const closingIndex = sourceAfterHighlight.toLowerCase().indexOf('</span>', openingTag.length);
            if (!color || closingIndex === -1) return undefined;

            const innerContent = sourceAfterHighlight.slice(openingTag.length, closingIndex);
            const closingTagEnd = closingIndex + '</span>'.length;
            if (wrapsHighlight && sourceAfterHighlight.slice(closingTagEnd, closingTagEnd + 2) !== '==') {
                return undefined;
            }
            const spanMarkup = `${openingTag}${innerContent}</span>`;
            const raw = wrapsHighlight ? `==${spanMarkup}==` : spanMarkup;
            return {
                type: MARKDOWN_TEXT_COLOR_MARK,
                raw,
                text: innerContent,
                color,
                wrapsHighlight,
                tokens: helpers.inlineTokens(innerContent),
            };
        },
    },

    parseMarkdown(token: { color?: unknown; tokens?: unknown[]; wrapsHighlight?: boolean }, helpers: {
        parseInline(tokens: unknown[]): unknown;
        applyMark(mark: string, content: unknown, attrs?: Record<string, unknown>): unknown;
    }) {
        const color = normalizeMarkdownTextColor(token.color);
        const content = helpers.parseInline(token.tokens || []);
        if (color && token.wrapsHighlight) {
            const highlighted = addMarkToTextNodes(content, 'highlight');
            return addMarkToTextNodes(highlighted, MARKDOWN_TEXT_COLOR_MARK, { color });
        }
        return color
            ? helpers.applyMark(MARKDOWN_TEXT_COLOR_MARK, content, { color })
            : content;
    },

    addCommands() {
        return {
            setTextColor: (inputColor: string) => ({ commands }: { commands: {
                setMark(mark: string, attributes: Record<string, unknown>): boolean;
            } }) => {
                const color = normalizeMarkdownTextColor(inputColor);
                return color ? commands.setMark(MARKDOWN_TEXT_COLOR_MARK, { color }) : false;
            },
            unsetTextColor: () => ({ commands }: { commands: {
                unsetMark(mark: string): boolean;
            } }) => commands.unsetMark(MARKDOWN_TEXT_COLOR_MARK),
        };
    },
});
